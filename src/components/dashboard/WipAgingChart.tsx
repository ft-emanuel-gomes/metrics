"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { WipAgingResult } from "@/metrics/wip-aging";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface WipAgingChartProps {
  wipAging: WipAgingResult;
}

interface PopoverData {
  bucket: string;
  issues: { key: string; summary: string; status: string; agingDays: number }[];
}

export default function WipAgingChart({ wipAging }: WipAgingChartProps) {
  const [popover, setPopover] = useState<PopoverData | null>(null);

  const categories = wipAging.buckets.map((b) => b.label);
  const values = wipAging.buckets.map((b) => b.count);
  const colors = ["#34d399", "#fbbf24", "#f97316", "#ef4444"];

  // Agrupar issues por bucket para o modal
  const issuesByBucket = wipAging.buckets.map((bucket) => {
    return wipAging.issues.filter((issue) => {
      if (bucket.maxDays === null) {
        return issue.agingDays >= bucket.minDays;
      }
      return issue.agingDays >= bucket.minDays && issue.agingDays < bucket.maxDays;
    });
  });

  const options: ApexCharts.ApexOptions = {
    chart: {
      type: "bar",
      toolbar: { show: false },
      background: "transparent",
      events: {
        dataPointSelection: (_event: unknown, _chartContext: unknown, config: unknown) => {
          const cfg = config as { dataPointIndex: number };
          const idx = cfg.dataPointIndex;
          const bucketIssues = issuesByBucket[idx];
          if (bucketIssues && bucketIssues.length > 0) {
            setPopover({
              bucket: categories[idx],
              issues: bucketIssues,
            });
          }
        },
      },
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: "55%",
        distributed: true,
      },
    },
    colors,
    dataLabels: {
      enabled: true,
      style: { fontSize: "11px", fontWeight: 700, colors: ["#fff"] },
    },
    xaxis: {
      categories,
      labels: { style: { colors: "#94a3b8", fontSize: "10px" } },
    },
    yaxis: {
      labels: { style: { colors: "#64748b", fontSize: "10px" } },
    },
    grid: { borderColor: "rgba(255,255,255,0.04)" },
    legend: { show: false },
    tooltip: {
      theme: "dark",
      y: { formatter: (val: number) => `${val} itens (clique para ver)` },
    },
    theme: { mode: "dark" },
  };

  const series = [{ name: "Itens", data: values }];

  return (
    <div className="theme-section relative">
      <h3 className="text-[11px] font-bold uppercase tracking-wide t-secondary mb-3">
        WIP Aging — Itens em Andamento ({wipAging.totalWip} total)
      </h3>
      <Chart options={options} series={series} type="bar" height={180} />

      {/* Modal — aparece ao CLICAR na barra */}
      {popover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPopover(null)}>
          <div className="rounded-xl p-4 max-w-sm w-full max-h-96 overflow-y-auto shadow-2xl" style={{ backgroundColor: "var(--bg-card)", border: "0.5px solid var(--border-primary)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                Bucket {popover.bucket}: {popover.issues.length} itens
              </h4>
              <button onClick={() => setPopover(null)} className="t-muted hover:opacity-70 text-sm">&#10005;</button>
            </div>
            <div className="space-y-1.5">
              {popover.issues.map((issue) => (
                <a
                  key={issue.key}
                  href={`https://montebravo.atlassian.net/browse/${issue.key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between text-[12px] t-accent hover:underline py-0.5"
                >
                  <span>{issue.key}</span>
                  <span className="text-[11px] t-primary ml-2">{issue.agingDays}d — {issue.status}</span>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
