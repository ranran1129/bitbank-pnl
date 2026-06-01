"use client";

interface Balance {
  asset: string;
  onhand_amount: string;
  free_amount: string;
  locked_amount: string;
}

interface Props {
  balances: Balance[];
  tickers: Record<string, { last: string }>;
}

const COIN_COLORS: Record<string, string> = {
  jpy: "#22c55e",
  btc: "#f7931a",
  eth: "#627eea",
  xrp: "#00aae4",
  sol: "#9945ff",
  doge: "#c2a633",
  ada: "#0033ad",
  dot: "#e6007a",
  link: "#2a5ada",
  avax: "#e84142",
  matic: "#8247e5",
};

export function BalanceGrid({ balances, tickers }: Props) {
  const withValue = balances
    .map((b) => {
      const amount = parseFloat(b.onhand_amount);
      if (amount === 0) return null;
      const ticker = tickers[b.asset + "_jpy"];
      const price = ticker ? parseFloat(ticker.last) : b.asset === "jpy" ? 1 : 0;
      const jpyValue = amount * price;
      return { ...b, amount, jpyValue };
    })
    .filter(Boolean)
    .sort((a, b) => b!.jpyValue - a!.jpyValue) as (Balance & {
    amount: number;
    jpyValue: number;
  })[];

  const totalJPY = withValue.reduce((sum, b) => sum + b.jpyValue, 0);

  return (
    <div>
      <div style={{ marginBottom: "0.75rem" }}>
        <span style={{ fontSize: 11, color: "var(--text3)" }}>総時価評価額</span>
        <div
          style={{
            fontSize: 18,
            fontWeight: 600,
            fontFamily: "monospace",
            marginTop: 2,
          }}
        >
          ¥{Math.round(totalJPY).toLocaleString()}
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 8,
        }}
      >
        {withValue.map((b) => {
          const color = COIN_COLORS[b.asset] ?? "var(--accent)";
          const pct = totalJPY > 0 ? (b.jpyValue / totalJPY) * 100 : 0;
          return (
            <div
              key={b.asset}
              style={{
                padding: "8px 10px",
                border: "1px solid var(--border)",
                borderRadius: 8,
                borderLeft: `3px solid ${color}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    color,
                  }}
                >
                  {b.asset}
                </span>
                <span style={{ fontSize: 10, color: "var(--text3)" }}>
                  {pct.toFixed(1)}%
                </span>
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  fontFamily: "monospace",
                  marginTop: 3,
                }}
              >
                {b.asset === "jpy"
                  ? "¥" + Math.round(b.amount).toLocaleString()
                  : b.amount.toFixed(4)}
              </div>
              {b.asset !== "jpy" && (
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>
                  ≈ ¥{Math.round(b.jpyValue).toLocaleString()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
