"use client";

import { useEffect, useRef } from "react";
import {
  Chart,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
} from "chart.js";

Chart.register(BarElement, CategoryScale, LinearScale, Tooltip);

interface Props {
  byAsset: { asset: string; realized: number; unrealized: number }[];
}

export function AssetChart({ byAsset }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!ref.current || byAsset.length === 0) return;
    if (chartRef.current) chartRef.current.destroy();

    const labels = byAsset.map((a) => a.asset);
    const tickColor = "rgba(255,255,255,0.3)";
    const gridColor = "rgba(255,255,255,0.05)";

    chartRef.current = new Chart(ref.current, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "実現損益",
            data: byAsset.map((a) => a.realized),
            backgroundColor: byAsset.map((a) =>
              a.realized >= 0 ? "rgba(0,212,161,0.7)" : "rgba(255,107,53,0.7)"
            ),
            borderRadius: 3,
          },
          {
            label: "未実現損益",
            data: byAsset.map((a) => a.unrealized),
            backgroundColor: byAsset.map((a) =>
              a.unrealized >= 0 ? "rgba(0,212,161,0.3)" : "rgba(255,107,53,0.3)"
            ),
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
                return ctx.dataset.label + ": " + (v >= 0 ? "+" : "") + "¥" + Math.round(v).toLocaleString();
              },
            },
          },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: tickColor, font: { size: 11 } } },
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

    return () => chartRef.current?.destroy();
  }, [byAsset]);

  return (
    <div style={{ position: "relative", width: "100%", height: 200 }}>
      <canvas ref={ref} role="img" aria-label="銘柄別損益チャート">
        銘柄別損益の内訳
      </canvas>
    </div>
  );
}
