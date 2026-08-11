"use client";

import dynamic from "next/dynamic";
import type { BurndownPoint } from "@/adapters/types";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface BurndownChartProps {
  burndown: BurndownPoint[];
  deadline: string;
  totalFeatures: number;
  completedFeatures: number;
}

export default function BurndownChart({ burndown, deadline, totalFeatures, completedFeatures }: BurndownChartProps) {
  const categories = burndown.map((b) => b.period.shortName);
  const ideal = burndown.map((b) => b.idealRemaining);
  const real = burndown.map((b) => b.realRemaining);

  const remaining = totalFeatures - completedFeatures;

  const options: ApexCharts.ApexOptions = {
    chart: { type: "line", toolbar: { show: false }, background: "transparent" },
    stroke: {
      width: [2.5, 2.5],
      dashArray: [6, 0],
    },
    colors: ["#34d399", "#f87171"],
    markers: { size: [4, 4], colors: ["#34d399", "#f87171"] },
    xaxis: {
      categories,
      labels: { style: { colors: "#94a3b8", fontSize: "10px" } },
    },
    yaxis: {
      labels: { style: { colors: "#64748b", fontSize: "10px" } },
      title: { text: "Features restantes", style: { color: "#64748b", fontSize: "9px" } },
    },
    grid: { borderColor: "rgba(255,255,255,0.04)" },
    legend: { show: true, position: "bottom", labels: { colors: "#94a3b8" } },
    tooltip: { theme: "dark" },
    theme: { mode: "dark" },
  };

  const series = [
    { name: "Ideal", data: ideal },
    { name: "Real", data: real },
  ];

  return (
    <div className="theme-section">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide t-secondary">
        R2 â€” Burndown (Features)
      </h3>
      <Chart options={options} series={series} type="line" height={180} />
      <p className="mt-2 text-center text-[10px] text-amber-400">
        {remaining} features restantes com deadline em {deadline}
      </p>
    </div>
  );
}
