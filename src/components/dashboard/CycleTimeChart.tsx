"use client";
import { Bar, CartesianGrid, ComposedChart, LabelList, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PeriodMetrics } from "@/adapters/types";
import { useChartTheme } from "@/lib/use-chart-theme";
import { movingAverage, percentileCeil, readTrend } from "@/lib/trend-reading";
import TrendVerdictBadge from "./TrendVerdictBadge";

interface CycleTimeChartProps {
  periodMetrics: PeriodMetrics[];
  stakeholderNote?: string;
}

/**
 * Cycle Time comportamental: P50 (típico) e P85 (previsível) por período,
 * com tendência (média móvel de 3 do P85). A distância entre P50 e P85 indica
 * cards que travam (cauda longa).
 */
export default function CycleTimeChart({ periodMetrics, stakeholderNote }: CycleTimeChartProps) {
  const t = useChartTheme();
  const p85 = periodMetrics.map((p) => p.cycleTime.p85);
  const trend = movingAverage(p85, 3);
  const data = periodMetrics.map((p, i) => ({
    name: p.period.shortName,
    p50: percentileCeil(p.cycleTime.issues.map((x) => x.days), 0.5),
    p85: p.cycleTime.p85,
    tendencia: trend[i],
  }));
  const reading = readTrend(p85, true);
  const last = data[data.length - 1];
  const gap = last && last.p50 != null && last.p85 != null ? last.p85 - last.p50 : null;

  // Valor dentro da coluna, na base (como no Cycle Time de bugs e sub-bugs).
  // Coluna baixa demais para o texto: o valor vai logo acima dela, na cor do título.
  const onFill = t.mode === "dark" ? "#242424" : "#ffffff";
  const valueLabel = (props: unknown) => {
    const { x, y, width, height, value } = props as { x: number; y: number; width: number; height: number; value: number | null };
    if (value === null || value === undefined) return <g />;
    const cx = x + width / 2;
    if (height < 22) {
      return <text x={cx} y={y - 5} textAnchor="middle" fill={t.title} fontSize={11} fontWeight={700}>{value}d</text>;
    }
    return <text x={cx} y={y + height - 9} textAnchor="middle" fill={onFill} fontSize={12} fontWeight={700}>{value}d</text>;
  };
  return (
    <div className="theme-section">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wide t-secondary">
          Cycle Time — comportamento (dias corridos)
        </h3>
        <TrendVerdictBadge reading={reading} unit="vs média das sprints anteriores" />
      </div>
      <div style={{ width: "100%", height: 240 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={t.grid} />
            <XAxis dataKey="name" tick={{ fill: t.body, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: t.muted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: t.grid, opacity: 0.4 }}
              contentStyle={{ background: t.surface, border: `1px solid ${t.grid}`, borderRadius: 12, fontSize: 12, color: t.title }}
              labelStyle={{ color: t.title, fontWeight: 600 }}
              itemStyle={{ color: t.title }}
              formatter={(v) => (v == null ? "—" : `${v} dias`)}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: t.body }} />
            <Bar isAnimationActive={false} dataKey="p50" name="P50 (típico)" fill={t.series[3]} radius={[6, 6, 0, 0]} maxBarSize={36}>
              <LabelList dataKey="p50" content={valueLabel} />
            </Bar>
            <Bar isAnimationActive={false} dataKey="p85" name="P85 (previsível)" fill={t.series[0]} radius={[6, 6, 0, 0]} maxBarSize={36}>
              <LabelList dataKey="p85" content={valueLabel} />
            </Bar>
            <Line isAnimationActive={false} dataKey="tendencia" name="Tendência (média 3)" stroke={t.title} strokeDasharray="4 4" strokeWidth={1.5} dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {gap != null && (
        <p className="mt-2 text-[11px] t-muted leading-relaxed">
          {gap <= 3
            ? (gap === 0 ? "Fluxo previsível: P85 igual ao P50, sem cauda longa." : `Fluxo previsível: P85 está apenas ${gap}d acima do P50.`)
            : `Atenção: P85 está ${gap}d acima do P50. Alguns cards travam e puxam o prazo para cima.`}
        </p>
      )}
      {stakeholderNote && (
        <p className="mt-2 text-center text-[10px] italic t-muted max-w-[90%] mx-auto leading-relaxed">{stakeholderNote}</p>
      )}
    </div>
  );
}
