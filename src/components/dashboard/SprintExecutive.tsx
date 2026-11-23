"use client";
import { useCallback, useEffect, useState } from "react";
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

const HOURS_TOOLTIP =
  "Horas alocadas da sprint: para cada card, vale o maior entre a estimativa do card e a soma das subtasks (Original Estimate), sem somar os dois. É a mesma base das Horas alocadas da Capacidade da Sprint. Concluído = horas dos itens já concluídos.";

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

const CELL = "px-2.5 py-2 align-middle";
const BORDER = "1px solid var(--ds-color-container-divider-card)";

/** Linha da tabela de Features: Feature | Situação | Cards | Andamento (horas) | Horas | Bloqueio */
function FeatureRow({ f }: { f: ExecFeature }) {
  const cell = STATE_CELL[f.state];
  const shownBlockers = f.blockedCardKeys.slice(0, 2);
  const moreBlockers = f.blockedCardKeys.length - shownBlockers.length;
  return (
    <tr style={{ borderTop: BORDER }}>
      {/* Faixa colorida à esquerda, na cor da situação */}
      <td className={`${CELL} min-w-0`} style={{ borderLeft: `3px solid ${STATE_COLOR[f.state]}` }}>
        <p className="truncate text-[12px] leading-snug" style={{ color: "var(--ds-color-content-title)" }} title={`${f.key} ${f.title}`}>
          <a href={`${JIRA_BROWSE}${f.key}`} target="_blank" rel="noopener noreferrer" className="font-semibold underline-offset-2 hover:underline" style={{ color: "var(--ds-color-content-primary)" }}>
            {f.key}
          </a>{" "}
          {f.title}
        </p>
      </td>
      <td className="p-0 align-middle" style={{ borderLeft: BORDER }}>
        <div className="flex h-full min-h-[34px] items-center justify-center px-2 text-[11px] font-semibold" style={{ background: cell.bg, color: cell.fg }}>
          {STATE_LABEL[f.state]}
        </div>
      </td>
      <td className={`${CELL} whitespace-nowrap text-center text-[12px] tabular-nums`} style={{ borderLeft: BORDER, color: "var(--ds-color-content-body)" }}>
        {f.cards.done}/{f.cards.total}
      </td>
      <td className={CELL} style={{ borderLeft: BORDER }}>
        <Bar pct={f.hours.total > 0 ? f.hours.pct : f.cards.total > 0 ? Math.round((f.cards.done / f.cards.total) * 100) : 0} color={STATE_COLOR[f.state]} height={6} />
      </td>
      <td className={`${CELL} whitespace-nowrap text-right text-[12px] tabular-nums`} style={{ borderLeft: BORDER, color: "var(--ds-color-content-body)" }}>
        {f.hours.total > 0 ? `${fmtH(f.hours.done)} / ${fmtH(f.hours.total)}` : <span className="t-muted">sem estimativa</span>}
      </td>
      <td className={`${CELL} whitespace-nowrap text-[11px]`} style={{ borderLeft: BORDER }}>
        {f.blockedCardKeys.length === 0 ? (
          <span className="t-muted">—</span>
        ) : (
          <span className="font-semibold" style={{ color: "var(--ds-color-content-negative)" }} title={f.blockNote}>
            {shownBlockers.map((k, i) => (
              <span key={k}>
                {i > 0 && ", "}
                <a href={`${JIRA_BROWSE}${k}`} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">{k}</a>
              </span>
            ))}
            {moreBlockers > 0 && ` +${moreBlockers}`}
          </span>
        )}
      </td>
    </tr>
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
  const head = "px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide";

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
                {fmtH(t.hours.done)} de {fmtH(t.hours.total)} alocadas concluídas
                <MetricTooltip text={HOURS_TOOLTIP} />
              </p>
              <Bar pct={t.hours.pct} height={12} />
              <p className="mt-1.5 text-[12px]">
                <span style={{ color: "var(--ds-color-content-positive)" }}>{t.hours.pct}% concluído</span>
                <span className="t-muted"> | cards e subtasks</span>
                {t.hours.unestimatedSubtasks > 0 && (
                  <>
                    <span className="t-muted"> | </span>
                    <span style={{ color: "var(--ds-color-content-alert)" }}>{t.hours.unestimatedSubtasks === 1 ? "1 subtask sem estimativa" : `${t.hours.unestimatedSubtasks} subtasks sem estimativa`}</span>
                  </>
                )}
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
            <div className="overflow-hidden rounded-xl" style={{ border: BORDER }}>
              <table className="w-full table-fixed border-collapse">
                <colgroup>
                  <col />
                  <col style={{ width: 108 }} />
                  <col style={{ width: 56 }} />
                  <col style={{ width: 84 }} />
                  <col style={{ width: 92 }} />
                  <col style={{ width: 96 }} />
                </colgroup>
                <thead>
                  <tr style={{ background: "var(--ds-color-container-card-surface-default)", color: "var(--ds-color-content-caption)" }}>
                    <th className={`${head} text-left`}>Feature</th>
                    <th className={`${head} text-center`} style={{ borderLeft: BORDER }}>Situação</th>
                    <th className={`${head} text-center`} style={{ borderLeft: BORDER }}>Cards</th>
                    <th className={`${head} text-left`} style={{ borderLeft: BORDER }}>Andamento</th>
                    <th className={`${head} text-right`} style={{ borderLeft: BORDER }}>
                      <span className="inline-flex items-center justify-end gap-1">Horas <MetricTooltip text={HOURS_TOOLTIP} /></span>
                    </th>
                    <th className={`${head} text-left`} style={{ borderLeft: BORDER }}>Bloqueio</th>
                  </tr>
                </thead>
                <tbody>
                  {data.features.map((f) => (
                    <FeatureRow key={f.key} f={f} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Transparência: base dos números */}
      <p className="mt-5 text-[10px] t-muted">
        Base: {data.sprint.name} ({fmtDate(data.sprint.startDate)} a {fmtDate(data.sprint.endDate)}), atualizado às {fmtTime(data.asOf)}.
      </p>
    </section>
  );
}
