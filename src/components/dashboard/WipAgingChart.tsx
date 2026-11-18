"use client";
import { useMemo, useState } from "react";
import { CartesianGrid, ComposedChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import type { WipAgingResult } from "@/metrics/wip-aging";
import { useChartTheme } from "@/lib/use-chart-theme";

interface WipAgingChartProps {
  wipAging: WipAgingResult;
  /** Percentis do Cycle Time da squad: definem as faixas do mapa de calor. Sem amostra, usa 7/14/30 dias. */
  percentiles?: { p50: number | null; p85: number | null; p95: number | null };
  /** Dentro de outro card (sem moldura própria). */
  embedded?: boolean;
}

// Colunas do fluxo, na ordem em que o card percorre o quadro. Status fora da lista entram no final.
const FLOW_COLUMNS = ["To Do", "In Progress", "Design Review", "Code Review", "Waiting for Test", "Test", "Waiting for Delivery"];

const CHART_H = 316;
const PLOT_H = 226; // altura útil aproximada (para espaçar as bolinhas)
const DOT_PX = 15;
const STEP_X = 0.17; // deslocamento horizontal entre bolinhas vizinhas (em colunas)

interface Dot {
  x: number;
  y: number;
  key: string;
  summary: string;
  status: string;
  daysInStatus?: number;
}

/**
 * Rampa roxa do DS (tokens --ds-color-primary-N) da base (cards novos) ao topo (cards antigos).
 * Sempre suave, no mesmo espírito do burndown:
 * - claro: de lilás muito claro a pastel (cores sólidas do DS);
 * - escuro: roxo translúcido sobre o card, forte na base e dissolvendo para o fundo no topo (topo = mais escuro).
 */
function readRamp(mode: "light" | "dark"): { c: string; o: number }[] {
  if (mode === "light") {
    const steps = [12, 11, 10, 9, 8];
    const fb = ["#ecedff", "#e6e6ff", "#d8d7ff", "#c1bfff", "#a39cff"];
    const cs = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
    return steps.map((n, i) => ({ c: cs?.getPropertyValue(`--ds-color-primary-${n}`).trim() || fb[i], o: 1 }));
  }
  const cs = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
  const c = cs?.getPropertyValue("--ds-color-primary-6").trim() || "#6540df";
  return [0.3, 0.2, 0.13, 0.07, 0.02].map((o) => ({ c, o }));
}
/**
 * WIP Aging em mapa de calor por coluna do fluxo.
 * Eixo X = colunas do fluxo; eixo Y = dias no fluxo como um todo (quanto mais alto, mais antigo);
 * cada bolinha é um card (halos sobrepostos mostram a concentração). Fundo em degradê roxo cuja
 * intensidade cresce com a idade; linhas tracejadas marcam P50/P85/P95 do Cycle Time.
 */
export default function WipAgingChart({ wipAging, percentiles, embedded = false }: WipAgingChartProps) {
  const t = useChartTheme();
  const [hover, setHover] = useState<string | null>(null);
  const ramp = useMemo(() => readRamp(t.mode), [t.mode]);

  const p50 = percentiles?.p50 ?? 7;
  const p85 = percentiles?.p85 ?? 14;
  const p95 = percentiles?.p95 ?? 30;

  const { columns, dots, yMax } = useMemo(() => {
    const present = new Set(wipAging.issues.map((i) => i.status));
    const extra = Array.from(present).filter((s) => !FLOW_COLUMNS.includes(s));
    const columns = [...FLOW_COLUMNS, ...extra];
    const maxAge = Math.max(0, ...wipAging.issues.map((i) => i.agingDays));
    const yMax = Math.max(10, Math.ceil((Math.max(maxAge, p95) * 1.08) / 5) * 5);
    const dotDays = (DOT_PX / PLOT_H) * yMax;

    // Espalha as bolinhas dentro da coluna (centro, +1, -1, +2, -2...) quando as idades se aproximam
    const dots: Dot[] = [];
    columns.forEach((col, ci) => {
      const placed: { x: number; y: number }[] = [];
      const cards = wipAging.issues.filter((i) => i.status === col).sort((a, b) => a.agingDays - b.agingDays);
      for (const c of cards) {
        let x = ci;
        for (let k = 0; k < 8; k++) {
          const off = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * STEP_X;
          const cand = ci + off;
          const clash = placed.some((p) => Math.abs(p.y - c.agingDays) < dotDays && Math.abs(p.x - cand) < STEP_X * 0.9);
          if (!clash) { x = cand; break; }
          x = cand;
        }
        x = Math.min(Math.max(x, ci - 0.4), ci + 0.4);
        placed.push({ x, y: c.agingDays });
        dots.push({ x, y: c.agingDays, key: c.key, summary: c.summary, status: c.status, daysInStatus: (c as { daysInCurrentStatus?: number }).daysInCurrentStatus });
      }
    });
    return { columns, dots, yMax };
  }, [wipAging.issues, p95]);

  const counts = columns.map((c) => wipAging.issues.filter((i) => i.status === c).length);
  const over85 = wipAging.issues.filter((i) => i.agingDays > p85).length;
  const oldest = wipAging.issues.reduce<(typeof wipAging.issues)[number] | null>((m, i) => (!m || i.agingDays > m.agingDays ? i : m), null);
  const pos = (v: number) => `${(1 - v / yMax) * 100}%`;

  return (
    <div className={embedded ? "relative flex flex-1 flex-col justify-center" : "theme-section relative flex flex-col"}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wide t-secondary">
          WIP Aging — itens em andamento ({wipAging.totalWip} total)
        </h3>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: "var(--ds-color-feedback-primary-surface)", color: "var(--ds-color-feedback-primary-label)" }}>
          Tempo real
        </span>
      </div>

      {wipAging.totalWip === 0 ? (
        <p className="py-10 text-center text-[11px] t-muted">Nenhum item em andamento no momento.</p>
      ) : (
        <div style={{ position: "relative", width: "100%", flex: "1 1 auto", minHeight: CHART_H, maxHeight: Math.round(CHART_H * 1.7) }}>
          <div style={{ position: "absolute", inset: 0 }}>
          <ResponsiveContainer>
            <ComposedChart margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="wip-heat" x1="0" y1="0" x2="0" y2="1">
                  <stop offset={pos(yMax)} stopColor={ramp[4].c} stopOpacity={ramp[4].o} />
                  <stop offset={pos(p95)} stopColor={ramp[3].c} stopOpacity={ramp[3].o} />
                  <stop offset={pos(p85)} stopColor={ramp[2].c} stopOpacity={ramp[2].o} />
                  <stop offset={pos(p50)} stopColor={ramp[1].c} stopOpacity={ramp[1].o} />
                  <stop offset={pos(0)} stopColor={ramp[0].c} stopOpacity={ramp[0].o} />
                </linearGradient>
              </defs>
              <XAxis
                type="number"
                dataKey="x"
                domain={[-0.5, columns.length - 0.5]}
                ticks={columns.map((_, i) => i)}
                interval={0}
                axisLine={false}
                tickLine={false}
                tick={(p: { x?: number; y?: number; payload?: { value: number } }) => {
                  const i = p.payload?.value ?? 0;
                  const name = columns[i] ?? "";
                  // Quebra em duas linhas quando o nome é longo, para não encostar na coluna vizinha
                  const sp = name.indexOf(" ", Math.floor(name.length / 2) - 3);
                  const lines = name.length > 9 && sp > 0 ? [name.slice(0, sp), name.slice(sp + 1)] : [name];
                  return (
                    <g key={`ct-${i}`}>
                      {lines.map((ln, li) => (
                        <text key={li} x={p.x} y={(p.y ?? 0) + 12 + li * 12} textAnchor="middle" fill={t.body} fontSize={10} fontWeight={600}>{ln}</text>
                      ))}
                      <text x={p.x} y={(p.y ?? 0) + 12 + lines.length * 12 + 1} textAnchor="middle" fill={t.muted} fontSize={10}>WIP: {counts[i]}</text>
                    </g>
                  );
                }}                height={58}
              />
              <YAxis
                type="number"
                dataKey="y"
                domain={[0, yMax]}
                ticks={[0, ...[p50, p85, p95].filter((v, i, a) => a.indexOf(v) === i), yMax]}
                tickFormatter={(v) => `${v}`}
                tick={{ fill: t.muted, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={40}
                allowDecimals={false}
                label={{ value: "Dias no fluxo", angle: -90, position: "insideLeft", fill: t.muted, fontSize: 9, dx: 4 }}
              />
              <CartesianGrid stroke="none" />
              <ReferenceArea x1={-0.5} x2={columns.length - 0.5} y1={0} y2={yMax} fill="url(#wip-heat)" fillOpacity={1} stroke="none" ifOverflow="hidden" />
              {columns.slice(0, -1).map((_, i) => (
                <ReferenceLine key={`sep-${i}`} x={i + 0.5} stroke={t.surface} strokeWidth={2} strokeOpacity={0.9} />
              ))}
              {[
                { v: p50, l: "P50" },
                { v: p85, l: "P85" },
                { v: p95, l: "P95" },
              ].map((r) => (
                <ReferenceLine
                  key={r.l}
                  y={r.v}
                  stroke={t.mode === "light" ? t.title : t.body}
                  strokeOpacity={0.55}
                  strokeDasharray="4 4"
                  label={{ value: `${r.l} · ${r.v}d`, position: "insideTopRight", fill: t.mode === "light" ? t.title : t.body, fontSize: 9, fillOpacity: 0.8 }}
                />
              ))}
              <Tooltip
                cursor={false}
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  const d = payload[0].payload as Dot;
                  return (
                    <div style={{ background: t.surface, border: `1px solid ${t.grid}`, borderRadius: 12, padding: "8px 12px", fontSize: 12, color: t.title, maxWidth: 260 }}>
                      <div style={{ fontWeight: 600 }}>{d.key}</div>
                      <div style={{ color: t.body, margin: "2px 0 4px" }}>{d.summary}</div>
                      <div><strong>{d.y}</strong> dias no fluxo{d.daysInStatus !== undefined && <span style={{ color: t.muted }}> · {d.daysInStatus}d em {d.status}</span>}</div>
                      <div style={{ color: t.muted, fontSize: 10, marginTop: 2 }}>Clique para abrir no Jira</div>
                    </div>
                  );
                }}
              />
              <Scatter
                data={dots}
                isAnimationActive={false}
                shape={(p: unknown) => {
                  const { cx, cy, payload } = p as { cx: number; cy: number; payload: Dot };
                  const active = hover === payload.key;
                  return (
                    <g
                      key={payload.key}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={() => setHover(payload.key)}
                      onMouseLeave={() => setHover(null)}
                      onClick={() => window.open(`https://montebravo.atlassian.net/browse/${payload.key}`, "_blank", "noopener,noreferrer")}
                    >
                      <circle cx={cx} cy={cy} r={active ? 16 : 12} fill={t.mode === "light" ? t.series[0] : "#ffffff"} fillOpacity={active ? 0.3 : 0.2} style={{ transition: "all .15s" }} />
                      <circle cx={cx} cy={cy} r={active ? 7.5 : 6} fill={t.surface} stroke={t.title} strokeWidth={2.5} style={{ transition: "all .15s" }} />
                    </g>
                  );
                }}
              />
            </ComposedChart>
          </ResponsiveContainer>
          </div>
        </div>
      )}

      {oldest && (
        <p className="mt-2 text-[11px] t-muted leading-relaxed">
          {over85 === 0
            ? `Nenhum card passou do P85 (${p85}d).`
            : `${over85} de ${wipAging.totalWip} cards já passaram do P85 do Cycle Time (${p85}d).`}{" "}
          Mais antigo: {oldest.key}, {oldest.agingDays}d no fluxo (em {oldest.status}).
        </p>
      )}
    </div>
  );
}
