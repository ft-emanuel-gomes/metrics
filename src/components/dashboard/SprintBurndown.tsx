"use client";
import { useCallback, useEffect, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SprintBurndownResult } from "@/metrics/sprint-burndown";
import { useChartTheme } from "@/lib/use-chart-theme";

interface SprintBurndownProps {
  squadSlug: string;
  /** Mesmo filtro de tipos do dashboard (query ?issueType=...). */
  issueType?: string;
  /** Dentro de outro card (sem moldura própria). */
  embedded?: boolean;
}

const REFRESH_MS = 5 * 60 * 1000;

/** dd/mm no fuso de Brasília. */
function fmtDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3_600_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function fmtDateTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3_600_000);
  return `${fmtDate(iso)} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * Burndown da sprint vigente, SEMPRE em tempo real. Chave no cabeçalho:
 * desligada = standard issues (cards); ligada = Sub-task e Sub-bug em horas (Original Estimate).
 * Busca no Jira a cada abertura, a cada 5 minutos e ao trocar a chave.
 * Área = linha ideal; linha = real.
 * Rótulos: início e fim da sprint (eixo) e valores no início e no ponto atual.
 */
export default function SprintBurndown({ squadSlug, issueType, embedded = false }: SprintBurndownProps) {
  const t = useChartTheme();
  const [data, setData] = useState<SprintBurndownResult | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "empty" | "error">("loading");
  const [message, setMessage] = useState("");
  const [hoursMode, setHoursMode] = useState(false);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (issueType) qs.set("issueType", issueType);
      if (hoursMode) qs.set("mode", "hours");
      const s = qs.toString();
      const res = await fetch(`/api/burndown/${squadSlug}${s ? `?${s}` : ""}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Falha ao buscar a sprint");
      if (!json.burndown) { setData(null); setState("empty"); return; }
      setData(json.burndown as SprintBurndownResult);
      setState("ok");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erro ao buscar o burndown");
      setState("error");
    }
  }, [squadSlug, issueType, hoursMode]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const wrap = embedded ? "flex flex-1 flex-col justify-center" : "theme-section flex flex-col";

  const header = (
    <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <h3 className="text-[11px] font-bold uppercase tracking-wide t-secondary">
        Burndown{data ? ` — ${data.sprint.name}` : " da sprint"}
      </h3>
      <div className="flex shrink-0 items-center gap-3">
        {/* Chave: desligada = quantidade de cards; ligada = horas alocadas (mesma base do Resumo executivo) */}
        <button
          type="button"
          role="switch"
          aria-checked={hoursMode}
          onClick={() => { setState("loading"); setHoursMode((v) => !v); }}
          className="flex items-center gap-2 text-[11px] font-semibold"
          style={{ color: hoursMode ? "var(--ds-color-content-title)" : "var(--ds-color-content-caption)" }}
        >
          <span
            className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
            style={{ background: hoursMode ? "var(--ds-color-action-primary-surface)" : "var(--ds-color-container-divider-card)" }}
            aria-hidden="true"
          >
            <span
              className="absolute h-4 w-4 rounded-full shadow transition-transform"
              style={{ left: 2, background: "#ffffff", transform: hoursMode ? "translateX(16px)" : "translateX(0)" }}
            />
          </span>
          Em horas
        </button>
        <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: "var(--ds-color-feedback-primary-surface)", color: "var(--ds-color-feedback-primary-label)" }}>
          Tempo real
        </span>
      </div>
    </div>
  );
  if (state !== "ok" || !data) {
    return (
      <div className={wrap}>
        {header}
        <p className="py-6 text-center text-[11px] t-muted">
          {state === "loading" && "Buscando a sprint ativa no Jira…"}
          {state === "empty" && "Nenhuma sprint ativa no momento."}
          {state === "error" && (
            <>
              {message}{" "}
              <button onClick={() => { setState("loading"); load(); }} className="underline" style={{ color: "var(--ds-color-content-primary)" }}>Tentar de novo</button>
            </>
          )}
        </p>
      </div>
    );
  }

  // Unidade: cards (inteiros) ou horas (até 1 casa)
  const isHours = data.unit === "hours";
  const fmtV = (v: number) => (isHours ? `${Number.isInteger(v) ? v : v.toFixed(1).replace(".", ",")}h` : String(v));
  const unitWord = (v: number) => (isHours ? "" : v === 1 ? " card" : " cards");
  const unestimated = isHours ? data.unestimated ?? [] : [];
  const lastRealIdx = data.rows.reduce((acc, r, i) => (r.remaining !== null ? i : acc), 0);
  // Sprint recém-iniciada: o ponto atual quase coincide com o início; mostra só o rótulo/ponto do início
  const showLast = lastRealIdx > 0 && data.rows[lastRealIdx].x - data.rows[0].x > 0.4;
  const isMarked = (i?: number) => i === 0 || (showLast && i === lastRealIdx);
  const maxY = Math.max(data.committed + data.added, ...data.rows.map((r) => r.remaining ?? 0), 1);
  // Ticks muito próximos do início/fim saem do eixo para não sobrepor os rótulos "Início" e "Fim"
  const ticks = [0, ...data.dayTicks.filter((d) => d.x > 2 && d.x < data.totalDays - 1.6).map((d) => d.x), data.totalDays];
  const tickLabel = (x: number) => {
    if (x === 0) return `Início ${fmtDate(data.sprint.startDate)}`;
    // Fim exatamente como cadastrado no Jira
    if (Math.abs(x - data.totalDays) < 0.001) return `Fim ${fmtDate(data.sprint.endDate)}`;
    return data.dayTicks.find((d) => Math.abs(d.x - x) < 0.001)?.label ?? "";
  };
  const diff = data.remaining - data.idealNow;
  const overdue = new Date(data.asOf).getTime() > new Date(data.sprint.endDate).getTime();
  const reading =
    diff <= 0.5
      ? "No ritmo ou à frente da linha ideal."
      : overdue
      ? `Prazo da sprint encerrado e ainda aberta no Jira: restam ${fmtV(data.remaining)}${unitWord(data.remaining)}.`
      : `${fmtV(Math.round(diff))}${unitWord(Math.round(diff))} acima da linha ideal: ritmo abaixo do necessário para fechar a sprint.`;

  return (
    <div className={wrap}>
      {header}
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] t-muted">
        <span>Comprometido <strong style={{ color: "var(--ds-color-content-title)" }}>{fmtV(data.committed)}</strong></span>
        {data.added > 0 && <span>Adicionados <strong style={{ color: "var(--ds-color-content-title)" }}>+{fmtV(data.added)}</strong></span>}
        <span>Concluídos <strong style={{ color: "var(--ds-color-content-title)" }}>{fmtV(data.completed)}</strong></span>
        <span>Restam <strong style={{ color: "var(--ds-color-content-title)" }}>{fmtV(data.remaining)}</strong></span>
        {isHours && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
            title={unestimated.length > 0 ? `Sem Original Estimate: ${unestimated.join(", ")}` : undefined}
            style={{
              background: unestimated.length > 0 ? "var(--ds-color-feedback-alert-surface)" : "var(--ds-color-feedback-positive-surface)",
              color: unestimated.length > 0 ? "var(--ds-color-feedback-alert-label)" : "var(--ds-color-feedback-positive-label)",
            }}
          >
            {unestimated.length > 0
              ? `${unestimated.length} ${unestimated.length === 1 ? "subtask sem estimativa" : "subtasks sem estimativa"}`
              : "Todas as subtasks estimadas"}
          </span>
        )}
      </div>
      {/* Subtasks sem estimativa (todas precisam estar estimadas): links para corrigir no Jira */}
      {unestimated.length > 0 && (
        <p className="-mt-1 mb-2 text-[11px] leading-relaxed" style={{ color: "var(--ds-color-content-body)" }}>
          Sem Original Estimate:{" "}
          {unestimated.slice(0, 8).map((k, i) => (
            <span key={k}>
              {i > 0 && ", "}
              <a href={`https://montebravo.atlassian.net/browse/${k}`} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "var(--ds-color-content-primary)" }}>{k}</a>
            </span>
          ))}
          {unestimated.length > 8 && ` e mais ${unestimated.length - 8}`}
        </p>
      )}
      <div style={{ position: "relative", width: "100%", flex: "1 1 auto", minHeight: 230, maxHeight: 400 }}>
        <div style={{ position: "absolute", inset: 0 }}>
        <ResponsiveContainer>
          <ComposedChart data={data.rows} margin={{ top: 22, right: 12, left: -6, bottom: 0 }}>
            <defs>
              <linearGradient id="bd-ideal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={t.series[0]} stopOpacity={0.42} />
                <stop offset="100%" stopColor={t.series[0]} stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical stroke={t.grid} strokeOpacity={0.55} />
            <XAxis
              type="number"
              dataKey="x"
              domain={[0, data.totalDays]}
              ticks={ticks}
              interval={0}
              tick={(p: { x?: number; y?: number; payload?: { value: number } }) => {
                const v = p.payload?.value ?? 0;
                const isEnd = Math.abs(v - data.totalDays) < 0.001;
                const strong = v === 0 || isEnd;
                return (
                  <text key={`xt-${v}`} x={p.x} y={(p.y ?? 0) + 12} textAnchor={v === 0 ? "start" : isEnd ? "end" : "middle"} fill={strong ? t.body : t.muted} fontSize={10} fontWeight={strong ? 600 : 400}>
                    {tickLabel(v)}
                  </text>
                );
              }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis domain={[0, Math.ceil(maxY * 1.1)]} allowDecimals={false} tickFormatter={(v) => (isHours ? `${v}h` : String(v))} tick={{ fill: t.muted, fontSize: 10 }} axisLine={false} tickLine={false} width={isHours ? 46 : 34} />
            <Tooltip
              cursor={{ stroke: t.muted, strokeDasharray: "3 3" }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const row = payload[0].payload as { at: string; ideal: number; remaining: number | null };
                return (
                  <div style={{ background: t.surface, border: `1px solid ${t.grid}`, borderRadius: 12, padding: "8px 12px", fontSize: 12, color: t.title }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{fmtDateTime(row.at)}</div>
                    {row.remaining !== null && <div>Restam: <strong>{fmtV(row.remaining)}</strong>{unitWord(row.remaining)}</div>}
                    <div style={{ color: t.muted }}>Ideal: {fmtV(Math.round(row.ideal * 10) / 10)}</div>
                  </div>
                );
              }}
            />
            <Area isAnimationActive={false} type="linear" dataKey="ideal" stroke="none" fill="url(#bd-ideal)" activeDot={false} />
            <Line
              isAnimationActive={false}
              type="monotone"
              dataKey="remaining"
              stroke={t.title}
              strokeWidth={2.5}
              connectNulls={false}
              dot={(p: { cx?: number; cy?: number; index?: number }) =>
                isMarked(p.index) ? (
                  <circle key={`d-${p.index}`} cx={p.cx} cy={p.cy} r={5} fill={t.surface} stroke={t.title} strokeWidth={2.5} />
                ) : (
                  <g key={`d-${p.index}`} />
                )
              }
              label={(p: { x?: number; y?: number; value?: number | null; index?: number }) =>
                isMarked(p.index) ? (
                  <text key={`l-${p.index}`} x={p.x} y={(p.y ?? 0) - 12} textAnchor={p.index === 0 ? "start" : "middle"} fill={t.title} fontSize={13} fontWeight={600}>
                    {p.value === null || p.value === undefined ? "" : fmtV(p.value)}
                  </text>
                ) : (
                  <g key={`l-${p.index}`} />
                )
              }
            />
          </ComposedChart>
        </ResponsiveContainer>
        </div>
      </div>
      <p className="mt-1 text-[11px] t-muted leading-relaxed">
        {reading} Linha ideal em dias corridos; atualizado às {fmtDateTime(data.asOf).slice(-5)}.
      </p>
    </div>
  );
}
