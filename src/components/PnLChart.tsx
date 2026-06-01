"use client";

import { Chart, BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler, BarController, LineController } from "chart.js";

Chart.register(BarElement, LineElement, PointElement, CategoryScale, LinearScale, Tooltip, Filler, BarController, LineController);

interface Props {
  records: { label: string; realized: number; tradeCount: number }[];
  mode: "pnl" | "cumulative" | "count";
}

export function PnLChart({ records, mode }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    if (chartRef.current) chartRef.current.destroy();

    const labels = records.map((r) => r.label);

    let cumulative = 0;
    const cumData = records.map((r) => {
      cumulative += r.realized;
      return cumulative;
    });

    const tickColor = "rgba(255,255,255,0.3)";
    const gridColor = "rgba(255,255,255,0.05)";

    if (mode === "pnl") {
      chartRef.current = new Chart(ref.current, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "損益",
              data: records.map((r) => r.realized),
              backgroundColor: records.map((r) =>
                r.realized >= 0 ? "rgba(0,212,161,0.7)" : "rgba(255,107,53,0.7)"
              ),
              borderColor: records.map((r) =>
                r.realized >= 0 ? "#00d4a1" : "#ff6b35"
              ),
              borderWidth: 1,
              borderRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const v = ctx.raw as number;
                  return (v >= 0 ? "+" : "") + "¥" + Math.round(v).toLocaleString();
                },
              },
            },
          },
          scales: {
            x: {
              grid: { color: gridColor },
              ticks: { color: tickColor, font: { size: 11 } },
            },
            y: {
              grid: { color: gridColor },
              ticks: {
                color: tickColor,
                font: { size: 11 },
                callback: (v) => (Number(v) / 10000).toFixed(0) + "万",
              },
            },
          },
        },
      });
    } else if (mode === "cumulative") {
      chartRef.current = new Chart(ref.current, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "累積損益",
              data: cumData,
              borderColor: "#00d4a1",
              backgroundColor: "rgba(0,212,161,0.08)",
              fill: true,
              tension: 0.4,
              borderWidth: 2,
              pointRadius: 4,
              pointBackgroundColor: "#00d4a1",
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const v = ctx.raw as number;
                  return (v >= 0 ? "+" : "") + "¥" + Math.round(v).toLocaleString();
                },
              },
            },
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } } },
            y: {
              grid: { color: gridColor },
              ticks: {
                color: tickColor,
                font: { size: 11 },
                callback: (v) => (Number(v) / 10000).toFixed(0) + "万",
              },
            },
          },
        },
      });
    } else {
      chartRef.current = new Chart(ref.current, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "取引件数",
              data: records.map((r) => r.tradeCount),
              backgroundColor: "rgba(136,119,255,0.6)",
              borderColor: "rgba(136,119,255,1)",
              borderWidth: 1,
              borderRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } } },
            y: {
              grid: { color: gridColor },
              ticks: { color: tickColor, font: { size: 11 }, callback: (v) => v + "件" },
            },
          },
        },
      });
    }

    return () => chartRef.current?.destroy();
  }, [records, mode]);

  return (
    <div style={{ position: "relative", width: "100%", height: 220 }}>
      <canvas
        ref={ref}
        role="img"
        aria-label="損益推移チャート"
      >
        損益の推移グラフ
      </canvas>
    </div>
  );
}
