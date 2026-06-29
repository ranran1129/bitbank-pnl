"use client";

import { useState, useCallback, useEffect } from "react";
import type { CalcMethod, PeriodType, MarketType } from "@/lib/calc";
import { fmtJPY } from "@/lib/calc";
import { PnLChart } from "@/components/PnLChart";
import { AssetChart } from "@/components/AssetChart";
import { BalanceGrid } from "@/components/BalanceGrid";
import { MarginTable } from "@/components/MarginTable";
import {
  Settings,
  RefreshCw,
  TrendingUp,
  Wallet,
  Activity,
  Award,
  ChevronDown,
  Eye,
  EyeOff,
} from "lucide-react";

interface DashboardState {
  totalRealized: number;
  totalUnrealized: number;
  totalPnL: number;
  tradeCount: number;
  winRate: number;
  records: { label: string; realized: number; tradeCount: number }[];
  byAsset: {
    asset: string;
    realized: number;
    unrealized: number;
    avgCost: number;
    currentPrice: number;
    quantity: number;
  }[];
  balances: {
    asset: string;
    onhand_amount: string;
    free_amount: string;
    locked_amount: string;
  }[];
  tickers: Record<string, { last: string; buy: string; sell: string }>;
  marginPositions: {
    pair: string;
    side: string;
    amount: string;
    price: string;
    profit_loss: string;
  }[];
}

