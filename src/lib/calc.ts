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
export type PeriodType = "daily" | "weekly" | "monthly" | "yearly" | "all";
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
// 全取引履歴を時系列で処理して正しい平均取得単価を維持する。
// periodTradeIds を渡すと、その期間内の売りに対するP&Lのみ realized に集計する。
// periodTradeIds が null の場合は全売りを集計（全期間モード）。

export function calcMovingAverage(
  allTrades: BitbankTrade[],
  periodTradeIds: Set<number> | null = null
): Map<string, { qty: number; avgCost: number; realized: number }> {
  const state = new Map<string, { qty: number; avgCost: number; realized: number }>();

  const sorted = [...allTrades].sort((a, b) => a.executed_at - b.executed_at);

  for (const t of sorted) {
    const asset = t.pair.replace("_jpy", "").toUpperCase();
    const qty = parseFloat(t.amount);
    const price = parseFloat(t.price);
    const fee = parseFloat(t.fee_amount_quote || "0");

    if (!state.has(asset)) {
      state.set(asset, { qty: 0, avgCost: 0, realized: 0 });
    }
    const s = state.get(asset)!;

    if (t.side === "buy") {
      const buyAmount = qty * price + fee;
      const newQty = s.qty + qty;
      s.avgCost = newQty > 0 ? (s.qty * s.avgCost + buyAmount) / newQty : 0;
      s.qty = newQty;
    } else {
      const pnl = (price - s.avgCost) * qty - fee;
      // 期間指定がない、または期間内の売りのみP&Lを集計
      if (periodTradeIds === null || periodTradeIds.has(t.trade_id)) {
        s.realized += pnl;
      }
      s.qty = Math.max(0, s.qty - qty);
      if (s.qty === 0) s.avgCost = 0;
    }
  }

  return state;
}

// ===== 総平均法 =====
// 期間内の買い合計から平均単価を算出して損益を計算する。
// allTrades を渡して全履歴ベースの qty/avgCost も別途返す。

export function calcTotalAverage(
  periodTrades: BitbankTrade[],
  allTrades: BitbankTrade[]
): Map<string, { qty: number; avgCost: number; realized: number }> {
  // 期間内の損益計算
  const buyMap = new Map<string, { totalQty: number; totalCost: number }>();
  const sellMap = new Map<string, { totalQty: number; totalRevenue: number; totalFee: number }>();

  for (const t of periodTrades) {
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

  // 全履歴から現在の保有qty・avgCostを取得（未実現損益の正確な計算のため）
  const allState = calcMovingAverage(allTrades, null);

  const result = new Map<string, { qty: number; avgCost: number; realized: number }>();

  // 期間内に売買があった銘柄を処理
  const assets = new Set([...buyMap.keys(), ...sellMap.keys()]);
  for (const asset of assets) {
    const buy = buyMap.get(asset) ?? { totalQty: 0, totalCost: 0 };
    const sell = sellMap.get(asset) ?? { totalQty: 0, totalRevenue: 0, totalFee: 0 };
    const avgCost = buy.totalQty > 0 ? buy.totalCost / buy.totalQty : 0;
    const realized = sell.totalRevenue - sell.totalQty * avgCost - sell.totalFee;
    // 保有数量・平均単価は全履歴ベースを使用
    const allS = allState.get(asset);
    result.set(asset, {
      qty: allS?.qty ?? 0,
      avgCost: allS?.avgCost ?? 0,
      realized,
    });
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
    const d = new Date(t.executed_at);
    if (period === "daily") {
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    }
    if (period === "weekly") {
      // 今週月曜00:00〜今週日曜23:59:59
      const dayOfWeek = now.getDay(); // 0=日, 1=月, ...
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
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    } else if (period === "monthly" || period === "weekly") {
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    } else {
      // daily or all: group by month
      key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    }

    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(t);
  }

  const entries = Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => {
    let label: string;
    if (period === "yearly") {
      label = k.slice(5).replace("-", "") + "月";
    } else if (period === "monthly" || period === "weekly") {
      label = String(parseInt(k.slice(8))) + "日";
    } else {
      label = k.slice(5).replace("-", "") + "月";
    }
    return { label, trades: v };
  });
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
