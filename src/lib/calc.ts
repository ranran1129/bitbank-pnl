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

// ===== Calculation Types =====

export type CalcMethod = "moving_average" | "total_average";
export type PeriodType = "daily" | "monthly" | "yearly" | "all";
export type MarketType = "all" | "spot" | "margin";

export interface PnLRecord {
  date: string; // YYYY-MM-DD or YYYY-MM or YYYY
  realized: number;
  unrealized: number;
  total: number;
  tradeCount: number;
}

export interface AssetPnL {
  asset: string;
  realized: number;
  unrealized: number;
  avgCost: number;
  currentPrice: number;
  quantity: number;
}

export interface DashboardData {
  totalRealized: number;
  totalUnrealized: number;
  totalPnL: number;
  tradeCount: number;
  winRate: number;
  records: PnLRecord[];
  byAsset: AssetPnL[];
  balances: BitbankAsset[];
  tickers: Record<string, BitbankTicker>;
}

// ===== Moving Average Cost Calculator =====

export function calcMovingAverage(
  trades: BitbankTrade[]
): Map<string, { qty: number; avgCost: number; realized: number }> {
  const state = new Map<string, { qty: number; avgCost: number; realized: number }>();

  const sorted = [...trades].sort((a, b) => a.executed_at - b.executed_at);

  for (const t of sorted) {
    const asset = t.pair.replace("_jpy", "").toUpperCase();
    const qty = parseFloat(t.amount);
    const price = parseFloat(t.price);

    if (!state.has(asset)) state.set(asset, { qty: 0, avgCost: 0, realized: 0 });
    const s = state.get(asset)!;

    if (t.side === "buy") {
      // 移動平均法: 新しい平均単価 = (既存残高×平均単価 + 購入額) / 新残高
      const totalCost = s.qty * s.avgCost + qty * price;
      s.qty += qty;
      s.avgCost = s.qty > 0 ? totalCost / s.qty : 0;
    } else {
      // 売却: 損益 = (売価 - 平均取得単価) × 数量
      const pnl = (price - s.avgCost) * qty;
      s.realized += pnl;
      s.qty = Math.max(0, s.qty - qty);
    }
  }

  return state;
}

// ===== Total Average Cost Calculator =====

export function calcTotalAverage(
  trades: BitbankTrade[]
): Map<string, { qty: number; avgCost: number; realized: number }> {
  // 総平均法: 期間全体の買い平均単価で計算
  const buyTotals = new Map<string, { totalQty: number; totalCost: number }>();
  const sells = new Map<string, { totalQty: number; totalRevenue: number }>();

  for (const t of trades) {
    const asset = t.pair.replace("_jpy", "").toUpperCase();
    const qty = parseFloat(t.amount);
    const price = parseFloat(t.price);

    if (t.side === "buy") {
      if (!buyTotals.has(asset)) buyTotals.set(asset, { totalQty: 0, totalCost: 0 });
      const b = buyTotals.get(asset)!;
      b.totalQty += qty;
      b.totalCost += qty * price;
    } else {
      if (!sells.has(asset)) sells.set(asset, { totalQty: 0, totalRevenue: 0 });
      const s = sells.get(asset)!;
      s.totalQty += qty;
      s.totalRevenue += qty * price;
    }
  }

  const result = new Map<string, { qty: number; avgCost: number; realized: number }>();

  for (const [asset, buy] of buyTotals) {
    const avgCost = buy.totalQty > 0 ? buy.totalCost / buy.totalQty : 0;
    const sell = sells.get(asset) ?? { totalQty: 0, totalRevenue: 0 };
    const realized = sell.totalRevenue - sell.totalQty * avgCost;
    const remainQty = buy.totalQty - sell.totalQty;

    result.set(asset, { qty: Math.max(0, remainQty), avgCost, realized });
  }

  return result;
}

// ===== Period filtering =====

export function filterByPeriod(
  trades: BitbankTrade[],
  period: PeriodType,
  referenceDate: Date = new Date()
): BitbankTrade[] {
  if (period === "all") return trades;

  const now = referenceDate;

  return trades.filter((t) => {
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

// ===== Group by period for chart =====

export function groupByPeriod(
  trades: BitbankTrade[],
  period: PeriodType
): { label: string; trades: BitbankTrade[] }[] {
  if (period === "all" || period === "daily") {
    // Group by month for chart
    const map = new Map<string, BitbankTrade[]>();
    for (const t of trades) {
      const d = new Date(t.executed_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ label: k.slice(5) + "月", trades: v }));
  }

  if (period === "monthly") {
    // Group by day
    const map = new Map<string, BitbankTrade[]>();
    for (const t of trades) {
      const d = new Date(t.executed_at);
      const key = String(d.getDate()) + "日";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries()).map(([k, v]) => ({ label: k, trades: v }));
  }

  // yearly: group by month
  const map = new Map<string, BitbankTrade[]>();
  for (const t of trades) {
    const d = new Date(t.executed_at);
    const key = String(d.getMonth() + 1) + "月";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }
  return Array.from(map.entries()).map(([k, v]) => ({ label: k, trades: v }));
}

// ===== Format helpers =====

export function fmtJPY(n: number): string {
  const abs = Math.abs(Math.round(n));
  const sign = n >= 0 ? "+" : "-";
  return sign + "¥" + abs.toLocaleString("ja-JP");
}

export function fmtNum(n: number, decimals = 4): string {
  return n.toFixed(decimals);
}

export const ASSET_LABELS: Record<string, string> = {
  btc: "Bitcoin",
  eth: "Ethereum",
  xrp: "Ripple",
  sol: "Solana",
  doge: "Dogecoin",
  matic: "Polygon",
  ada: "Cardano",
  dot: "Polkadot",
  ltc: "Litecoin",
  bcc: "Bitcoin Cash",
  mona: "Monacoin",
  xlm: "Stellar",
  qtum: "Qtum",
  bat: "BAT",
  omg: "OMG",
  xym: "Symbol",
  link: "Chainlink",
  mkr: "Maker",
  boba: "Boba",
  enj: "Enjin",
  matic2: "Polygon",
  flr: "Flare",
  sand: "The Sandbox",
  avax: "Avalanche",
  axs: "Axie",
  chz: "Chiliz",
  ape: "ApeCoin",
  near: "NEAR",
};
