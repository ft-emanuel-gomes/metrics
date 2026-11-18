"use client";
import { Bar, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import MetricTooltip from "@/components/ui/MetricTooltip";
import { useChartTheme } from "@/lib/use-chart-theme";
import { movingAverage, readTrend } from "@/lib/trend-reading";
import type { BugCycleTimePeriod } from "@/services/bug-cycle-time";
import TrendVerdictBadge from "./TrendVerdictBadge";

interface BugCycleTimeChartProps {
  data: BugCycleTimePeriod[];
}

interface Row {
  name: string;
  /** P85 dos bugs */
  bug: number | null;
  /** P85 dos sub-bugs */
  subBug: number | null;
  /** P85 de bugs e sub-bugs juntos (base da linha de tendência e do selo) */
  total: number | null;
  tendencia: number | null;
  p: BugCycleTimePeriod;
}

/**
 * Leitura intuitiva do P85 para amostras pequenas: quantos defeitos ficaram em até Zd antes de cruzar 85%
 * (Z = maior tempo cuja fatia acumulada ainda é <= 85%). Ex.: tempos 0,0,0,0,0,25 -> "5 de 6 (83%) em até 0d".
 * Se todos os defeitos têm o mesmo tempo, devolve null (não há o que explicar).
 */
function coverageNote(days: number[], p85: number | null): string | null {
  const n = days.length;
  if (n === 0 || p85 === null) return null;
  const uniq = Array.from(new Set(days)).sort((a, b) => a - b);
  let best: { z: number; cnt: number } | null = null;
  for (const z of uniq) {
    const cnt = days.filter((d) => d <= z).length;
    if (cnt / n <= 0.85) best = { z, cnt };
  }
  if (!best) return null;
  return `${best.cnt} de ${n} (${Math.round((best.cnt / n) * 100)}%) em até ${best.z}d; para cobrir 85% é preciso chegar a ${p85}d`;
}
/**
 * Cycle Time de correção de defeitos (P85, dias corridos), mesma regra do Cycle Time das demais issues.
 * Uma coluna de Bug e uma de Sub-bug por sprint, lado a lado, cada uma com o seu P85 dentro.
 * A linha tracejada e o selo de tendência usam o P85 de bugs e sub-bugs juntos.
 */
export default function BugCycleTimeChart({ data }: BugCycleTimeChartProps) {
  const t = useChartTheme();
  const totals = data.map((p) => p.all.p85);
  const trend = movingAverage(totals, 3);
  const rows: Row[] = data.map((p, i) => ({ name: p.period, bug: p.bug.p85, subBug: p.subBug.p85, total: p.all.p85, tendencia: trend[i], p }));

  if (!data.some((p) => p.all.p85 !== null)) return null;

  const reading = readTrend(totals, true);
  const fmt = (v: number | null) => (v === null ? "sem dados" : `${v}d`);
  // Texto do valor dentro da coluna: segue o contraste da cor de cada tipo em cada tema
  const bugText = t.mode === "dark" ? "#242424" : "#ffffff";
  const subText = "#ffffff";

  const valueLabel = (color: string) => (props: unknown) => {
    const { x, y, width, height, value } = props as { x: number; y: number; width: number; height: number; value: number | null };
    if (value === null || value === undefined) return <g />;
    const base = y + height;
    return (
      <text x={x + width / 2} y={base - 9} textAnchor="middle" fill={color} fontSize={12} fontWeight={700}>
        {value}d
      </text>
    );
  };

  const tooltipBlock = (label: string, s: BugCycleTimePeriod["bug"]) => (
    <>
      <div>{label}: <strong>{fmt(s.p85)}</strong> <span style={{ color: t.muted }}>({s.measured}/{s.count} medidos)</span></div>
      {s.days.length > 0 && (
        <div style={{ color: t.muted, fontSize: 11 }}>
          tempos: {s.days.join(", ")}d{coverageNote(s.days, s.p85) ? ` · ${coverageNote(s.days, s.p85)}` : ""}
        </div>
      )}
    </>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <h3 className="text-[11px] font-bold uppercase tracking-wide t-secondary">
          Cycle Time de correção — bugs e sub-bugs (P85, dias corridos)
          <MetricTooltip text="Tempo, em dias corridos, entre o início do trabalho no defeito e a conclusão, calculado pelo changelog do Jira. P85: 85% dos defeitos foram corrigidos em até esse prazo." />
        </h3>
        <TrendVerdictBadge reading={reading} unit="vs média das sprints anteriores" />
      </div>

      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer>
          <ComposedChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 4 }} barCategoryGap="26%" barGap={4}>
            <CartesianGrid vertical={false} stroke={t.grid} />
            <XAxis dataKey="name" tick={{ fill: t.body, fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: t.muted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={(v) => `${v}d`} width={36} />
            <Tooltip
              cursor={{ fill: t.grid, opacity: 0.3 }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const r = payload[0].payload as Row;
                return (
                  <div style={{ background: t.surface, border: `1px solid ${t.grid}`, borderRadius: 12, padding: "8px 12px", fontSize: 12, color: t.title, maxWidth: 300 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{r.name} · todos os defeitos: P85 {fmt(r.total)}</div>
                    {tooltipBlock("Bug", r.p.bug)}
                    {tooltipBlock("Sub-bug", r.p.subBug)}
                  </div>
                );
              }}
            />
            <Bar isAnimationActive={false} dataKey="bug" name="Bug" fill={t.issueType.bug} radius={[6, 6, 0, 0]} maxBarSize={44}>
              <LabelList dataKey="bug" content={valueLabel(bugText)} />
            </Bar>
            <Bar isAnimationActive={false} dataKey="subBug" name="Sub-bug" fill={t.issueType.subBug} radius={[6, 6, 0, 0]} maxBarSize={44}>
              <LabelList dataKey="subBug" content={valueLabel(subText)} />
            </Bar>
            <Line isAnimationActive={false} type="linear" dataKey="tendencia" name="Tendência (média 3)" stroke={t.title} strokeDasharray="4 4" strokeWidth={1.5} dot={false} connectNulls />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legenda de cores (os valores ficam dentro das colunas) */}
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--ds-color-content-body)" }}>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: t.issueType.bug }} />Bug</span>
        <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: t.issueType.subBug }} />Sub-bug</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: t.title }} />Tendência (todos os defeitos, média 3)</span>
      </div>
    </div>
  );
}