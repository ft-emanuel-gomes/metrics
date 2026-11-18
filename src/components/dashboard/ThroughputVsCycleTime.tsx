"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import type { PeriodMetrics } from "@/adapters/types";
import { useChartTheme } from "@/lib/use-chart-theme";
import { readTrend } from "@/lib/trend-reading";
import TrendVerdictBadge from "./TrendVerdictBadge";

/** Texto de leitura cruzando a direção da vazão com a do Cycle Time. */
function interpret(tp: string, ct: string): string {
  const up = (v: string) => v === "melhorando";
  const down = (v: string) => v === "piorando";
  if (tp === "sem-base" || ct === "sem-base") return "Poucos períodos para comparar ainda.";
  if (up(tp) && up(ct)) return "Entregando mais e mais rápido: o fluxo está evoluindo.";
  if (up(tp) && down(ct)) return "Entregando mais, porém cada card demora mais: sinal de sobrecarga.";
  if (down(tp) && up(ct)) return "Cards saem mais rápido, mas entrega menos: pode haver pouca demanda pronta.";
  if (down(tp) && down(ct)) return "Entrega menos e mais devagar: o fluxo está piorando. Investigue gargalos.";
  return "Fluxo estável em relação às sprints anteriores.";
}

/**
 * Vazão (cards concluídos) × Cycle Time P85 por período.
 * Eixos separados porque as unidades são diferentes (cards x dias).
 */
export default function ThroughputVsCycleTime({ periodMetrics }: { periodMetrics: PeriodMetrics[] }) {
  const t = useChartTheme();
  const data = periodMetrics.map((p) => ({
    name: p.period.shortName,
    vazao: p.throughput.total,
    ct: p.cycleTime.p85,
  }));
  const tp = readTrend(data.map((d) => d.vazao), false);
  const ct = readTrend(data.map((d) => d.ct), true);

  return (
    <div className="theme-section">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wide t-secondary">Vazão × Cycle Time</h3>
        <div className="flex gap-1.5">
          <span className="text-[10px] t-muted self-center">Vazão</span>
          <TrendVerdictBadge reading={tp} unit="vs média anterior" />
          <span className="text-[10px] t-muted self-center">CT</span>
          <TrendVerdictBadge reading={ct} unit="vs média anterior" />
        </div>
      </div>
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 0, left: -12, bottom: 0 }}>
            <CartesianGrid stroke={t.grid} strokeOpacity={0.6} />
            <XAxis dataKey="name" tick={{ fill: t.body, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="v" tick={{ fill: t.series[2], fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <YAxis yAxisId="d" orientation="right" tick={{ fill: t.series[0], fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: t.surface, border: `1px solid ${t.grid}`, borderRadius: 12, fontSize: 12, color: t.title }}
              labelStyle={{ color: t.title, fontWeight: 600 }}
              itemStyle={{ color: t.title }}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: t.body }} />
            <Line isAnimationActive={false} yAxisId="v" dataKey="vazao" name="Vazão (cards)" stroke={t.series[2]} strokeWidth={2.5} dot={{ r: 3.5 }} />
            <Line isAnimationActive={false} yAxisId="d" dataKey="ct" name="Cycle Time P85 (dias)" stroke={t.series[0]} strokeWidth={2.5} dot={{ r: 3.5 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] t-muted leading-relaxed">{interpret(tp.verdict, ct.verdict)}</p>
    </div>
  );
}
