"use client";

import dynamic from "next/dynamic";
import type { PeriodMetrics } from "@/adapters/types";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface OccupationBarsProps {
  periodMetrics: PeriodMetrics[];
  teamSize: number;
}

const BAR_COLORS = ["#c4b5fd", "#a78bfa", "#8b5cf6"];

export default function OccupationBars({ periodMetrics, teamSize }: OccupationBarsProps) {
  const categories = periodMetrics.map((p) => p.period.shortName);
  const values = periodMetrics.map((p) => p.occupation.percentage);

  const options: ApexCharts.ApexOptions = {
    chart: {
      type: "bar",
      toolbar: { show: false },
      background: "transparent",
    },
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 4,
        barHeight: "60%",
        distributed: true,
      },
    },
    colors: BAR_COLORS.slice(0, periodMetrics.length),
    dataLabels: {
      enabled: true,
      style: { fontSize: "10px", fontWeight: 700, colors: ["#fff"] },
      formatter: (val: number) => `${val}%`,
    },
    xaxis: {
      categories,
      max: 100,
      labels: { style: { colors: "#64748b", fontSize: "9px" } },
    },
    yaxis: {
      labels: { style: { colors: "#94a3b8", fontSize: "10px" } },
    },
    grid: { borderColor: "rgba(255,255,255,0.04)" },
    legend: { show: false },
    tooltip: {
      theme: "dark",
      y: {
        formatter: (_val: number) => {
          return `${_val}%`;
        },
      },
    },
    theme: { mode: "dark" },
  };

  const series = [{ name: "OcupaÃƒÂ§ÃƒÂ£o", data: values }];

  return (
    <div className="theme-section">
      <h3 className="text-[11px] font-bold uppercase tracking-wide t-secondary mb-3">
        OcupaÃƒÂ§ÃƒÂ£o do Time Ã¢â‚¬â€ Original Estimate vs Capacidade
      </h3>
      <Chart options={options} series={series} type="bar" height={160} />
      <p className="mt-2 text-center text-[9px] t-muted">
        Capacidade: pessoas Ãƒâ€” 6h/dia Ãƒâ€” dias ÃƒÂºteis (valor configurado por sprint via Capacidade)
      </p>
    </div>
  );
}
