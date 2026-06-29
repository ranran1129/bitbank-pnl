"use client";

import { fmtJPY } from "@/lib/calc";

// APIの /user/margin/positions には position_id・liq_price がないため
// pair+side をキーとして使い、清算価格列は非表示にする
interface Position {
  pair: string;
  side: string;
  amount: string;
  price: string;
  profit_loss: string;
}

interface Props {
  positions: Position[];
}

export function MarginTable({ positions }: Props) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
      <thead>
        <tr>
          {["ペア", "方向", "数量", "建値（平均）", "未実現損益"].map((h) => (
            <th
              key={h}
              style={{
                textAlign: h === "ペア" || h === "方向" ? "left" : "right",
                padding: "4px 8px 10px",
                fontSize: 11,
                color: "var(--text3)",
                fontWeight: 400,
                borderBottom: "1px solid var(--border)",
                letterSpacing: ".04em",
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {positions.map((p, i) => {
          const pnl = parseFloat(p.profit_loss ?? "0");
          return (
            <tr key={`${p.pair}-${p.side}-${i}`}>
              <td
                style={{
                  padding: "10px 8px",
                  borderBottom: "1px solid var(--border)",
                  fontWeight: 600,
                  textTransform: "uppercase",
                }}
              >
                {p.pair.replace("_jpy", "")}
              </td>
              <td style={{ padding: "10px 8px", borderBottom: "1px solid var(--border)" }}>
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    background:
                      p.side === "long"
                        ? "rgba(0,212,161,.12)"
                        : "rgba(255,107,53,.12)",
                    color: p.side === "long" ? "var(--accent)" : "var(--danger)",
                  }}
                >
                  {p.side === "long" ? "ロング" : "ショート"}
                </span>
              </td>
              <td
                style={{
                  padding: "10px 8px",
                  borderBottom: "1px solid var(--border)",
                  textAlign: "right",
                  fontFamily: "monospace",
                  color: "var(--text2)",
                }}
              >
                {p.amount}
              </td>
              <td
                style={{
                  padding: "10px 8px",
                  borderBottom: "1px solid var(--border)",
                  textAlign: "right",
                  fontFamily: "monospace",
                  color: "var(--text2)",
                }}
              >
                ¥{parseFloat(p.price).toLocaleString()}
              </td>
              <td
                style={{
                  padding: "10px 8px",
                  borderBottom: "1px solid var(--border)",
                  textAlign: "right",
                  fontFamily: "monospace",
                  color: pnl >= 0 ? "var(--accent)" : "var(--danger)",
                  fontWeight: 600,
                }}
              >
                {fmtJPY(pnl)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
