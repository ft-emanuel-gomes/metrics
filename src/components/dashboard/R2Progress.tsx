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
    { name: "Concluído", data: [item.done] },
    { name: "Em andamento", data: [item.inProgress] },
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
    colors: ["#10b981", "#6366f1", "#d1d5db"],
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
        Progresso Release — Por Tipo de Item
      </h3>

      <div className="space-y-4">
        {/* Épicos */}
        <div className="text-center">
          <p className="text-[10px] font-semibold t-accent mb-1">
            Épicos ({epics.total})
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
          <p className="text-[10px] font-semibold t-accent mb-1">
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

        {/* Total */}
        <div className="text-center">
          <p className="text-[10px] font-semibold t-secondary mb-1">
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

      {/* Legenda */}
      <div className="mt-4 flex items-center justify-center gap-4 text-[10px]">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          <span className="t-secondary">Concluído</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
          <span className="t-secondary">Em andamento</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
          <span className="t-secondary">Pendente</span>
        </span>
      </div>

      {/* Risk insight */}
      {riskInsight && (
        <p className="mt-3 text-center text-[10px] font-medium text-amber-500">
          {releaseName || "Release"} deadline: {riskInsight}
        </p>
      )}
    </div>
  );
}
