"use client";

import dynamic from "next/dynamic";
import type { R2ProgressResult } from "@/metrics/r2-progress";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface R2ProgressProps {
  r2Progress: R2ProgressResult;
}

export default function R2Progress({ r2Progress }: R2ProgressProps) {
  const { epics, features, riskInsight, releaseName } = r2Progress;

  const buildSeries = (item: typeof epics) => [
    { name: "ConcluÃ­do", data: [item.done] },
    { name: "Em Andamento", data: [item.inProgress] },
    { name: "Pendente", data: [item.pending] },
  ];

  const chartOptions: ApexCharts.ApexOptions = {
    chart: {
      type: "bar",
      stacked: true,
      stackType: "100%",
      toolbar: { show: false },
      background: "transparent",
      sparkline: { enabled: false },
    },
    plotOptions: {
      bar: { horizontal: true, borderRadius: 4, barHeight: "80%" },
    },
    colors: ["#10b981", "#6366f1", "rgba(255,255,255,0.15)"],
    xaxis: {
      categories: [""],
      labels: { show: false },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: { show: false },
    },
    grid: { show: false, padding: { top: -15, bottom: -10, left: 0, right: 0 } },
    legend: { show: false },
    dataLabels: {
      enabled: true,
      style: { fontSize: "10px", fontWeight: 700 },
      formatter: (val: number) => {
        return val > 0 ? `${Math.round(val)}%` : "";
      },
    },
    tooltip: { theme: "dark" },
    theme: { mode: "dark" },
  };

  return (
    <div className="theme-section">
      <h3 className="text-[11px] font-bold uppercase tracking-wide t-secondary mb-4">
        Progresso Release â€” Por Tipo de Item
      </h3>

      <div className="space-y-4">
        {/* Ã‰picos */}
        <div className="text-center">
          <p className="text-[10px] font-semibold text-indigo-300 mb-1">
            Ã‰picos ({epics.total})
          </p>
          <div className="mx-auto max-w-md">
            <Chart
              options={chartOptions}
              series={buildSeries(epics)}
              type="bar"
              height={40}
            />
          </div>
        </div>

        {/* Features */}
        <div className="text-center">
          <p className="text-[10px] font-semibold text-indigo-300 mb-1">
            Features ({features.total})
          </p>
          <div className="mx-auto max-w-md">
            <Chart
              options={chartOptions}
              series={buildSeries(features)}
              type="bar"
              height={40}
            />
          </div>
        </div>

        {/* Total (Ã‰picos + Features) */}
        <div className="text-center">
          <p className="text-[10px] font-semibold text-indigo-300 mb-1">
            Total ({epics.total + features.total})
          </p>
          <div className="mx-auto max-w-md">
            <Chart
              options={chartOptions}
              series={buildSeries({
                total: epics.total + features.total,
                done: epics.done + features.done,
                inProgress: epics.inProgress + features.inProgress,
                pending: epics.pending + features.pending,
              })}
              type="bar"
              height={40}
            />
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex justify-center gap-3 text-[9px] text-gray-400">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" /> ConcluÃ­do
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-indigo-500" /> Em andamento
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-white/15" /> Pendente
        </span>
      </div>

      {riskInsight && (
        <div className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-center text-[10px] text-amber-400">
          {riskInsight}
        </div>
      )}
    </div>
  );
}