export default function Page() {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");

  // localStorageからAPIキーを復元
  useEffect(() => {
    setApiKey(localStorage.getItem("bb_api_key") ?? "");
    setApiSecret(localStorage.getItem("bb_api_secret") ?? "");
  }, []);

  const handleApiKeyChange = (v: string) => {
    setApiKey(v);
    localStorage.setItem("bb_api_key", v);
  };
  const handleApiSecretChange = (v: string) => {
    setApiSecret(v);
    localStorage.setItem("bb_api_secret", v);
  };
  const [showSecret, setShowSecret] = useState(false);
  const [showApiPanel, setShowApiPanel] = useState(false);
  const [method, setMethod] = useState<CalcMethod>("moving_average");
  const [period, setPeriod] = useState<PeriodType>("monthly");
  const [market, setMarket] = useState<MarketType>("all");
  const [data, setData] = useState<DashboardState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [chartMode, setChartMode] = useState<"pnl" | "cumulative" | "count">("pnl");

  const fetchData = useCallback(
    async (m?: CalcMethod, p?: PeriodType, mk?: MarketType) => {
      if (!apiKey || !apiSecret) {
        setShowApiPanel(true);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/dashboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey,
            apiSecret,
            method: m ?? method,
            period: p ?? period,
            market: mk ?? market,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        setData(json);
        setShowApiPanel(false);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "エラーが発生しました");
      } finally {
        setLoading(false);
      }
    },
    [apiKey, apiSecret, method, period, market]
  );

  const handleMethod = (v: CalcMethod) => {
    setMethod(v);
    if (data) fetchData(v, period, market);
  };
  const handlePeriod = (v: PeriodType) => {
    setPeriod(v);
    if (data) fetchData(method, v, market);
  };
  const handleMarket = (v: MarketType) => {
    setMarket(v);
    if (data) fetchData(method, period, v);
  };

  const posClass = (n: number) => (n >= 0 ? "pos" : "neg");

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg2)",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "0 1.5rem",
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <TrendingUp size={20} color="var(--accent)" />
            <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.02em" }}>
              bitbank PnL
            </span>
            <span
              style={{
                fontSize: 10,
                background: "rgba(0,212,161,.15)",
                color: "var(--accent)",
                padding: "2px 8px",
                borderRadius: 999,
                fontWeight: 600,
                letterSpacing: ".05em",
              }}
            >
              DASHBOARD
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => fetchData()}
              disabled={loading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                border: "1px solid var(--border2)",
                borderRadius: 8,
                background: "transparent",
                color: "var(--text2)",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
              更新
            </button>
            <button
              onClick={() => setShowApiPanel(!showApiPanel)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 14px",
                border: "1px solid var(--border2)",
                borderRadius: 8,
                background: showApiPanel ? "var(--bg3)" : "transparent",
                color: "var(--text2)",
                cursor: "pointer",
                fontSize: 13,
              }}
            >
              <Settings size={14} />
              API設定
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "1.5rem" }}>
        {/* API Panel */}
        {showApiPanel && (
          <div
            className="card"
            style={{ padding: "1.25rem", marginBottom: "1.25rem" }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "var(--text2)",
                    marginBottom: 5,
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                  }}
                >
                  API Key
                </label>
                <input
                  type="text"
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder="bitbank API Key"
                  style={{ width: "100%", padding: "8px 12px", fontSize: 13 }}
                />
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: 11,
                    color: "var(--text2)",
                    marginBottom: 5,
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                  }}
                >
                  API Secret
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showSecret ? "text" : "password"}
                    value={apiSecret}
                    onChange={(e) => handleApiSecretChange(e.target.value)}
                    placeholder="bitbank API Secret"
                    style={{ width: "100%", padding: "8px 36px 8px 12px", fontSize: 13 }}
                  />
                  <button
                    onClick={() => setShowSecret(!showSecret)}
                    style={{
                      position: "absolute",
                      right: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      color: "var(--text3)",
                      cursor: "pointer",
                    }}
                  >
                    {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button
                onClick={() => fetchData()}
                disabled={loading || !apiKey || !apiSecret}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "9px 20px",
                  background: "var(--accent)",
                  color: "#000",
                  border: "none",
                  borderRadius: 8,
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  opacity: !apiKey || !apiSecret ? 0.5 : 1,
                }}
              >
                <Activity size={14} />
                データを取得
              </button>
              <span style={{ fontSize: 11, color: "var(--text3)" }}>
                APIキーは読み取り専用権限のみ付与してください。秘密鍵はサーバーに送信されます。
              </span>
            </div>
            {error && (
              <div
                style={{
                  marginTop: 10,
                  padding: "8px 12px",
                  background: "rgba(255,107,53,.1)",
                  border: "1px solid rgba(255,107,53,.3)",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "var(--danger)",
                }}
              >
                {error}
              </div>
            )}
          </div>
        )}

        {/* Controls */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 10,
            marginBottom: "1.25rem",
          }}
        >
          {[
            {
              label: "計算方法",
              value: method,
              onChange: (v: string) => handleMethod(v as CalcMethod),
              opts: [
                { v: "moving_average", l: "移動平均法" },
                { v: "total_average", l: "総平均法" },
              ],
            },
            {
              label: "集計期間",
              value: period,
              onChange: (v: string) => handlePeriod(v as PeriodType),
              opts: [
                { v: "daily", l: "日次" },
                { v: "weekly", l: "週次" },
                { v: "monthly", l: "月次" },
                { v: "yearly", l: "年次" },
                { v: "all", l: "全期間" },
              ],
            },
            {
              label: "市場",
              value: market,
              onChange: (v: string) => handleMarket(v as MarketType),
              opts: [
                { v: "all", l: "全市場" },
                { v: "spot", l: "現物のみ" },
                { v: "margin", l: "信用のみ" },
              ],
            },
          ].map((ctrl) => (
            <div key={ctrl.label}>
              <label
                style={{
                  display: "block",
                  fontSize: 10,
                  color: "var(--text3)",
                  marginBottom: 4,
                  letterSpacing: ".07em",
                  textTransform: "uppercase",
                }}
              >
                {ctrl.label}
              </label>
              <div style={{ position: "relative" }}>
                <select
                  value={ctrl.value}
                  onChange={(e) => ctrl.onChange(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 32px 8px 12px",
                    fontSize: 13,
                    appearance: "none",
                  }}
                >
                  {ctrl.opts.map((o) => (
                    <option key={o.v} value={o.v}>
                      {o.l}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={13}
                  style={{
                    position: "absolute",
                    right: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text3)",
                    pointerEvents: "none",
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Empty state */}
        {!data && !loading && (
          <div
            className="card"
            style={{
              padding: "3rem",
              textAlign: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "1rem",
            }}
          >
            <TrendingUp size={40} color="var(--accent)" strokeWidth={1.5} />
            <div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                bitbank APIを接続してください
              </div>
              <div style={{ fontSize: 13, color: "var(--text2)" }}>
                右上の「API設定」からAPIキーを入力してデータを取得できます
              </div>
            </div>
            <button
              onClick={() => setShowApiPanel(true)}
              style={{
                padding: "9px 20px",
                background: "var(--accent)",
                color: "#000",
                border: "none",
                borderRadius: 8,
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              API設定を開く
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: "center", padding: "3rem", color: "var(--text2)" }}>
            <div style={{ marginBottom: 8 }}>データを取得中...</div>
          </div>
        )}

        {/* Dashboard */}
        {data && !loading && (
          <>
            {/* Summary cards */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 10,
                marginBottom: "1.25rem",
              }}
            >
              {[
                {
                  icon: <TrendingUp size={15} />,
                  label: "実現損益",
                  value: fmtJPY(data.totalRealized),
                  sub: method === "moving_average" ? "移動平均法" : "総平均法",
                  pos: data.totalRealized >= 0,
                },
                {
                  icon: <Activity size={15} />,
                  label: "未実現損益",
                  value: fmtJPY(data.totalUnrealized),
                  sub: "時価評価",
                  pos: data.totalUnrealized >= 0,
                },
                {
                  icon: <Wallet size={15} />,
                  label: "総損益",
                  value: fmtJPY(data.totalPnL),
                  sub: "実現 + 未実現",
                  pos: data.totalPnL >= 0,
                },
                {
                  icon: <Award size={15} />,
                  label: "勝率",
                  value: data.winRate + "%",
                  sub: `${data.tradeCount}件の取引`,
                  pos: data.winRate >= 50,
                },
              ].map((m) => (
                <div
                  key={m.label}
                  className="card"
                  style={{ padding: "1rem 1.125rem" }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginBottom: 8,
                      color: "var(--text3)",
                      fontSize: 11,
                      letterSpacing: ".06em",
                      textTransform: "uppercase",
                    }}
                  >
                    {m.icon}
                    {m.label}
                  </div>
                  <div
                    className={posClass(m.pos ? 1 : -1)}
                    style={{
                      fontSize: 20,
                      fontWeight: 600,
                      fontFamily: "monospace",
                      marginBottom: 4,
                    }}
                  >
                    {m.value}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text3)" }}>{m.sub}</div>
                </div>
              ))}
            </div>

            {/* PnL Chart */}
            <div className="card" style={{ padding: "1.25rem", marginBottom: "1rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1rem",
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: "var(--text2)",
                  }}
                >
                  損益推移
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  {(["pnl", "cumulative", "count"] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => setChartMode(m)}
                      style={{
                        padding: "4px 10px",
                        fontSize: 11,
                        border: "1px solid var(--border2)",
                        borderRadius: 6,
                        background: chartMode === m ? "var(--text1)" : "transparent",
                        color: chartMode === m ? "var(--bg)" : "var(--text2)",
                        cursor: "pointer",
                      }}
                    >
                      {m === "pnl" ? "損益" : m === "cumulative" ? "累積" : "件数"}
                    </button>
                  ))}
                </div>
              </div>
              <PnLChart records={data.records} mode={chartMode} />
            </div>

            {/* 2-col: Asset PnL + Balances */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "1rem",
                marginBottom: "1rem",
              }}
            >
              <div className="card" style={{ padding: "1.25rem" }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: "var(--text2)",
                    marginBottom: "1rem",
                  }}
                >
                  銘柄別損益
                </div>
                <AssetChart byAsset={data.byAsset} />
              </div>

              <div className="card" style={{ padding: "1.25rem" }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: "var(--text2)",
                    marginBottom: "1rem",
                  }}
                >
                  残高
                </div>
                <BalanceGrid
                  balances={data.balances}
                  tickers={data.tickers}
                />
              </div>
            </div>

            {/* Asset detail table */}
            {data.byAsset.length > 0 && (
              <div className="card" style={{ padding: "1.25rem", marginBottom: "1rem" }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: "var(--text2)",
                    marginBottom: "1rem",
                  }}
                >
                  銘柄別詳細
                  <span style={{ fontSize: 10, color: "var(--text3)", marginLeft: 8, fontWeight: 400 }}>
                    実現損益は全期間合計
                  </span>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      {["銘柄", "保有数量", "平均取得単価", "現在価格", "実現損益(全期間)", "未実現損益"].map(
                        (h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: h === "銘柄" ? "left" : "right",
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
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {data.byAsset.map((a) => (
                      <tr key={a.asset}>
                        <td
                          style={{
                            padding: "10px 8px",
                            borderBottom: "1px solid var(--border)",
                            fontWeight: 600,
                          }}
                        >
                          {a.asset}
                        </td>
                        {[
                          a.quantity.toFixed(4),
                          "¥" + Math.round(a.avgCost).toLocaleString(),
                          "¥" + Math.round(a.currentPrice).toLocaleString(),
                        ].map((v, i) => (
                          <td
                            key={i}
                            className="mono"
                            style={{
                              padding: "10px 8px",
                              borderBottom: "1px solid var(--border)",
                              textAlign: "right",
                              color: "var(--text2)",
                            }}
                          >
                            {v}
                          </td>
                        ))}
                        <td
                          className={`mono ${posClass(a.realized)}`}
                          style={{
                            padding: "10px 8px",
                            borderBottom: "1px solid var(--border)",
                            textAlign: "right",
                          }}
                        >
                          {fmtJPY(a.realized)}
                        </td>
                        <td
                          className={`mono ${posClass(a.unrealized)}`}
                          style={{
                            padding: "10px 8px",
                            borderBottom: "1px solid var(--border)",
                            textAlign: "right",
                          }}
                        >
                          {fmtJPY(a.unrealized)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Margin positions */}
            {data.marginPositions.length > 0 && (
              <div className="card" style={{ padding: "1.25rem" }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    letterSpacing: ".08em",
                    textTransform: "uppercase",
                    color: "var(--text2)",
                    marginBottom: "1rem",
                  }}
                >
                  オープンポジション（信用）
                </div>
                <MarginTable positions={data.marginPositions} />
              </div>
            )}
          </>
        )}
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
