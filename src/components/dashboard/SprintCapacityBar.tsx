"use client";
import { useCallback, useEffect, useState } from "react";
import type { SprintCapacityResult } from "@/services/sprint-capacity";

interface SprintCapacityBarProps {
  squadSlug: string;
  /** Mesmo filtro de tipos da tela (query ?issueType=...) */
  issueType?: string;
}

const REFRESH_MS = 5 * 60 * 1000;
const TZ = "America/Sao_Paulo";
const BRT_OFFSET_MS = 3 * 3_600_000;

function fmtDayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ });
}
function fmtHours(h: number): string {
  return `${h.toLocaleString("pt-BR")}h`;
}

/** Posição (0..1) de agora na faixa de dias úteis: dias passados + fração do dia corrente. */
function timeProgress(days: string[], now: Date): { pos: number; todayIdx: number } {
  const n = days.length;
  if (n === 0) return { pos: 0, todayIdx: -1 };
  const local = new Date(now.getTime() - BRT_OFFSET_MS);
  const today = local.toISOString().slice(0, 10);
  if (today < days[0]) return { pos: 0, todayIdx: -1 };
  if (today > days[n - 1]) return { pos: 1, todayIdx: n };
  const idx = days.findIndex((d) => d >= today);
  if (days[idx] !== today) return { pos: idx / n, todayIdx: -1 }; // fim de semana: entre dois dias úteis
  const dayFraction = (local.getUTCHours() * 60 + local.getUTCMinutes()) / (24 * 60);
  return { pos: (idx + dayFraction) / n, todayIdx: idx };
}

/**
 * Capacidade da sprint vigente (ou da próxima, quando a vigente já foi concluída no Jira), em tempo real.
 * Mesmo desenho do Calendário da Release: big numbers + faixa do tempo (dias úteis, marcador HOJE)
 * + faixa das horas (concluído, restante e livre sobre a capacidade).
 */
