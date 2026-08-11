"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { PeriodMetrics } from "@/adapters/types";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface ThroughputDonutsProps {
  periodMetrics: PeriodMetrics[];
}

const TYPE_COLORS: Record<string, string> = {
  "HistÃƒÂ³ria": "#34d399",
  "Bug": "#f87171",
  "Design": "#818cf8",
  "Tech Debt": "#fbbf24",
  "Task": "#a78bfa",
  "Kaizen": "#38bdf8",
  "Spike": "#fb923c",
};

interface PopoverData {
  type: string;
  count: number;
  issueKeys: string[];
  period: string;
}

export default function ThroughputDonuts({ periodMetrics }: ThroughputDonutsProps) {
  const [popover, setPopover] = useState<PopoverData | null>(null);

  const allTypes = new Set<string>();
  periodMetrics.forEach((pm) => pm.throughput.byType.forEach((t) => allTypes.add(t.type)));

  return (
    <div className="theme-section relative">
      <h3 className="text-[11px] font-bold uppercase tracking-wide t-secondary mb-3">
        VazÃƒÂ£o Sprints Ã¢â‚¬â€ Por Tipo
      </h3>
      <div className="flex items-start justify-center gap-8 mx-auto">
        {periodMetrics.map((pm) => {
          const labels = pm.throughput.byType.map((t) => t.type);
          const series = pm.throughput.byType.map((t) => t.count);
          const colors = labels.map((l) => TYPE_COLORS[l] || "#94a3b8");

          const options: ApexCharts.ApexOptions = {
            chart: {
              type: "donut",
              background: "transparent",
              events: {
                dataPointSelection: (_event: unknown, _chartContext: unknown, config: unknown) => {
                  const cfg = config as { dataPointIndex: number };
                  const idx = cfg.dataPointIndex;
                  const typeData = pm.throughput.byType[idx];
                  if (typeData) {
                    setPopover({
                      type: typeData.type,
                      count: typeData.count,
                      issueKeys: typeData.issueKeys,
                      period: pm.period.shortName,
                    });
                  }
                },
              },
            },
            labels,
            colors,
            legend: { show: false },
            dataLabels: { enabled: false },
            plotOptions: {
              pie: {
                donut: {
                  size: "64%",
                  labels: { show: false },
                },
                expandOnClick: false,
              },
            },
            stroke: { show: false },
            tooltip: {
              theme: "dark",
              y: { formatter: (val: number) => `${val} itens (clique para ver IDs)` },
            },
            theme: { mode: "dark" },
          };

          return (
            <div key={pm.period.shortName} className="text-center">
              <div className="relative cursor-pointer">
                <Chart
                  options={options}
                  series={series}
                  type="donut"
                  width={120}
                  height={120}
                />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <span className="text-2xl font-black text-white">{pm.throughput.total}</span>
                </div>
              </div>
              <p className="mt-1 text-[9px] text-gray-400">{pm.period.shortName}</p>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex justify-center gap-4 text-[9px] text-gray-400">
        {Array.from(allTypes).map((type) => (
          <span key={type} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: TYPE_COLORS[type] || "#94a3b8" }} />
            {type}
          </span>
        ))}
      </div>

      {/* Popover Ã¢â‚¬â€ aparece ao CLICAR no segmento */}
      {popover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPopover(null)}>
          <div className="bg-gray-900 border border-white/10 rounded-xl p-4 max-w-xs w-full max-h-80 overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-white">
                {popover.type}: {popover.count}
              </h4>
              <button onClick={() => setPopover(null)} className="text-gray-500 hover:text-white text-sm">Ã¢Å“â€¢</button>
            </div>
            <p className="text-[9px] t-muted mb-2">{popover.period}</p>
            <div className="space-y-1">
              {popover.issueKeys.map((key) => (
                <a
                  key={key}
                  href={`https://montebravo.atlassian.net/browse/${key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-[11px] text-indigo-400 hover:text-indigo-300 hover:underline py-0.5"
                >
                  {key}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
