"use client";

import { useEffect, useRef } from "react";
import {
  Chart,
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
  BarController,
  LineController,
} from "chart.js";

Chart.register(
  BarElement,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Filler,
  BarController,
  LineController
);

interface Props {
  records: { label: string; realized: number; tradeCount: number }[];
  mode: "pnl" | "cumulative" | "count";
}

// データ点数に応じてチャート横幅を決定（横スクロール対応）
const BAR_MIN_WIDTH = 64;
const CHART_HEIGHT = 240;

export function PnLChart({ records, mode }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  const chartWidth = Math.max(600, records.length * BAR_MIN_WIDTH);

  useEffect(() => {
    if (!ref.current) return;
    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const canvas = ref.current;
    // responsive: false のため canvas の width/height 属性でサイズを制御
    canvas.width = chartWidth;
    canvas.height = CHART_HEIGHT;

    const labels = records.map((r) => r.label);
    const tickColor = "rgba(255,255,255,0.35)";
    const gridColor = "rgba(255,255,255,0.06)";

    const commonXAxis = {
      grid: { color: gridColor },
      ticks: {
        color: tickColor,
        font: { size: 11 },
        maxRotation: 45,
        autoSkip: false,
      },
    };
    const commonYAxis = {
      grid: { color: gridColor },
      ticks: {
        color: tickColor,
        font: { size: 11 },
        callback: (v: number | string) =>
          (Number(v) / 10000).toFixed(0) + "万",
      },
    };

    const tooltipPnL = {
      callbacks: {
        title: (items: { label: string }[]) => items[0]?.label ?? "",
        label: (ctx: { raw: unknown }) => {
          const v = ctx.raw as number;
          return (v >= 0 ? "+" : "") + "¥" + Math.round(v).toLocaleString();
        },
      },
    };

    if (mode === "pnl") {
      chartRef.current = new Chart(canvas, {
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
          responsive: false,
          maintainAspectRatio: false,
          animation: { duration: 300 },
          plugins: {
            legend: { display: false },
            tooltip: tooltipPnL,
          },
          scales: { x: commonXAxis, y: commonYAxis },
        },
      });
    } else if (mode === "cumulative") {
      let cumulative = 0;
      const cumData = records.map((r) => {
        cumulative += r.realized;
        return cumulative;
      });

      chartRef.current = new Chart(canvas, {
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
              tension: 0.3,
              borderWidth: 2,
              pointRadius: records.length > 60 ? 2 : 4,
              pointBackgroundColor: "#00d4a1",
            },
          ],
        },
        options: {
          responsive: false,
          maintainAspectRatio: false,
          animation: { duration: 300 },
          plugins: {
            legend: { display: false },
            tooltip: tooltipPnL,
          },
          scales: { x: commonXAxis, y: commonYAxis },
        },
      });
    } else {
      chartRef.current = new Chart(canvas, {
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
          responsive: false,
          maintainAspectRatio: false,
          animation: { duration: 300 },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                title: (items: { label: string }[]) => items[0]?.label ?? "",
                label: (ctx: { raw: unknown }) => ctx.raw + "件",
              },
            },
          },
          scales: {
            x: commonXAxis,
            y: {
              grid: { color: gridColor },
              ticks: {
                color: tickColor,
                font: { size: 11 },
                callback: (v: number | string) => v + "件",
              },
            },
          },
        },
      });
    }

    return () => {
      chartRef.current?.destroy();
      chartRef.current = null;
    };
  }, [records, mode, chartWidth]);

  return (
    <div
      style={{
        overflowX: "auto",
        overflowY: "hidden",
        width: "100%",
        paddingBottom: 6,
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(255,255,255,0.2) transparent",
      }}
    >
      <div
        style={{
          width: chartWidth,
          height: CHART_HEIGHT,
          position: "relative",
          flexShrink: 0,
        }}
      >
        <canvas
          ref={ref}
          role="img"
          aria-label="損益推移チャート"
          style={{ display: "block" }}
        />
      </div>
    </div>
  );
}