export default function SprintCapacityBar({ squadSlug, issueType }: SprintCapacityBarProps) {
  const [data, setData] = useState<SprintCapacityResult | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "empty" | "error">("loading");

  const load = useCallback(async () => {
    try {
      const qs = issueType ? `?issueType=${encodeURIComponent(issueType)}` : "";
      const res = await fetch(`/api/sprint-capacity/${squadSlug}${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "erro");
      if (!json.capacity) {
        setData(null);
        setState("empty");
        return;
      }
      setData(json.capacity as SprintCapacityResult);
      setState("ok");
    } catch {
      setState("error");
    }
  }, [squadSlug, issueType]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    // Capacidade alterada no modal (Administrador → Capacidade): busca de novo na hora
    const onUpdated = (e: Event) => {
      const squad = (e as CustomEvent<{ squad?: string }>).detail?.squad;
      if (!squad || squad === squadSlug) load();
    };
    window.addEventListener("capacity-updated", onUpdated);
    return () => {
      clearInterval(id);
      window.removeEventListener("capacity-updated", onUpdated);
    };
  }, [load, squadSlug]);

  const title = (
    <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide t-secondary">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Capacidade da Sprint{data ? ` — ${data.sprint.name}` : ""}
    </h3>
  );

  if (state !== "ok" || !data) {
    return (
      <section className="theme-section" aria-label="Capacidade da sprint">
        <div className="mb-2 flex items-center justify-between gap-3">{title}</div>
        <p className="py-3 text-[11px] t-muted">
          {state === "loading" && "Buscando a sprint no Jira…"}
          {state === "empty" && "Nenhuma sprint ativa ou planejada no Jira."}
          {state === "error" && (
            <>
              Não foi possível buscar a capacidade da sprint.{" "}
              <button onClick={() => { setState("loading"); load(); }} className="underline" style={{ color: "var(--ds-color-content-primary)" }}>
                Tentar de novo
              </button>
            </>
          )}
        </p>
      </section>
    );
  }

  const now = new Date();
  const n = data.days.length;
  const { pos, todayIdx } = timeProgress(data.days, now);
  const overdue = data.state === "active" && now.getTime() > new Date(data.sprint.endDate).getTime();
  const status =
    data.state === "future"
      ? { text: "Aguardando start", bg: "var(--ds-color-feedback-alert-surface)", fg: "var(--ds-color-feedback-alert-label)" }
      : overdue
      ? { text: "Aguardando conclusão", bg: "var(--ds-color-feedback-alert-surface)", fg: "var(--ds-color-feedback-alert-label)" }
      : { text: "Em curso", bg: "var(--ds-color-feedback-primary-surface)", fg: "var(--ds-color-feedback-primary-label)" };

  // Faixa das horas: escala = maior entre capacidade e alocado (o excesso aparece além da linha de 100%)
  const done = Math.max(0, data.allocatedHours - data.remainingHours);
  const remaining = Math.min(data.remainingHours, data.allocatedHours || data.remainingHours);
  const free = Math.max(0, data.availableHours - data.allocatedHours);
  // Folga de 12% depois do maior valor, para o marcador de capacidade ficar sempre visível dentro da barra
  const scale = Math.max(data.availableHours, data.allocatedHours, 1) * 1.12;
  const pct = (h: number) => `${(h / scale) * 100}%`;
  const capacityMark = data.availableHours / scale;
  const over = data.allocatedHours > data.availableHours;
  const occupation = data.availableHours > 0 ? Math.round((data.allocatedHours / data.availableHours) * 100) : 0;

  // Rótulo do meio da faixa do tempo
  const dayLabel =
    data.state === "future"
      ? `${n} dias úteis`
      : todayIdx === n
      ? `${n} de ${n} dias úteis`
      : todayIdx >= 0
      ? `Dia útil ${todayIdx + 1} de ${n}`
      : `${Math.round(pos * n)} de ${n} dias úteis`;

  const numbers: { label: string; value: string; hint?: string }[] = [
    { label: "Pessoas", value: String(data.teamSize) },
    { label: "Horas disponíveis", value: fmtHours(data.availableHours), hint: `${data.teamSize} × 6h × ${data.businessDays} dias úteis` },
    { label: "Horas alocadas", value: fmtHours(data.allocatedHours), hint: `${occupation}% da capacidade` },
    { label: "Horas restantes", value: fmtHours(data.remainingHours), hint: "Comprometido desta sprint ainda não concluído" },
  ];

  return (
    <section className="theme-section" aria-label="Capacidade da sprint">
      <div className="mb-3 flex items-center justify-between gap-3">
        {title}
        <div className="flex items-center gap-2">
          <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: status.bg, color: status.fg }}>
            {status.text}
          </span>
          <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: "var(--ds-color-feedback-primary-surface)", color: "var(--ds-color-feedback-primary-label)" }}>
            Tempo real
          </span>
        </div>
      </div>

      {/* Big numbers */}
      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4">
        {numbers.map((nb) => (
          <div key={nb.label} className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--ds-color-content-caption)" }}>{nb.label}</p>
            <p className="text-xl font-medium leading-tight" style={{ color: "var(--ds-color-content-title)" }}>{nb.value}</p>
            {nb.hint && <p className="truncate text-[10px] t-muted">{nb.hint}</p>}
          </div>
        ))}
      </div>

      {/* Faixa do tempo: um segmento por dia útil, marcador HOJE */}
      <div className="relative pt-5" aria-label="Dias úteis da sprint">
        {data.state === "active" && (
          <div className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${pos * 100}%` }}>
            <span className="text-[10px] font-bold tracking-wide" style={{ color: "var(--ds-color-content-primary)" }}>HOJE</span>
          </div>
        )}
        <div className="flex gap-[2px]">
          {data.days.map((d, i) => {
            const passed = data.state === "active" && (i < todayIdx || todayIdx === n);
            const isToday = data.state === "active" && i === todayIdx;
            return (
              <div
                key={d}
                title={new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" })}
                className="relative h-3 flex-1 overflow-hidden"
                style={{
                  background: passed ? "var(--ds-color-content-primary)" : "var(--ds-color-container-divider-card)",
                  borderTopLeftRadius: i === 0 ? 999 : 0,
                  borderBottomLeftRadius: i === 0 ? 999 : 0,
                  borderTopRightRadius: i === n - 1 ? 999 : 0,
                  borderBottomRightRadius: i === n - 1 ? 999 : 0,
                }}
              >
                {isToday && <div className="h-full" style={{ width: `${(pos * n - i) * 100}%`, background: "var(--ds-color-content-primary)" }} />}
              </div>
            );
          })}
        </div>
        {data.state === "active" && (
          <span
            className="absolute h-4 w-4 -translate-x-1/2 rounded-full border-2"
            style={{ left: `${pos * 100}%`, top: "calc(1.25rem - 2px)", background: "var(--ds-color-container-popover-surface)", borderColor: "var(--ds-color-content-primary)" }}
            aria-hidden="true"
          />
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] t-muted">
        <span>Início {fmtDayMonth(data.sprint.startDate)}</span>
        <span>
          {dayLabel}
        </span>
        <span>Fim {fmtDayMonth(data.sprint.endDate)}</span>
      </div>

      {/* Faixa das horas: concluído + restante (= alocado) sobre a capacidade, com o marcador da capacidade sempre visível */}
      <div className="relative mt-4 pt-5" aria-label="Horas da sprint">
        {/* Rótulo do marcador de capacidade */}
        <div
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold tracking-wide"
          style={{ left: `${capacityMark * 100}%`, color: "var(--ds-color-content-title)" }}
        >
          CAPACIDADE {fmtHours(data.availableHours)}
        </div>
        <div className="relative flex h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--ds-color-container-divider-card)" }}>
          {done > 0 && <div className="relative" title={`Concluído: ${fmtHours(done)}`} style={{ width: pct(done), background: "var(--ds-color-content-positive)" }} />}
          {remaining > 0 && <div className="relative" title={`Restante: ${fmtHours(remaining)}`} style={{ width: pct(remaining), background: "var(--ds-color-content-primary)" }} />}
          {/* Alocado acima da capacidade do time: o trecho depois do marcador fica vermelho */}
          {over && (
            <div
              className="absolute inset-y-0"
              title={`Acima da capacidade: ${fmtHours(data.allocatedHours - data.availableHours)}`}
              style={{ left: `${capacityMark * 100}%`, width: pct(data.allocatedHours - data.availableHours), background: "var(--capacity-over)" }}
            />
          )}
        </div>
        {/* Marcador da capacidade do time (100%) */}
        <span
          className="absolute h-6 w-[3px] -translate-x-1/2 rounded"
          style={{ left: `${capacityMark * 100}%`, top: "calc(1.25rem - 6px)", background: "var(--ds-color-content-title)" }}
          title={`Capacidade do time: ${fmtHours(data.availableHours)}`}
          aria-hidden="true"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px]" style={{ color: "var(--ds-color-content-body)" }}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--ds-color-content-positive)" }} />Concluído {fmtHours(done)}</span>
          <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--ds-color-content-primary)" }} />Restante {fmtHours(data.remainingHours)}</span>
          <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-[3px] rounded" style={{ background: "var(--ds-color-content-title)" }} />Capacidade do time</span>
          {over && (<span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--capacity-over)" }} />Acima da capacidade {fmtHours(data.allocatedHours - data.availableHours)}</span>)}
        </div>
        {/* Leitura: abaixo ou acima da capacidade */}
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{
            background: over ? "var(--ds-color-feedback-negative-surface)" : "var(--ds-color-feedback-positive-surface)",
            color: over ? "var(--ds-color-feedback-negative-label)" : "var(--ds-color-feedback-positive-label)",
          }}
        >
          {over
            ? `Acima da capacidade: +${fmtHours(data.allocatedHours - data.availableHours)} (${occupation}%)`
            : `Abaixo da capacidade: ${fmtHours(free)} livres (${occupation}%)`}
        </span>
      </div>    </section>
  );
}
