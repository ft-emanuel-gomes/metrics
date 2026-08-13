"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import MetricTooltip from "@/components/ui/MetricTooltip";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface BugData {
  period: string;
  bugs: number;
  subBugs: number;
  bugKeys: string[];
  subBugKeys: string[];
}

interface BugsQualityProps {
  data: BugData[];
}

interface PopoverData {
  type: string;
  keys: string[];
  period: string;
}

export default function BugsQuality({ data }: BugsQualityProps) {
  const [popover, setPopover] = useState<PopoverData | null>(null);

  const categories = data.map((d) => d.period);
  const bugSeries = data.map((d) => d.bugs);
  const subBugSeries = data.map((d) => d.subBugs);

  const options: ApexCharts.ApexOptions = {
    chart: {
      type: "bar",
      stacked: true,
      toolbar: { show: false },
      background: "transparent",
      events: {
        dataPointSelection: (_event: unknown, _chartContext: unknown, config: unknown) => {
          const cfg = config as { seriesIndex: number; dataPointIndex: number };
          const item = data[cfg.dataPointIndex];
          const keys = cfg.seriesIndex === 0 ? item.bugKeys : item.subBugKeys;
          const typeName = cfg.seriesIndex === 0 ? "Bug" : "Sub-bug";
          if (keys.length > 0) {
            setPopover({ type: typeName, keys, period: item.period });
          }
        },
      },
    },
    plotOptions: {
      bar: { borderRadius: 4, columnWidth: "50%" },
    },
    colors: ["#FF5630", "#FF991F"],
    dataLabels: {
      enabled: true,
      style: { fontSize: "10px", fontWeight: 700 },
    },
    xaxis: {
      categories,
      labels: { style: { colors: "#94a3b8", fontSize: "10px" } },
    },
    yaxis: {
      labels: { style: { colors: "#64748b", fontSize: "10px" } },
    },
    grid: { borderColor: "rgba(255,255,255,0.04)" },
    legend: { show: true, position: "bottom", labels: { colors: "#94a3b8" } },
    tooltip: {
      theme: "dark",
      y: { formatter: (val: number) => `${val} itens (clique para ver IDs)` },
    },
    theme: { mode: "dark" },
  };

  const series = [
    { name: "Bug", data: bugSeries },
    { name: "Sub-bug", data: subBugSeries },
  ];

  const totalBugs = data.reduce((s, d) => s + d.bugs + d.subBugs, 0);

  return (
    <div className="theme-section relative">
      <h3 className="text-[11px] font-bold uppercase tracking-wide t-secondary mb-3">
        Qualidade — Bugs e Sub-bugs Concluídos
        <MetricTooltip text="Bug: Correção de falha identificada em algo já entregue em produção. Sub-Bug: Correção de falha de algum comportamento inesperado em QA." />
      </h3>
      <Chart options={options} series={series} type="bar" height={180} />
      <p className="mt-2 text-center text-[9px] t-muted">
        Total: {totalBugs} defeitos concluídos nas sprints selecionadas
      </p>

      {/* Popover — aparece ao CLICAR na barra */}
      {popover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPopover(null)}>
          <div className="rounded-xl p-4 max-w-xs w-full max-h-80 overflow-y-auto shadow-2xl" style={{ backgroundColor: "var(--bg-card)", border: "0.5px solid var(--border-primary)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                {popover.type}: {popover.keys.length}
              </h4>
              <button onClick={() => setPopover(null)} className="t-muted hover:opacity-70 text-sm">&#10005;</button>
            </div>
            <p className="text-[9px] t-muted mb-2">{popover.period}</p>
            <div className="space-y-1">
              {popover.keys.map((key) => (
                <a
                  key={key}
                  href={`https://montebravo.atlassian.net/browse/${key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-[11px] t-accent hover:underline py-0.5"
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
