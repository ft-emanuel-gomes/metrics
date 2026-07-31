"use client";

import dynamic from "next/dynamic";
import type { PeriodMetrics } from "@/adapters/types";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface CycleTimeChartProps {
  periodMetrics: PeriodMetrics[];
  stakeholderNote?: string;
}

export default function CycleTimeChart({
  periodMetrics,
  stakeholderNote,
}: CycleTimeChartProps) {
  const categories = periodMetrics.map((p) => p.period.shortName);
  const values = periodMetrics.map((p) => p.cycleTime.p85 ?? 0);

  const options: ApexCharts.ApexOptions = {
    chart: {
      type: "bar",
      toolbar: { show: false },
      background: "transparent",
    },
    plotOptions: {
      bar: {
        borderRadius: 6,
        columnWidth: "50%",
        distributed: true,
      },
    },
    colors: ["#6366f1", "#8b5cf6", "#a78bfa"],
    dataLabels: {
      enabled: true,
      style: { fontSize: "14px", fontWeight: 900, colors: ["#fff"] },
      formatter: (val: number) => `${val}`,
    },
    xaxis: {
      categories,
      labels: { style: { colors: "#94a3b8", fontSize: "10px" } },
    },
    yaxis: {
      labels: { style: { colors: "#64748b", fontSize: "10px" } },
      title: { text: "Dias corridos", style: { color: "#64748b", fontSize: "9px" } },
    },
    grid: { borderColor: "rgba(255,255,255,0.04)" },
    legend: { show: false },
    tooltip: {
      theme: "dark",
      y: { formatter: (val: number) => `${val} dias` },
    },
    theme: { mode: "dark" },
  };

  const series = [{ name: "P85 (dias)", data: values }];

  return (
    <div className="rounded-xl border border-white/5 bg-white/5 p-4">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-3">
        Cycle Time — Evolução (P85, dias corridos)
      </h3>
      <Chart options={options} series={series} type="bar" height={200} />
      {stakeholderNote && (
        <p className="mt-4 text-center text-[10px] italic text-gray-400 max-w-[90%] mx-auto leading-relaxed">
          {stakeholderNote}
        </p>
      )}
    </div>
  );
}
