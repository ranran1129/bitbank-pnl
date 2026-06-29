import { NextRequest, NextResponse } from "next/server";
import { BitbankClient, SPOT_PAIRS } from "@/lib/bitbank";
import {
  calcMovingAverage,
  calcTotalAverage,
  filterByPeriod,
  groupByPeriod,
  type CalcMethod,
  type PeriodType,
  type MarketType,
} from "@/lib/calc";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const apiKey = body.apiKey as string;
    const apiSecret = body.apiSecret as string;
    const method = (body.method ?? "moving_average") as CalcMethod;
    const period = (body.period ?? "monthly") as PeriodType;
    const market = (body.market ?? "all") as MarketType;

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "APIキーとシークレットが必要です" }, { status: 400 });
    }

    const client = new BitbankClient(apiKey, apiSecret);

    // 残高・ティッカーを並列取得
    const [assetsRes, tickers] = await Promise.all([
      client.getAssets(),
      BitbankClient.getMultiTicker(SPOT_PAIRS),
    ]);

    // 現物取引履歴を順番に取得（並列だとレート制限エラーになる）
    let spotTrades: import("@/lib/calc").BitbankTrade[] = [];
    if (market !== "margin") {
      spotTrades = await client.getAllSpotTrades(SPOT_PAIRS);
    }

    // 信用取引ポジション
    let closedMarginPositions: import("@/lib/calc").BitbankMarginPosition[] = [];
    let openMarginPositions: import("@/lib/calc").BitbankMarginPosition[] = [];

    if (market !== "spot") {
      try {
        const [closedRes, openRes] = await Promise.all([
          client.getMarginPositions("closed"),
          client.getOpenMarginPositions(),
        ]);
        closedMarginPositions = closedRes.positions ?? [];
        openMarginPositions = openRes.positions ?? [];
      } catch {
        // 信用取引未対応アカウントはスキップ
      }
    }

    // 期間内のtrade_idセットを作成
    const filteredSpot = filterByPeriod(spotTrades, period);
    const periodTradeIds = new Set(filteredSpot.map((t) => t.trade_id));

    // 損益計算
    // 移動平均法: 全履歴で正しいavgCostを維持しつつ、期間内の売りのみP&Lを集計
    // 総平均法: 期間内取引の総平均から損益を計算し、保有qty/avgCostは全履歴ベース
    const spotState =
      method === "moving_average"
        ? calcMovingAverage(spotTrades, periodTradeIds)
        : calcTotalAverage(filteredSpot, spotTrades);

    // 現物実現損益集計（銘柄ごと勝敗もカウント）
    let spotRealized = 0;
    let spotWins = 0;
    let spotLosses = 0;
    Array.from(spotState.values()).forEach((s) => {
      spotRealized += s.realized;
      if (s.realized > 0) spotWins++;
      else if (s.realized < 0) spotLosses++;
    });

    // 信用取引: 期間フィルタ（filterByPeriod互換）
    const filteredMargin = closedMarginPositions.filter((p) => {
      if (period === "all") return true;
      const d = new Date(p.closed_at ?? p.created_at);
      const now = new Date();
      if (period === "daily") {
        return (
          d.getFullYear() === now.getFullYear() &&
          d.getMonth() === now.getMonth() &&
          d.getDate() === now.getDate()
        );
      }
      if (period === "weekly") {
        const dayOfWeek = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
        monday.setHours(0, 0, 0, 0);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);
        return d >= monday && d <= sunday;
      }
      if (period === "monthly") {
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }
      if (period === "yearly") {
        return d.getFullYear() === now.getFullYear();
      }
      return true;
    });

    // 信用実現損益
    let marginRealized = 0;
    filteredMargin.forEach((p) => {
      marginRealized += parseFloat(p.profit_loss ?? "0");
    });

    // 現物未実現損益（全保有ポジションに対して計算）
    let spotUnrealized = 0;
    const byAsset: {
      asset: string;
      realized: number;
      unrealized: number;
      avgCost: number;
      currentPrice: number;
      quantity: number;
    }[] = [];

    Array.from(spotState.entries()).forEach(([asset, s]) => {
      const pair = asset.toLowerCase() + "_jpy";
      const ticker = tickers[pair];
      const currentPrice = ticker ? parseFloat(ticker.last) : 0;
      const unrealized = s.qty > 0 ? s.qty * (currentPrice - s.avgCost) : 0;
      spotUnrealized += unrealized;
      if (s.qty > 0 || s.realized !== 0) {
        byAsset.push({
          asset,
          realized: s.realized,
          unrealized,
          avgCost: s.avgCost,
          currentPrice,
          quantity: s.qty,
        });
      }
    });

    // 信用未実現損益（オープンポジション）
    let marginUnrealized = 0;
    openMarginPositions.forEach((p) => {
      marginUnrealized += parseFloat(p.profit_loss ?? "0");
    });

    // 市場別集計
    const totalRealized =
      market === "spot"
        ? spotRealized
        : market === "margin"
        ? marginRealized
        : spotRealized + marginRealized;

    const totalUnrealized =
      market === "spot"
        ? spotUnrealized
        : market === "margin"
        ? marginUnrealized
        : spotUnrealized + marginUnrealized;

    // チャート用データ: 期間内取引をグループ化し、各グループの損益を集計
    const groups = groupByPeriod(filteredSpot, period);
    const records = groups.map((g) => {
      const groupIds = new Set(g.trades.map((t) => t.trade_id));
      const st = calcMovingAverage(spotTrades, groupIds);
      let r = 0;
      Array.from(st.values()).forEach((s) => {
        r += s.realized;
      });
      return {
        label: g.label,
        realized: r,
        tradeCount: g.trades.filter((t) => t.side === "sell").length,
      };
    });

    const totalTrades =
      filteredSpot.filter((t) => t.side === "sell").length + filteredMargin.length;
    const winRate =
      spotWins + spotLosses > 0
        ? Math.round((spotWins / (spotWins + spotLosses)) * 100)
        : 0;

    return NextResponse.json({
      totalRealized,
      totalUnrealized,
      totalPnL: totalRealized + totalUnrealized,
      tradeCount: totalTrades,
      winRate,
      records,
      byAsset: byAsset.sort((a, b) => b.realized - a.realized),
      balances: assetsRes.assets.filter((a) => parseFloat(a.onhand_amount) > 0),
      tickers,
      marginPositions: openMarginPositions,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
