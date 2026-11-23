"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import MetricTooltip from "@/components/ui/MetricTooltip";
import type { R2ProgressResult } from "@/metrics/r2-progress";
import R2Progress from "./R2Progress";
import { buildExecutiveNarrative, type ExecFeature, type FeatureState, type SprintExecutiveResult } from "@/metrics/sprint-executive";

interface SprintExecutiveProps {
  squadSlug: string;
  /** Mesmo filtro de tipos do dashboard (query ?issueType=...). */
  issueType?: string;
  /** Progresso da release ativa (Épicos e Features), exibido abaixo do avanço da sprint */
  releaseProgress?: R2ProgressResult;
}

const REFRESH_MS = 5 * 60 * 1000;
const JIRA_BROWSE = "https://montebravo.atlassian.net/browse/";

const STATE_LABEL: Record<FeatureState, string> = {
  bloqueada: "Bloqueada",
  "em-andamento": "Em andamento",
  "nao-iniciada": "Por começar",
  concluida: "Concluída",
};
/** Célula de situação preenchida (como num quadro de gestão), com as cores de feedback do DS. */
const STATE_CELL: Record<FeatureState, { bg: string; fg: string }> = {
  bloqueada: { bg: "var(--ds-color-feedback-negative-surface)", fg: "var(--ds-color-feedback-negative-label)" },
  "em-andamento": { bg: "var(--ds-color-feedback-primary-surface)", fg: "var(--ds-color-feedback-primary-label)" },
  "nao-iniciada": { bg: "var(--ds-color-feedback-neutral-surface)", fg: "var(--ds-color-feedback-neutral-label)" },
  concluida: { bg: "var(--ds-color-feedback-positive-surface)", fg: "var(--ds-color-feedback-positive-label)" },
};
const STATE_COLOR: Record<FeatureState, string> = {
  bloqueada: "var(--ds-color-content-negative)",
  "em-andamento": "var(--ds-color-content-primary)",
  "nao-iniciada": "var(--ds-color-content-disabled)",
  concluida: "var(--ds-color-content-positive)",
};

const SUBTASK_TOOLTIP =
  "Subtasks (Sub-task e Sub-bug) em horas, pelo Original Estimate. Mesma base do Burndown em horas. Subtask sem estimativa não entra na conta.";
const ALLOCATED_TOOLTIP =
  "Horas alocadas da sprint: para cada card, vale o maior entre a estimativa do card e a soma das subtasks, sem somar os dois. Mesma base das Horas alocadas da Capacidade da Sprint.";

