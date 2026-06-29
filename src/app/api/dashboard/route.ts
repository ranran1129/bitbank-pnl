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

    // 取引履歴を取得（現物・信用が同一エンドポイントに混在）
    const allTrades = await client.getAllSpotTrades(SPOT_PAIRS);

    // position_side で現物と信用を分離
    const spotTrades: BitbankTrade[] = allTrades.filter((t) => !t.position_side);
    const marginTrades: BitbankTrade[] = allTrades.filter(
      (t) => t.position_side === "long" || t.position_side === "short"
    );

    // 信用オープンポジション
    let openMarginPositions: BitbankOpenPosition[] = [];
    if (market !== "spot") {
      try {
        const res = await client.getOpenMarginPositions();
        openMarginPositions = res.positions ?? [];
      } catch {
        // 信用取引未対応アカウントはスキップ
      }
    }

    // ===== 現物 P&L 計算 =====
    const filteredSpot = market !== "margin" ? filterByPeriod(spotTrades, period) : [];
    const periodSpotIds = new Set(filteredSpot.map((t) => t.trade_id));

    const spotState =
      method === "moving_average"
        ? calcMovingAverage(spotTrades, periodSpotIds)
        : calcTotalAverage(filteredSpot, spotTrades);

    let spotRealized = 0;
    let spotWins = 0;
    let spotLosses = 0;
    Array.from(spotState.values()).forEach((s) => {
      spotRealized += s.realized;
      if (s.realized > 0) spotWins++;
      else if (s.realized < 0) spotLosses++;
    });

    // 現物未実現損益
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
        byAsset.push({ asset, realized: s.realized, unrealized, avgCost: s.avgCost, currentPrice, quantity: s.qty });
      }
    });

    // ===== 信用 P&L 計算 =====
    // 実現損益: APIが返す profit_loss フィールドを使用（クロージングトレードのみ値あり）
    const filteredMargin = market !== "spot" ? filterByPeriod(marginTrades, period) : [];
    let marginRealized = 0;
    filteredMargin.forEach((t) => {
      const pnl = parseFloat(t.profit_loss ?? "0");
      if (pnl !== 0) marginRealized += pnl;
    });

    // 信用未実現損益: average_price と現在価格から計算
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

      let unrealized: number;
      if (p.position_side === "long") {
        unrealized = openAmt * (currentPrice - avgPrice) - unrlzFee - unrlzInt;
      } else {
        unrealized = openAmt * (avgPrice - currentPrice) - unrlzFee - unrlzInt;
      }
      marginUnrealized += unrealized;

      marginPositionsForDisplay.push({
        pair: p.pair,
        side: p.position_side,
        amount: p.open_amount,
        price: p.average_price,
        profit_loss: String(Math.round(unrealized)),
      });
    });

    // ===== 市場別集計 =====
    const totalRealized =
      market === "spot" ? spotRealized
      : market === "margin" ? marginRealized
      : spotRealized + marginRealized;

    const totalUnrealized =
      market === "spot" ? spotUnrealized
      : market === "margin" ? marginUnrealized
      : spotUnrealized + marginUnrealized;

    // ===== チャート用データ =====
    const chartTrades = market === "margin" ? filteredMargin : filteredSpot;
    const groups = groupByPeriod(chartTrades, period);
    const records = groups.map((g) => {
      let r = 0;
      if (market === "margin") {
        g.trades.forEach((t) => { r += parseFloat(t.profit_loss ?? "0"); });
      } else {
        const groupIds = new Set(g.trades.map((t) => t.trade_id));
        const st = calcMovingAverage(spotTrades, groupIds);
        Array.from(st.values()).forEach((s) => { r += s.realized; });
      }
      return {
        label: g.label,
        realized: r,
        tradeCount: g.trades.filter((t) => t.side === "sell").length,
      };
    });

    const totalTrades =
      filteredSpot.filter((t) => t.side === "sell").length +
      filteredMargin.filter((t) => parseFloat(t.profit_loss ?? "0") !== 0).length;

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
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
