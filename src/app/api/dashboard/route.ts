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
    const {
      apiKey,
      apiSecret,
      method = "moving_average",
      period = "monthly",
      market = "all",
    } = body as {
      apiKey: string;
      apiSecret: string;
      method: CalcMethod;
      period: PeriodType;
      market: MarketType;
    };

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "API key and secret are required" }, { status: 400 });
    }
    
    console.log("API Key length:", apiKey.length);
    console.log("API Secret length:", apiSecret.length);
    console.log("API Key first 8:", apiKey.slice(0, 8));
    console.log("Full body keys:", Object.keys(body));
    
    const client = new BitbankClient(apiKey, apiSecret);

    const [assetsRes, spotTrades, tickers] = await Promise.all([
      client.getAssets(),
      market !== "margin" ? client.getAllSpotTrades(SPOT_PAIRS) : Promise.resolve([]),
      BitbankClient.getMultiTicker(SPOT_PAIRS),
    ]);

    let marginPositions: import("@/lib/calc").BitbankMarginPosition[] = [];
    let openMarginPositions: import("@/lib/calc").BitbankMarginPosition[] = [];

    if (market !== "spot") {
      try {
        const [closedRes, openRes] = await Promise.all([
          client.getMarginPositions("closed"),
          client.getOpenMarginPositions(),
        ]);
        marginPositions = closedRes.positions;
        openMarginPositions = openRes.positions;
      } catch {
        // margin not enabled
      }
    }

    const filteredSpot = filterByPeriod(spotTrades, period);
    const calcFn = method === "moving_average" ? calcMovingAverage : calcTotalAverage;
    const spotState = calcFn(filteredSpot);

    let spotRealized = 0;
    let spotWins = 0;
    let spotLosses = 0;
    Array.from(spotState.values()).forEach((s) => {
      spotRealized += s.realized;
      if (s.realized > 0) spotWins++;
      else if (s.realized < 0) spotLosses++;
    });

    const filteredMargin = marginPositions.filter((p) => {
      if (period === "all") return true;
      const d = new Date(p.closed_at ?? p.created_at);
      const now = new Date();
      if (period === "daily") return d.toDateString() === now.toDateString();
      if (period === "monthly")
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      if (period === "yearly") return d.getFullYear() === now.getFullYear();
      return true;
    });

    let marginRealized = 0;
    filteredMargin.forEach((p) => {
      marginRealized += parseFloat(p.profit_loss ?? "0");
    });

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
      const unrealized = s.qty * (currentPrice - s.avgCost);
      spotUnrealized += unrealized;
      byAsset.push({ asset, realized: s.realized, unrealized, avgCost: s.avgCost, currentPrice, quantity: s.qty });
    });

    let marginUnrealized = 0;
    openMarginPositions.forEach((p) => {
      marginUnrealized += parseFloat(p.profit_loss ?? "0");
    });

    const totalRealized =
      market === "spot" ? spotRealized :
      market === "margin" ? marginRealized :
      spotRealized + marginRealized;

    const totalUnrealized =
      market === "spot" ? spotUnrealized :
      market === "margin" ? marginUnrealized :
      spotUnrealized + marginUnrealized;

    const groups = groupByPeriod(spotTrades, period);
    const records = groups.map((g) => {
      const st = calcFn(g.trades);
      let r = 0;
      Array.from(st.values()).forEach((s) => { r += s.realized; });
      return { label: g.label, realized: r, tradeCount: g.trades.length };
    });

    const totalTrades = filteredSpot.length + filteredMargin.length;
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