const fmtH = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1).replace(".", ",")}h`;

function fmtDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3_600_000);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function fmtTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 3 * 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function Bar({ pct, color = "var(--ds-color-content-primary)", height = 10 }: { pct: number; color?: string; height?: number }) {
  return (
    <div
      className="w-full overflow-hidden rounded-full"
      style={{ height, background: "var(--ds-color-container-divider-card)" }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, background: color }} />
    </div>
  );
}

const BORDER = "1px solid var(--ds-color-container-divider-card)";

/** Um número do detalhe da Feature: rótulo pequeno e valor */
function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ds-color-content-caption)" }}>{label}</p>
      <p className="mt-0.5 text-[13px] tabular-nums" style={{ color: "var(--ds-color-content-title)" }}>{value}</p>
      {hint && <p className="text-[11px]" style={{ color: "var(--ds-color-content-subdued)" }}>{hint}</p>}
    </div>
  );
}

/**
 * Linha da Feature: nome inteiro (quebra em várias linhas), situação e bloqueio.
 * Clique abre o detalhe: cards, andamento e as duas visões de horas.
 */
function FeatureRow({ f, open, onToggle }: { f: ExecFeature; open: boolean; onToggle: () => void }) {
  const cell = STATE_CELL[f.state];
  const shownBlockers = f.blockedCardKeys.slice(0, 2);
  const moreBlockers = f.blockedCardKeys.length - shownBlockers.length;
  const progressPct = f.allocatedHours.total > 0 ? f.allocatedHours.pct : f.cards.total > 0 ? Math.round((f.cards.done / f.cards.total) * 100) : 0;
  return (
    <li style={{ borderTop: BORDER }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className="grid cursor-pointer grid-cols-[minmax(0,1fr)_112px_92px_20px] items-stretch transition hover:bg-[var(--ds-color-input-surface-hover)]"
        style={{ borderLeft: `3px solid ${STATE_COLOR[f.state]}` }}
      >
        <p className="px-3 py-2.5 text-[12px] leading-snug" style={{ color: "var(--ds-color-content-title)" }}>
          <a
            href={`${JIRA_BROWSE}${f.key}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-semibold underline-offset-2 hover:underline"
            style={{ color: "var(--ds-color-content-primary)" }}
          >
            {f.key}
          </a>{" "}
          {f.title}
        </p>
        <div className="flex items-center justify-center px-2 text-[11px] font-semibold" style={{ background: cell.bg, color: cell.fg }}>
          {STATE_LABEL[f.state]}
        </div>
        <div className="flex items-center px-2.5 text-[11px]">
          {f.blockedCardKeys.length === 0 ? (
            <span className="t-muted">—</span>
          ) : (
            <span className="font-semibold" style={{ color: "var(--ds-color-content-negative)" }} title={f.blockNote}>
              {shownBlockers.map((k, i) => (
                <span key={k}>
                  {i > 0 && ", "}
                  <a href={`${JIRA_BROWSE}${k}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="underline-offset-2 hover:underline">{k}</a>
                </span>
              ))}
              {moreBlockers > 0 && ` +${moreBlockers}`}
            </span>
          )}
        </div>
        <div className="flex items-center justify-center" aria-hidden="true" style={{ color: "var(--ds-color-content-subdued)" }}>
          <svg width="12" height="12" viewBox="0 0 12 12" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>
            <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {open && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 pb-3 pt-1 sm:grid-cols-4" style={{ borderLeft: `3px solid ${STATE_COLOR[f.state]}`, background: "var(--ds-color-container-card-surface-default)" }}>
          <Stat label="Cards" value={`${f.cards.done} de ${f.cards.total}`} hint="concluídos" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ds-color-content-caption)" }}>Andamento</p>
            <p className="mt-0.5 text-[13px] tabular-nums" style={{ color: "var(--ds-color-content-title)" }}>{progressPct}%</p>
            <div className="mt-1"><Bar pct={progressPct} color={STATE_COLOR[f.state]} height={5} /></div>
          </div>
          <Stat
            label="Horas alocadas"
            value={f.allocatedHours.total > 0 ? `${fmtH(f.allocatedHours.done)} de ${fmtH(f.allocatedHours.total)}` : "sem estimativa"}
            hint="cards e subtasks"
          />
          <Stat
            label="Horas em subtasks"
            value={f.subtaskHours.total > 0 ? `${fmtH(f.subtaskHours.done)} de ${fmtH(f.subtaskHours.total)}` : "sem subtasks estimadas"}
            hint="base do Burndown"
          />
          {f.state === "bloqueada" && f.blockNote && (
            <p className="col-span-2 text-[12px] font-medium sm:col-span-4" style={{ color: "var(--ds-color-content-negative)" }}>
              Bloqueio: {f.blockNote}.
            </p>
          )}
        </div>
      )}
    </li>
  );
}
/**
 * Resumo executivo da sprint vigente: quais Features estão priorizadas, quanto já foi concluído
 * (cards e horas alocadas) e onde há bloqueio. Hierarquia de texto do Resumo da Squad:
 * rótulo pequeno, frase de abertura grande, frase de atenção, detalhe em texto menor.
 * As Features ficam numa tabela compacta (uma linha por Feature), bloqueadas primeiro.
 */
export default function SprintExecutive({ squadSlug, issueType, releaseProgress }: SprintExecutiveProps) {
  // Só mostra o progresso da release quando há Épicos ou Features na release ativa
  const hasRelease = !!releaseProgress && releaseProgress.epics.total + releaseProgress.features.total > 0;
  const release = hasRelease && releaseProgress ? (
    <div className="mt-6">
      <div className="mb-4 h-px w-full" style={{ background: "var(--ds-color-container-divider-card)" }} />
      <R2Progress r2Progress={releaseProgress} embedded />
    </div>
  ) : null;
  const [data, setData] = useState<SprintExecutiveResult | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "empty" | "error">("loading");
  const [message, setMessage] = useState("");
  // Features abertas no drilldown
  const [openKeys, setOpenKeys] = useState<Set<string>>(new Set());
  const toggle = (key: string) => setOpenKeys((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });

  const load = useCallback(async () => {
    try {
      const qs = issueType ? `?issueType=${encodeURIComponent(issueType)}` : "";
      const res = await fetch(`/api/sprint-executive/${squadSlug}${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "Falha ao buscar a sprint");
      if (!json.executive) { setData(null); setState("empty"); return; }
      setData(json.executive as SprintExecutiveResult);
      setState("ok");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Erro ao buscar o resumo da sprint");
      setState("error");
    }
  }, [squadSlug, issueType]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const title = (
    <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide t-secondary">
      Resumo executivo — sprint vigente
    </h3>
  );

  if (state !== "ok" || !data) {
    return (
      <section className="theme-section" aria-label="Resumo executivo da sprint">
        <div className="mb-2">{title}</div>
        <p className="py-4 text-[12px] t-muted">
          {state === "loading" && "Buscando as Features da sprint no Jira…"}
          {state === "empty" && "Nenhuma sprint ativa no momento."}
          {state === "error" && (
            <>
              {message}{" "}
              <button onClick={() => { setState("loading"); load(); }} className="underline" style={{ color: "var(--ds-color-content-primary)" }}>Tentar de novo</button>
            </>
          )}
        </p>
        {/* Sem sprint ativa (ou carregando), a release continua visível */}
        {release && <div className="max-w-xl">{release}</div>}
      </section>
    );
  }

  const n = buildExecutiveNarrative(data);
  const t = data.totals;
  const attentionColor = n.attentionTone === "negative" ? "var(--ds-color-content-negative)" : n.attentionTone === "positive" ? "var(--ds-color-content-positive)" : "var(--ds-color-content-body)";
  const head = "px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide";
  const allOpen = data.features.length > 0 && data.features.every((f) => openKeys.has(f.key));

  return (
    <section className="theme-section" aria-label="Resumo executivo da sprint">
      <div className="mb-4 flex items-start justify-between gap-3">
        {title}
        {t.features.blocked > 0 ? (
          <span className="ds-badge ds-badge-negative shrink-0">{t.features.blocked === 1 ? "1 Feature bloqueada" : `${t.features.blocked} Features bloqueadas`}</span>
        ) : t.cards.blocked > 0 ? (
          <span className="ds-badge ds-badge-negative shrink-0">{t.cards.blocked === 1 ? "1 card bloqueado" : `${t.cards.blocked} cards bloqueados`}</span>
        ) : (
          <span className="ds-badge ds-badge-positive shrink-0">Sem bloqueios</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* Esquerda: leitura em frases e progresso */}
        <div className="flex flex-col">
          <p className="text-[20px] leading-snug" style={{ color: "var(--ds-color-content-body)" }}>
            <strong className="font-semibold" style={{ color: "var(--ds-color-content-title)" }}>{n.lead}</strong>
            {n.leadRest && <> {n.leadRest}</>}
          </p>

          <div className="my-4 h-px w-full" style={{ background: "var(--ds-color-container-divider-card)" }} />

          <p className="text-[16px] leading-snug" style={{ color: attentionColor }}>{n.attention}</p>

          {/* Progresso: cards e horas alocadas */}
          <div className="mt-6 space-y-5">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[15px]" style={{ color: "var(--ds-color-content-title)" }}>
                {t.cards.done} de {t.cards.total} {t.cards.total === 1 ? "card concluído" : "cards concluídos"}
                <MetricTooltip text="Cards = standard issues da sprint (História, Bug, Design, Technical Debt, Kaizen, Task, Spike), conforme o filtro de tipos da tela." />
              </p>
              <Bar pct={t.cards.pct} height={12} />
              <p className="mt-1.5 text-[12px]">
                <span style={{ color: "var(--ds-color-content-positive)" }}>{t.cards.pct}% concluído</span>
                {t.cards.blocked > 0 && (
                  <>
                    <span className="t-muted"> | </span>
                    <span style={{ color: "var(--ds-color-content-negative)" }}>{t.cards.blocked === 1 ? "1 card bloqueado" : `${t.cards.blocked} cards bloqueados`}</span>
                  </>
                )}
              </p>
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[15px]" style={{ color: "var(--ds-color-content-title)" }}>
                {fmtH(t.subtaskHours.done)} de {fmtH(t.subtaskHours.total)} em subtasks concluídas
                <MetricTooltip text={SUBTASK_TOOLTIP} />
              </p>
              <Bar pct={t.subtaskHours.pct} height={12} />
              <p className="mt-1.5 text-[12px]">
                <span style={{ color: "var(--ds-color-content-positive)" }}>{t.subtaskHours.pct}% concluído</span>
                {t.subtaskHours.unestimatedSubtasks > 0 && (
                  <>
                    <span className="t-muted"> | </span>
                    <span style={{ color: "var(--ds-color-content-alert)" }}>{t.subtaskHours.unestimatedSubtasks === 1 ? "1 subtask sem estimativa" : `${t.subtaskHours.unestimatedSubtasks} subtasks sem estimativa`}</span>
                  </>
                )}
              </p>
            </div>

            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[15px]" style={{ color: "var(--ds-color-content-title)" }}>
                {fmtH(t.allocatedHours.done)} de {fmtH(t.allocatedHours.total)} alocadas concluídas
                <MetricTooltip text={ALLOCATED_TOOLTIP} />
              </p>
              <Bar pct={t.allocatedHours.pct} height={12} />
              <p className="mt-1.5 text-[12px]">
                <span style={{ color: "var(--ds-color-content-positive)" }}>{t.allocatedHours.pct}% concluído</span>
                <span className="t-muted"> | cards e subtasks, mesma base da Capacidade</span>
              </p>
            </div>
          </div>
          {/* Progresso da release ativa: Épicos e Features */}
          {release}
        </div>

        {/* Direita: tabela de Features priorizadas, bloqueadas primeiro */}
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--ds-color-content-caption)" }}>
            Features priorizadas ({t.features.total})
          </p>
          {data.features.length === 0 ? (
            <p className="py-3 text-[12px] t-muted">Nenhum card da sprint está ligado a uma Feature.</p>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl" style={{ border: BORDER }}>
                <div className="grid grid-cols-[minmax(0,1fr)_112px_92px_20px]" style={{ background: "var(--ds-color-container-card-surface-default)", color: "var(--ds-color-content-caption)" }}>
                  <p className={head}>Feature</p>
                  <p className={`${head} text-center`}>Situação</p>
                  <p className={head}>Bloqueio</p>
                  <span />
                </div>
                <ul>
                  {data.features.map((f) => (
                    <FeatureRow key={f.key} f={f} open={openKeys.has(f.key)} onToggle={() => toggle(f.key)} />
                  ))}
                </ul>
              </div>
              <button
                type="button"
                onClick={() => setOpenKeys(allOpen ? new Set() : new Set(data.features.map((f) => f.key)))}
                className="mt-2 text-[11px] font-medium"
                style={{ color: "var(--ds-color-content-primary)" }}
              >
                {allOpen ? "Recolher todas" : "Abrir o detalhe de todas"}
              </button>
              <span className="ml-2 text-[11px] t-muted">Clique na Feature para ver cards, andamento e horas.</span>
            </>          )}
        </div>
      </div>

      {/* Transparência: base dos números */}
      <p className="mt-5 text-[10px] t-muted">
        Base: {data.sprint.name} ({fmtDate(data.sprint.startDate)} a {fmtDate(data.sprint.endDate)}), atualizado às {fmtTime(data.asOf)}.
      </p>
    </section>
  );
}
