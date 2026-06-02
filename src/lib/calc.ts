// ===== Types =====

export interface BitbankAsset {
  asset: string;
  free_amount: string;
  locked_amount: string;
  onhand_amount: string;
  withdrawing_amount: string;
  withdrawal_fee: { threshold: string; under: string; over: string } | string;
}

export interface BitbankBalance {
  assets: BitbankAsset[];
}

export interface BitbankTrade {
  trade_id: number;
  pair: string;
  side: "buy" | "sell";
  position_side?: "long" | "short";
  type: "limit" | "market" | "stop" | "stop_limit";
  amount: string;
  price: string;
  maker_taker: "maker" | "taker";
  fee_amount_base: string;
  fee_amount_quote: string;
  order_id: number;
  executed_at: number;
}

export interface BitbankMarginPosition {
  position_id: number;
  pair: string;
  side: "long" | "short";
  amount: string;
  all_amount: string;
  price: string;
  stop_loss_price: string;
  take_profit_price: string;
  profit_loss: string;
  liq_price: string;
  fee: string;
  swap: string;
  created_at: number;
  closed_at?: number;
  status: "open" | "closed";
}

export interface BitbankTicker {
  pair: string;
  sell: string;
  buy: string;
  high: string;
  low: string;
  last: string;
  vol: string;
  timestamp: number;
}

export type CalcMethod = "moving_average" | "total_average";
export type PeriodType = "daily" | "monthly" | "yearly" | "all";
export type MarketType = "all" | "spot" | "margin";

export interface AssetPnL {
  asset: string;
  realized: number;
  unrealized: number;
  avgCost: number;
  currentPrice: number;
  quantity: number;
}

// ===== 移動平均法 =====
// 買いのたびに平均取得単価を更新し、売りで損益を確定する

export function calcMovingAverage(
  trades: BitbankTrade[]
): Map<string, { qty: number; avgCost: number; realized: number }> {
  const state = new Map<string, { qty: number; avgCost: number; realized: number }>();

  // 時系列順にソート
  const sorted = [...trades].sort((a, b) => a.executed_at - b.executed_at);

  for (const t of sorted) {
    const asset = t.pair.replace("_jpy", "").toUpperCase();
    const qty = parseFloat(t.amount);
    const price = parseFloat(t.price);
    // 手数料（quote建て）
    const fee = parseFloat(t.fee_amount_quote || "0");

    if (!state.has(asset)) {
      state.set(asset, { qty: 0, avgCost: 0, realized: 0 });
    }
    const s = state.get(asset)!;

    if (t.side === "buy") {
      // 移動平均法: 新しい平均単価を更新
      // 買付金額 = 数量 × 価格 + 手数料
      const buyAmount = qty * price + fee;
      const newQty = s.qty + qty;
      s.avgCost = newQty > 0 ? (s.qty * s.avgCost + buyAmount) / newQty : 0;
      s.qty = newQty;
    } else {
      // 売却: 損益 = (売価 - 平均取得単価) × 数量 - 手数料
      const pnl = (price - s.avgCost) * qty - fee;
      s.realized += pnl;
      s.qty = Math.max(0, s.qty - qty);
      // 全売却時は平均単価リセット
      if (s.qty === 0) s.avgCost = 0;
    }
  }

  return state;
}

// ===== 総平均法 =====
// 期間全体の買い合計から平均単価を算出して損益を計算する

export function calcTotalAverage(
  trades: BitbankTrade[]
): Map<string, { qty: number; avgCost: number; realized: number }> {
  const buyMap = new Map<string, { totalQty: number; totalCost: number }>();
  const sellMap = new Map<string, { totalQty: number; totalRevenue: number; totalFee: number }>();

  for (const t of trades) {
    const asset = t.pair.replace("_jpy", "").toUpperCase();
    const qty = parseFloat(t.amount);
    const price = parseFloat(t.price);
    const fee = parseFloat(t.fee_amount_quote || "0");

    if (t.side === "buy") {
      if (!buyMap.has(asset)) buyMap.set(asset, { totalQty: 0, totalCost: 0 });
      const b = buyMap.get(asset)!;
      b.totalQty += qty;
      b.totalCost += qty * price + fee;
    } else {
      if (!sellMap.has(asset)) sellMap.set(asset, { totalQty: 0, totalRevenue: 0, totalFee: 0 });
      const s = sellMap.get(asset)!;
      s.totalQty += qty;
      s.totalRevenue += qty * price;
      s.totalFee += fee;
    }
  }

  const result = new Map<string, { qty: number; avgCost: number; realized: number }>();

  for (const [asset, buy] of Array.from(buyMap.entries())) {
    const avgCost = buy.totalQty > 0 ? buy.totalCost / buy.totalQty : 0;
    const sell = sellMap.get(asset) ?? { totalQty: 0, totalRevenue: 0, totalFee: 0 };
    const realized = sell.totalRevenue - sell.totalQty * avgCost - sell.totalFee;
    const remainQty = Math.max(0, buy.totalQty - sell.totalQty);
    result.set(asset, { qty: remainQty, avgCost, realized });
  }

  return result;
}

// ===== 期間フィルタ =====

export function filterByPeriod(
  trades: BitbankTrade[],
  period: PeriodType,
  referenceDate: Date = new Date()
): BitbankTrade[] {
  if (period === "all") return trades;

  const now = referenceDate;
  return trades.filter((t) => {
    // bitbankのexecuted_atはミリ秒
    const d = new Date(t.executed_at);
    if (period === "daily") {
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }
    if (period === "monthly") {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    if (period === "yearly") {
      return d.getFullYear() === now.getFullYear();
    }
    return true;
  });
}

// ===== チャート用グループ化 =====

export function groupByPeriod(
  trades: BitbankTrade[],
  period: PeriodType
): { label: string; trades: BitbankTrade[] }[] {
  const map = new Map<string, BitbankTrade[]>();

  for (const t of trades) {
    const d = new Date(t.executed_at);
    let key: string;

    if (period === "yearly") {
      key = String(d.getMonth() + 1) + "月";
    } else if (period === "monthly") {
      key = String(d.getDate()) + "日";
    } else {
      // daily or all: group by month
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }

    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }

  const entries = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => ({
    label: period === "all" ? k.slice(5) + "月" : k,
    trades: v,
  }));
}

// ===== フォーマットヘルパー =====

export function fmtJPY(n: number): string {
  const abs = Math.abs(Math.round(n));
  const sign = n >= 0 ? "+" : "-";
  return sign + "¥" + abs.toLocaleString("ja-JP");
}

export function fmtNum(n: number, decimals = 4): string {
  return n.toFixed(decimals);
}
