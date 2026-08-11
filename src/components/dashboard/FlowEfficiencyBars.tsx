"use client";

import dynamic from "next/dynamic";
import type { PeriodMetrics } from "@/adapters/types";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

interface FlowEfficiencyBarsProps {
  periodMetrics: PeriodMetrics[];
}

const BAR_COLORS = ["#b4c6e0", "#6a8fb5", "#3b6a8c"];

export default function FlowEfficiencyBars({ periodMetrics }: FlowEfficiencyBarsProps) {
  const categories = periodMetrics.map((p) => p.period.shortName);
  const values = periodMetrics.map((p) => p.flowEfficiency.efficiency);

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
        barHeight: "55%",
        distributed: true,
      },
    },
    colors: BAR_COLORS.slice(0, periodMetrics.length),
    dataLabels: {
      enabled: true,
      style: { fontSize: "11px", fontWeight: 700, colors: ["#fff"] },
      formatter: (val: number) => `${val}%`,
    },
    xaxis: {
      categories,
      max: 100,
      labels: { style: { colors: "#64748b", fontSize: "9px" } },
    },
    yaxis: {
      labels: {
        style: { colors: "#94a3b8", fontSize: "10px", fontWeight: 600 },
      },
    },
    grid: { borderColor: "rgba(255,255,255,0.04)" },
    legend: { show: false },
    annotations: {
      xaxis: [
        {
          x: 70,
          borderColor: "#34d399",
          strokeDashArray: 6,
          label: {
            text: "META 70%",
            position: "top",
            orientation: "horizontal",
            offsetY: -10,
            borderColor: "transparent",
            style: {
              color: "#34d399",
              fontSize: "9px",
              fontWeight: 700,
              background: "transparent",
              cssClass: "",
              padding: { left: 0, right: 0, top: 0, bottom: 0 },
            },
          },
        },
      ],
    },
    tooltip: {
      theme: "dark",
      y: { formatter: (val: number) => `${val}%` },
    },
    theme: { mode: "dark" },
  };

  const series = [{ name: "Eficiência", data: values }];

  // Detectar gargalo
  const avgEfficiency = values.reduce((s, v) => s + v, 0) / values.length;
  const showBottleneck = avgEfficiency < 50;

  return (
    <div className="theme-section">
      <h3 className="text-[11px] font-bold uppercase tracking-wide t-secondary mb-3">
        Eficiência de Fluxo — Evolução
      </h3>
      <Chart options={options} series={series} type="bar" height={160} />
      {showBottleneck && (
        <div className="mt-3 rounded-lg border-l-[3px] border-amber-500 bg-white/[0.03] p-2.5">
          <p className="text-[9px] font-bold text-amber-500">GARGALO IDENTIFICADO</p>
          <p className="mt-1 text-[9px] text-gray-400 leading-relaxed">
            Waiting for Test e Waiting for Delivery concentram a maior parte do tempo em fila.
            Reduzir WIP e priorizar desbloqueio de filas.
          </p>
        </div>
      )}
    </div>
  );
}
