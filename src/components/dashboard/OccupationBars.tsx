"use client";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PeriodMetrics } from "@/adapters/types";
import { useChartTheme } from "@/lib/use-chart-theme";

interface OccupationBarsProps {
  periodMetrics: PeriodMetrics[];
  teamSize: number;
}

/**
 * Ocupação (Original Estimate / capacidade) por sprint, com a linha de 100% da capacidade.
 * Acima de 100% a barra muda para a cor de alerta (time sobrecarregado no planejamento).
 */
export default function OccupationBars({ periodMetrics, teamSize }: OccupationBarsProps) {
  const t = useChartTheme();
  const data = periodMetrics.map((p) => ({
    name: p.period.shortName,
    value: Math.round(p.occupation.percentage),
    allocated: Math.round(p.occupation.allocatedHours),
    capacity: Math.round(p.occupation.capacityHours),
    people: p.occupation.headcount,
  }));
  const over = data.filter((d) => d.value > 100);
  const max = Math.ceil(Math.max(125, ...data.map((d) => d.value + 8)) / 25) * 25;
  const ticks = Array.from({ length: max / 25 + 1 }, (_, i) => i * 25);

  return (
    <div className="theme-section">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wide t-secondary">
          Ocupação do time — estimativa original vs capacidade
        </h3>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: "var(--ds-color-feedback-neutral-surface)", color: "var(--ds-color-feedback-neutral-label)" }}>
          {teamSize} pessoas
        </span>
      </div>
      <div style={{ width: "100%", height: Math.max(150, data.length * 48 + 50) }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, left: 0, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid horizontal={false} stroke={t.grid} />
            <XAxis type="number" domain={[0, max]} ticks={ticks} tickFormatter={(v) => `${v}%`} tick={{ fill: t.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
            {/* Largura para "Sprint N - RN" em uma linha */}
            <YAxis
              type="category"
              dataKey="name"
              width={96}
              tick={(p: { x?: number; y?: number; payload?: { value: string } }) => (
                <text key={`yt-${p.payload?.value}`} x={p.x} y={p.y} dy={4} textAnchor="end" fill={t.body} fontSize={11}>{p.payload?.value}</text>
              )}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: t.grid, opacity: 0.35 }}
              contentStyle={{ background: t.surface, border: `1px solid ${t.grid}`, borderRadius: 12, fontSize: 12, color: t.title }}
              labelStyle={{ color: t.title, fontWeight: 600 }}
              itemStyle={{ color: t.title }}
              formatter={(v, _n, item) => [
                `${v}% (${item.payload.allocated}h de ${item.payload.capacity}h${item.payload.people ? ` · ${item.payload.people} pessoas` : ""})`,
                "Ocupação",
              ]}
            />
            <ReferenceLine x={100} stroke={t.title} strokeDasharray="4 4" label={{ value: "Capacidade", position: "top", fill: t.muted, fontSize: 10 }} />
            <Bar isAnimationActive={false} dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={26}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.value > 100 ? t.negative : t.series[0]} />
              ))}
              <LabelList dataKey="value" position="insideRight" formatter={(v) => `${v}%`} fill={t.mode === "dark" ? "#242424" : t.onFill} fontSize={11} fontWeight={600} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] t-muted leading-relaxed">
        {over.length > 0
          ? `Planejado acima da capacidade em ${over.map((d) => d.name).join(", ")}: risco de transbordo.`
          : "Planejamento dentro da capacidade em todas as sprints."}{" "}
        Capacidade = Σ (horas por dia × % de atuação de cada integrante) × dias úteis.
      </p>
    </div>
  );
}
