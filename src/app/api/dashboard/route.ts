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
  type BitbankTrade,
  type BitbankOpenPosition,
} from "@/lib/calc";

const MIN_QTY = 1e-8; // 浮動小数点誤差を除外する閾値

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

    const [assetsRes, tickers] = await Promise.all([
      client.getAssets(),
      BitbankClient.getMultiTicker(SPOT_PAIRS),
    ]);

    const { trades: allTrades, errors: fetchErrors } = await client.getAllSpotTrades(SPOT_PAIRS);

    // position_side で現物と信用を分離
    const spotTrades: BitbankTrade[] = allTrades.filter(
      (t) => t.position_side !== "long" && t.position_side !== "short"
    );
    const marginTrades: BitbankTrade[] = allTrades.filter(
      (t) => t.position_side === "long" || t.position_side === "short"
    );

    // 信用オープンポジション
    let openMarginPositions: BitbankOpenPosition[] = [];
    if (market !== "spot") {
      try {
        const res = await client.getOpenMarginPositions();
        openMarginPositions = (res.positions ?? []).filter(
          (p) => parseFloat(p.open_amount) > 0
        );
      } catch {
        // 信用取引未対応アカウントはスキップ
      }
    }

    // ===== 現物 P&L 計算 =====
    const filteredSpot = market !== "margin" ? filterByPeriod(spotTrades, period) : [];
    const periodSpotIds = new Set(filteredSpot.map((t) => t.trade_id));

    // 期間サマリー用（上部カードの実現損益）
    const spotStatePeriod =
      method === "moving_average"
        ? calcMovingAverage(spotTrades, periodSpotIds)
        : calcTotalAverage(filteredSpot, spotTrades);

    // 全期間用（銘柄別詳細テーブルの実現損益・保有数量）
    const spotStateAllTime = calcMovingAverage(spotTrades, null);

    let spotRealized = 0;
    let spotWins = 0;
    let spotLosses = 0;
    Array.from(spotStatePeriod.values()).forEach((s) => {
      spotRealized += s.realized;
      if (s.realized > 0) spotWins++;
      else if (s.realized < 0) spotLosses++;
    });

    // 未実現損益と銘柄別詳細は全期間の保有状況から計算
    let spotUnrealized = 0;
    const byAsset: {
      asset: string;
      realized: number;
      unrealized: number;
      avgCost: number;
      currentPrice: number;
      quantity: number;
    }[] = [];

    Array.from(spotStateAllTime.entries()).forEach(([asset, s]) => {
      if (s.qty < MIN_QTY && s.realized === 0) return; // 浮動小数点誤差・取引なし銘柄を除外
      const pair = asset.toLowerCase() + "_jpy";
      const ticker = tickers[pair];
      const currentPrice = ticker ? parseFloat(ticker.last) : 0;
      const unrealized = s.qty >= MIN_QTY ? s.qty * (currentPrice - s.avgCost) : 0;
      spotUnrealized += unrealized;
      if (s.qty >= MIN_QTY || Math.abs(s.realized) > 0) {
        byAsset.push({
          asset,
          realized: s.realized,        // 全期間の実現損益
          unrealized,
          avgCost: s.avgCost,
          currentPrice,
          quantity: s.qty >= MIN_QTY ? s.qty : 0,
        });
      }
    });

    // ===== 信用 P&L 計算 =====
    const filteredMargin = market !== "spot" ? filterByPeriod(marginTrades, period) : [];
    let marginRealized = 0;
    filteredMargin.forEach((t) => {
      const pnl = parseFloat(t.profit_loss ?? "0");
      if (!isNaN(pnl) && pnl !== 0) marginRealized += pnl;
    });

    // 信用未実現損益
    let marginUnrealized = 0;
    const marginPositionsForDisplay: {
      pair: string;
      side: string;
      amount: string;
      price: string;
      profit_loss: string;
    }[] = [];

    openMarginPositions.forEach((p) => {
      const ticker = tickers[p.pair];
      const currentPrice = ticker ? parseFloat(ticker.last) : 0;
      const avgPrice = parseFloat(p.average_price);
      const openAmt = parseFloat(p.open_amount);
      const unrlzFee = parseFloat(p.unrealized_fee_amount || "0");
      const unrlzInt = parseFloat(p.unrealized_interest_amount || "0");

      const unrealized =
        p.position_side === "long"
          ? openAmt * (currentPrice - avgPrice) - unrlzFee - unrlzInt
          : openAmt * (avgPrice - currentPrice) - unrlzFee - unrlzInt;
      marginUnrealized += unrealized;

      marginPositionsForDisplay.push({
        pair: p.pair,
        side: p.position_side,
        amount: p.open_amount,
        price: p.average_price,
        profit_loss: String(Math.round(unrealized)),
      });
    });

    // ===== 市場別集計（サマリーカード用）=====
    const totalRealized =
      market === "spot" ? spotRealized
      : market === "margin" ? marginRealized
      : spotRealized + marginRealized;

    const totalUnrealized =
      market === "spot" ? spotUnrealized
      : market === "margin" ? marginUnrealized
      : spotUnrealized + marginUnrealized;

    // ===== チャート用データ =====
    // 現物: 期間内トレードをグループ化して損益計算
    // 信用: profit_loss を集計
    // 全市場: 両方を合算
    const spotGroups = market !== "margin" ? groupByPeriod(filteredSpot, period) : [];
    const marginGroups = market !== "spot" ? groupByPeriod(filteredMargin, period) : [];

    // ラベルの全集合を作成してグループを合算
    const labelMap = new Map<string, { realized: number; tradeCount: number }>();

    spotGroups.forEach((g) => {
      const spotGroupIds = new Set(g.trades.map((t) => t.trade_id));
      const st = calcMovingAverage(spotTrades, spotGroupIds);
      let r = 0;
      Array.from(st.values()).forEach((s) => { r += s.realized; });
      const entry = labelMap.get(g.label) ?? { realized: 0, tradeCount: 0 };
      entry.realized += r;
      entry.tradeCount += g.trades.filter((t) => t.side === "sell").length;
      labelMap.set(g.label, entry);
    });

    marginGroups.forEach((g) => {
      let r = 0;
      g.trades.forEach((t) => {
        const pnl = parseFloat(t.profit_loss ?? "0");
        if (!isNaN(pnl)) r += pnl;
      });
      const entry = labelMap.get(g.label) ?? { realized: 0, tradeCount: 0 };
      entry.realized += r;
      entry.tradeCount += g.trades.filter((t) => {
        const pnl = parseFloat(t.profit_loss ?? "0");
        return !isNaN(pnl) && pnl !== 0;
      }).length;
      labelMap.set(g.label, entry);
    });

    const records = Array.from(labelMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, v]) => ({ label, realized: v.realized, tradeCount: v.tradeCount }));

    const totalTrades =
      filteredSpot.filter((t) => t.side === "sell").length +
      filteredMargin.filter((t) => {
        const pnl = parseFloat(t.profit_loss ?? "0");
        return !isNaN(pnl) && pnl !== 0;
      }).length;

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
      marginPositions: marginPositionsForDisplay,
      debug: {
        allTradesCount: allTrades.length,
        spotTradesCount: spotTrades.length,
        marginTradesCount: marginTrades.length,
        filteredSpotCount: filteredSpot.length,
        filteredMarginCount: filteredMargin.length,
        fetchErrors,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
