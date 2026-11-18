"use client";
import { Bar, CartesianGrid, Cell, ComposedChart, LabelList, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PeriodMetrics } from "@/adapters/types";
import { useChartTheme } from "@/lib/use-chart-theme";
import { movingAverage, readTrend } from "@/lib/trend-reading";
import TrendVerdictBadge from "./TrendVerdictBadge";

interface FlowEfficiencyBarsProps {
  periodMetrics: PeriodMetrics[];
}

// Regra de negócio: meta de eficiência de fluxo = 70%; gargalo quando a média da sprint é < 50%
const META = 70;
const BOTTLENECK = 50;

interface Row {
  name: string;
  media: number;
  tendencia: number | null;
  n: number;
}

/**
 * Eficiência de fluxo por sprint, estritamente pela regra do projeto:
 * eficiência do card = tempo em estados ativos / (ativos + espera) e a da sprint = média das eficiências dos cards.
 * Colunas = eficiência da sprint (verde quando atinge a meta de 70%, roxo quando abaixo);
 * linha tracejada = tendência (média móvel de 3 sprints); linha verde = meta de 70%.
 */
export default function FlowEfficiencyBars({ periodMetrics }: FlowEfficiencyBarsProps) {
  const t = useChartTheme();
  const avgs = periodMetrics.map((p) => Math.round(p.flowEfficiency.efficiency));
  const trend = movingAverage(avgs, 3);
  const rows: Row[] = periodMetrics.map((p, i) => ({
    name: p.period.shortName,
    media: avgs[i],
    tendencia: trend[i] === null ? null : Math.round(trend[i] as number),
    n: p.flowEfficiency.issues.length,
  }));

  const reading = readTrend(avgs, false);
  const last = rows[rows.length - 1];
  const gap = last ? last.media - META : 0;
  const onFill = t.mode === "dark" ? "#242424" : "#ffffff";

  return (
    <div className="theme-section">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide t-secondary">Eficiência de fluxo — por sprint</h3>
        <div className="flex shrink-0 items-center gap-1.5">
          <TrendVerdictBadge reading={reading} unit="vs média anterior" />
          <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: "var(--ds-color-feedback-positive-surface)", color: "var(--ds-color-feedback-positive-label)" }}>
            Meta {META}%
          </span>
        </div>
      </div>

      <div style={{ width: "100%", height: 250 }}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 8, right: 16, left: 4, bottom: 4 }} barCategoryGap="32%">
            <CartesianGrid vertical={false} stroke={t.grid} strokeOpacity={0.6} />
            {/* Faixa "dentro da meta" (70% a 100%) */}
            <ReferenceArea y1={META} y2={100} fill={t.positive} fillOpacity={0.09} stroke="none" ifOverflow="hidden" />
            <XAxis dataKey="name" tick={{ fill: t.body, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 25, 50, META, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: t.muted, fontSize: 10 }} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              cursor={{ fill: t.grid, opacity: 0.3 }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const r = payload[0].payload as Row;
                return (
                  <div style={{ background: t.surface, border: `1px solid ${t.grid}`, borderRadius: 12, padding: "8px 12px", fontSize: 12, color: t.title }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{r.name}</div>
                    <div>Eficiência: <strong>{r.media}%</strong> <span style={{ color: t.muted }}>(meta {META}%)</span></div>
                    <div style={{ color: t.muted }}>{r.n} cards analisados</div>
                  </div>
                );
              }}
            />
            <ReferenceLine
              y={META}
              stroke={t.positive}
              strokeWidth={2}
              strokeDasharray="6 4"
              label={{ value: `Meta ${META}%`, position: "insideTopLeft", fill: t.positive, fontSize: 11, fontWeight: 700, dy: -16, dx: 6 }}
            />
            <Bar isAnimationActive={false} dataKey="media" name="Eficiência" radius={[8, 8, 0, 0]} maxBarSize={64}>
              {rows.map((r) => (
                <Cell key={r.name} fill={r.media >= META ? t.positive : r.media < BOTTLENECK ? t.negative : t.series[0]} />
              ))}
              <LabelList dataKey="media" position="insideBottom" offset={10} formatter={(v) => `${v}%`} fill={onFill} fontSize={12} fontWeight={700} />
            </Bar>
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey="tendencia"
              stroke={t.title}
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={(p: { cx?: number; cy?: number; index?: number }) => (
                <circle key={`td-${p.index}`} cx={p.cx} cy={p.cy} r={4} fill={t.surface} stroke={t.title} strokeWidth={2} />
              )}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda própria: cores das colunas pela meta + linha de tendência */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--ds-color-content-body)" }}>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: t.positive }} />Na meta (≥{META}%)</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: t.series[0] }} />Abaixo da meta ({BOTTLENECK}–{META - 1}%)</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: t.negative }} />Gargalo (&lt;{BOTTLENECK}%)</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: t.title }} />Tendência (média 3)</span>
      </div>

      {last && (
        <p className="mt-2 text-[11px] t-muted leading-relaxed">
          {last.name}: eficiência de <strong style={{ color: "var(--ds-color-content-title)" }}>{last.media}%</strong>,{" "}
          {gap >= 0 ? `${gap} p.p. acima da meta de ${META}%` : `${Math.abs(gap)} p.p. abaixo da meta de ${META}%`}.{" "}
          {last.media < BOTTLENECK
            ? "Gargalo identificado: os cards passam mais tempo em fila do que em trabalho. "
            : ""}
          Média da eficiência de cada card (tempo ativo ÷ ativo + espera).
        </p>
      )}
    </div>
  );
}
