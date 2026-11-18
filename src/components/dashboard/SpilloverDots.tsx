"use client";
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PeriodMetrics } from "@/adapters/types";
import { useChartTheme } from "@/lib/use-chart-theme";
import { readTrend } from "@/lib/trend-reading";
import TrendVerdictBadge from "./TrendVerdictBadge";

interface SpilloverDotsProps {
  periodMetrics: PeriodMetrics[];
  /** Dentro de outro card (sem moldura própria). */
  embedded?: boolean;
}

interface Row {
  name: string;
  concluidos: number;
  transbordo: number;
  completedN: number;
  spilledN: number;
  committed: number;
  pct: number;
}

/**
 * Transbordo (só sprint) no formato divergente: em cada sprint, 100% dos cards comprometidos no início
 * se dividem em Concluídos (direita, verde) e Não concluídos = transbordo (esquerda, vermelho),
 * em torno da linha do zero. O número dentro da barra é a quantidade de cards.
 */
export default function SpilloverDots({ periodMetrics, embedded = false }: SpilloverDotsProps) {
  const t = useChartTheme();
  const withSpill = periodMetrics.filter((pm) => pm.spillover);

  const rows: Row[] = withSpill.map((pm) => {
    const sp = pm.spillover!;
    const committed = Math.max(sp.committed, 1);
    return {
      name: `${pm.period.shortName} · ${sp.percentage}%`,
      concluidos: Math.round((sp.completed / committed) * 100),
      transbordo: -Math.round((sp.spilled / committed) * 100),
      completedN: sp.completed,
      spilledN: sp.spilled,
      committed: sp.committed,
      pct: sp.percentage,
    };
  });

  const reading = readTrend(withSpill.map((pm) => pm.spillover!.percentage), true);
  const last = withSpill[withSpill.length - 1]?.spillover;
  const lastName = withSpill[withSpill.length - 1]?.period.shortName;

  // Rótulo com a quantidade de cards dentro de cada segmento (some se não couber)
  const countLabel = (pick: (r: Row) => number) => (props: unknown) => {
    const p = props as { x?: number; y?: number; width?: number; height?: number; index?: number };
    const r = rows[p.index ?? 0];
    const n = r ? pick(r) : 0;
    const w = Math.abs(p.width ?? 0);
    if (!r || n === 0 || w < 26) return <g key={`c-${p.index}`} />;
    const x0 = (p.width ?? 0) < 0 ? (p.x ?? 0) + (p.width ?? 0) : p.x ?? 0;
    return (
      <text key={`c-${p.index}`} x={x0 + w / 2} y={(p.y ?? 0) + (p.height ?? 0) / 2 + 4} textAnchor="middle" fill={t.mode === "dark" ? "#242424" : "#ffffff"} fontSize={11} fontWeight={700}>
        {n}
      </text>
    );
  };

  return (
    <div className={embedded ? undefined : "theme-section"}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wide t-secondary">Transbordo — comprometido × concluído</h3>
        <TrendVerdictBadge reading={reading} unit="de transbordo vs média anterior" />
      </div>
      <div style={{ width: "100%", height: Math.max(150, rows.length * 52 + 78) }}>
        <ResponsiveContainer>
          <BarChart data={rows} layout="vertical" stackOffset="sign" margin={{ top: 4, right: 12, left: 8, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid horizontal={false} stroke={t.grid} />
            <XAxis type="number" domain={[-100, 100]} ticks={[-100, -50, 0, 50, 100]} tickFormatter={(v) => `${Math.abs(v)}%`} tick={{ fill: t.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={78} tick={{ fill: t.body, fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: t.grid, opacity: 0.3 }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const r = payload[0].payload as Row;
                return (
                  <div style={{ background: t.surface, border: `1px solid ${t.grid}`, borderRadius: 12, padding: "8px 12px", fontSize: 12, color: t.title }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{r.name.split(" · ")[0]} · {r.committed} comprometidos</div>
                    <div>Concluídos: <strong>{r.completedN}</strong></div>
                    <div>Transbordo: <strong>{r.spilledN}</strong> ({r.pct}%)</div>
                  </div>
                );
              }}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: 11, color: t.body }} />
            <ReferenceLine x={0} stroke={t.title} strokeDasharray="4 4" />
            <Bar isAnimationActive={false} dataKey="transbordo" stackId="s" name="Não concluídos (transbordo)" fill={t.negative}>
              <LabelList dataKey="transbordo" content={countLabel((r) => r.spilledN)} />
            </Bar>
            <Bar isAnimationActive={false} dataKey="concluidos" stackId="s" name="Concluídos" fill={t.positive}>
              <LabelList dataKey="concluidos" content={countLabel((r) => r.completedN)} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {last && (
        <p className="mt-1 text-[11px] t-muted leading-relaxed">
          {lastName}: {last.spilled} de {last.committed} cards comprometidos não foram concluídos ({last.percentage}% de transbordo).
        </p>
      )}
    </div>
  );
}
