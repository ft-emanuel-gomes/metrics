"use client";

import dynamic from "next/dynamic";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface PercentilesProps {
  p50: number | null;
  p85: number | null;
  p95: number | null;
  sampleSize: number;
}

export default function PercentilesBars({ p50, p85, p95 }: PercentilesProps) {
  const options: ApexCharts.ApexOptions = {
    chart: { type: "bar", toolbar: { show: false }, background: "transparent" },
    plotOptions: {
      bar: { horizontal: true, borderRadius: 4, barHeight: "55%", distributed: true },
    },
    colors: ["#34d399", "#fbbf24", "#f87171"],
    dataLabels: {
      enabled: true,
      style: { fontSize: "10px", fontWeight: 700, colors: ["#fff"] },
      formatter: (val: number) => `${val}d`,
    },
    xaxis: {
      categories: ["P50", "P85", "P95"],
      labels: { style: { colors: "#94a3b8", fontSize: "10px" } },
    },
    yaxis: {
      labels: { style: { colors: "#64748b", fontSize: "9px" } },
    },
    grid: { borderColor: "rgba(255,255,255,0.04)" },
    legend: { show: false },
    tooltip: { theme: "dark", y: { formatter: (v: number) => `${v} dias` } },
    theme: { mode: "dark" },
  };

  const series = [{ name: "Dias", data: [p50 ?? 0, p85 ?? 0, p95 ?? 0] }];

  return (
    <div className="rounded-xl border border-white/5 bg-white/5 p-4">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">
        Confiança de Entrega — Percentis (combinados)
      </h3>
      <Chart options={options} series={series} type="bar" height={140} />
      <div className="mt-2 space-y-1 text-[9px] text-gray-400">
        <p>50% das entregas em até {p50 ?? "N/A"} dias</p>
        <p>85% das entregas em até {p85 ?? "N/A"} dias</p>
        <p>95% das entregas em até {p95 ?? "N/A"} dias</p>
      </div>
    </div>
  );
}
