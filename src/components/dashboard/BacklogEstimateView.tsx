"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { BacklogEstimateResult } from "@/services/backlog-estimate";

const JIRA_BROWSE = "https://montebravo.atlassian.net/browse/";
const REFRESH_MS = 5 * 60 * 1000;
const fmtHours = (h: number) => `${h.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}h`;
const cardsWord = (n: number) => (n === 1 ? "1 card" : `${n} cards`);

/**
 * Backlog estimado × capacidade da PRÓXIMA sprint: cards em Selected for Development (com ou sem sprint) mais os
 * cards da próxima sprint, cada um contado uma vez. Mesma régua de horas das demais visões.
 */
export default function BacklogEstimateView({ squadSlug, issueType, title, toggle }: { squadSlug: string; issueType?: string; title: ReactNode; toggle: ReactNode }) {
  const [data, setData] = useState<BacklogEstimateResult | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "empty" | "error">("loading");

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ mode: "backlog" });
      if (issueType) qs.set("issueType", issueType);
      const res = await fetch(`/api/sprint-capacity/${squadSlug}?${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "erro");
      if (!json.backlog) { setData(null); setState("empty"); return; }
      setData(json.backlog as BacklogEstimateResult);
      setState("ok");
    } catch {
      setState("error");
    }
  }, [squadSlug, issueType]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    const onUpdated = (e: Event) => {
      const squad = (e as CustomEvent<{ squad?: string }>).detail?.squad;
      if (!squad || squad === squadSlug) load();
    };
    window.addEventListener("capacity-updated", onUpdated);
    return () => { clearInterval(id); window.removeEventListener("capacity-updated", onUpdated); };
  }, [load, squadSlug]);

  const header = (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      {title}
      <div className="flex flex-wrap items-center gap-2">
        {toggle}
        <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: "var(--ds-color-feedback-primary-surface)", color: "var(--ds-color-feedback-primary-label)" }}>Tempo real</span>
      </div>
    </div>
  );

  if (state !== "ok" || !data) {
    return (
      <section className="theme-section" aria-label="Backlog estimado">
        {header}
        <p className="py-3 text-[11px] t-muted">
          {state === "loading" && "Buscando o backlog no Jira…"}
          {state === "empty" && "Nenhuma próxima sprint criada no Jira: crie a sprint para comparar o backlog com a capacidade."}
          {state === "error" && (
            <>Não foi possível buscar o backlog. <button onClick={() => { setState("loading"); load(); }} className="underline" style={{ color: "var(--ds-color-content-primary)" }}>Tentar de novo</button></>
          )}
        </p>
      </section>
    );
  }

  const cap = data.capacity.availableHours;
  const total = data.total.hours;
  const scale = Math.max(cap, total, 1) * 1.12;
  const pct = (h: number) => `${(h / scale) * 100}%`;
  const capMark = cap / scale;
  const over = total > cap;
  const occupation = cap > 0 ? Math.round((total / cap) * 100) : 0;
  const SPRINT_COLOR = "var(--ds-color-content-primary)";
  const SELECTED_COLOR = "var(--ds-color-feedback-primary-surface)";

  const numbers: { label: string; value: string; hint?: string }[] = [
    { label: "Backlog estimado", value: fmtHours(total), hint: cardsWord(data.total.cards) },
    { label: "Na próxima sprint", value: fmtHours(data.inNextSprint.hours), hint: `${cardsWord(data.inNextSprint.cards)}${data.inBoth ? ` (${data.inBoth} também em Selecionado)` : ""}` },
    { label: "Em Selecionado para Desenvolvimento", value: fmtHours(data.onlySelected.hours), hint: `${cardsWord(data.onlySelected.cards)} fora da sprint` },
    { label: "Capacidade da próxima sprint", value: fmtHours(cap), hint: `${data.capacity.teamSize} × ${data.capacity.hoursPerDay}h × ${data.capacity.businessDays} dias úteis` },
  ];

  return (
    <section className="theme-section" aria-label="Backlog estimado">
      {header}
      <p className="-mt-1 mb-3 text-[11px] t-muted">Comparado com a {data.nextSprint.name} (próxima sprint).</p>

      <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4">
        {numbers.map((nb) => (
          <div key={nb.label} className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--ds-color-content-caption)" }}>{nb.label}</p>
            <p className="text-xl font-medium leading-tight" style={{ color: "var(--ds-color-content-title)" }}>{nb.value}</p>
            {nb.hint && <p className="truncate text-[10px] t-muted" title={nb.hint}>{nb.hint}</p>}
          </div>
        ))}
      </div>

      {/* Faixa das horas: próxima sprint + só em Selected, sobre a capacidade da próxima sprint */}
      <div className="relative pt-5" aria-label="Horas do backlog">
        <div className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-bold tracking-wide" style={{ left: `${capMark * 100}%`, color: "var(--ds-color-content-title)" }}>
          CAPACIDADE {fmtHours(cap)}
        </div>
        <div className="relative flex h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--ds-color-container-divider-card)" }}>
          {data.inNextSprint.hours > 0 && <div title={`Na próxima sprint: ${fmtHours(data.inNextSprint.hours)}`} style={{ width: pct(data.inNextSprint.hours), background: SPRINT_COLOR }} />}
          {data.onlySelected.hours > 0 && <div title={`Em Selecionado para Desenvolvimento: ${fmtHours(data.onlySelected.hours)}`} style={{ width: pct(data.onlySelected.hours), background: SELECTED_COLOR, borderLeft: "1px solid var(--ds-color-container-card-surface-default)" }} />}
          {over && <div className="absolute inset-y-0" title={`Acima da capacidade: ${fmtHours(total - cap)}`} style={{ left: `${capMark * 100}%`, width: pct(total - cap), background: "var(--capacity-over)" }} />}
        </div>
        <span className="absolute h-6 w-[3px] -translate-x-1/2 rounded" style={{ left: `${capMark * 100}%`, top: "calc(1.25rem - 6px)", background: "var(--ds-color-content-title)" }} aria-hidden="true" />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px]" style={{ color: "var(--ds-color-content-body)" }}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SPRINT_COLOR }} />Na próxima sprint {fmtHours(data.inNextSprint.hours)}</span>
          <span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SELECTED_COLOR, border: "1px solid var(--ds-color-content-primary)" }} />Em Selecionado para Desenvolvimento {fmtHours(data.onlySelected.hours)}</span>
          <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-[3px] rounded" style={{ background: "var(--ds-color-content-title)" }} />Capacidade da próxima sprint</span>
        </div>
        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
          style={{ background: over ? "var(--ds-color-feedback-negative-surface)" : "var(--ds-color-feedback-positive-surface)", color: over ? "var(--ds-color-feedback-negative-label)" : "var(--ds-color-feedback-positive-label)" }}
        >
          {over ? `Backlog acima da capacidade: +${fmtHours(total - cap)} (${occupation}%)` : `Backlog cabe na capacidade: ${fmtHours(cap - total)} livres (${occupation}%)`}
        </span>
      </div>

      {data.excludedInActiveSprint.length > 0 && (
        <p className="mt-2 text-[11px] t-muted leading-relaxed">
          Fora do backlog por já estarem na sprint vigente ({data.excludedInActiveSprint.length}):{" "}
          {data.excludedInActiveSprint.slice(0, 8).map((k, i) => (
            <span key={k}>{i > 0 && ", "}<a href={`${JIRA_BROWSE}${k}`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{k}</a></span>
          ))}
          {data.excludedInActiveSprint.length > 8 && ` e mais ${data.excludedInActiveSprint.length - 8}`}.
        </p>
      )}
      {data.unestimatedCards.length > 0 && (
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--ds-color-content-alert)" }}>
          {data.unestimatedCards.length === 1 ? "1 card sem estimativa (soma 0h): " : `${data.unestimatedCards.length} cards sem estimativa (somam 0h): `}
          {data.unestimatedCards.slice(0, 8).map((k, i) => (
            <span key={k}>{i > 0 && ", "}<a href={`${JIRA_BROWSE}${k}`} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">{k}</a></span>
          ))}
          {data.unestimatedCards.length > 8 && ` e mais ${data.unestimatedCards.length - 8}`}.
        </p>
      )}
    </section>
  );
}
