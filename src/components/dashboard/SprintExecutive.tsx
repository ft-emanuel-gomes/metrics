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
/** Features visíveis de cara; as demais ficam recolhidas. */
const VISIBLE_FEATURES = 6;
const JIRA_BROWSE = "https://montebravo.atlassian.net/browse/";

const STATE_LABEL: Record<FeatureState, string> = {
  bloqueada: "Bloqueada",
  "em-andamento": "Em andamento",
  "nao-iniciada": "Por começar",
  concluida: "Concluída",
};
const STATE_BADGE: Record<FeatureState, string> = {
  bloqueada: "ds-badge-negative",
  "em-andamento": "ds-badge-primary",
  "nao-iniciada": "",
  concluida: "ds-badge-positive",
};
const STATE_COLOR: Record<FeatureState, string> = {
  bloqueada: "var(--ds-color-content-negative)",
  "em-andamento": "var(--ds-color-content-primary)",
  "nao-iniciada": "var(--ds-color-content-disabled)",
  concluida: "var(--ds-color-content-positive)",
};


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

function FeatureRow({ f }: { f: ExecFeature }) {
  const cardPct = f.cards.total > 0 ? Math.round((f.cards.done / f.cards.total) * 100) : 0;
  return (
    <li className="py-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-[13px] leading-snug" style={{ color: "var(--ds-color-content-title)" }}>
          <a href={`${JIRA_BROWSE}${f.key}`} target="_blank" rel="noopener noreferrer" className="font-semibold underline-offset-2 hover:underline" style={{ color: "var(--ds-color-content-primary)" }}>
            {f.key}
          </a>{" "}
          <span title={f.title}>{f.title}</span>
        </p>
        <span className={`ds-badge ${STATE_BADGE[f.state]} shrink-0`}>{STATE_LABEL[f.state]}</span>
      </div>
      <p className="mt-1 text-[12px]" style={{ color: "var(--ds-color-content-body)" }}>
        {f.cards.done} de {f.cards.total} {f.cards.total === 1 ? "card" : "cards"}
        {f.hours.total > 0 && <> · {fmtH(f.hours.done)} de {fmtH(f.hours.total)} em subtasks</>}
      </p>
      <div className="mt-1.5">
        <Bar pct={cardPct} color={STATE_COLOR[f.state]} height={4} />
      </div>
      {f.state === "bloqueada" && f.blockNote && (
        <p className="mt-1.5 text-[12px] font-medium" style={{ color: "var(--ds-color-content-negative)" }}>
          Bloqueio: {f.blockNote}.
        </p>
      )}
    </li>
  );
}

/**
 * Resumo executivo da sprint vigente: quais Features estão priorizadas, quanto já foi concluído
 * (cards e subtasks) e onde há bloqueio. Hierarquia de texto do Resumo da Squad:
 * rótulo pequeno, frase de abertura grande, frase de atenção, detalhe em texto menor.
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
  const visible = data.features.slice(0, VISIBLE_FEATURES);
  const rest = data.features.slice(VISIBLE_FEATURES);
  const attentionColor = n.attentionTone === "negative" ? "var(--ds-color-content-negative)" : n.attentionTone === "positive" ? "var(--ds-color-content-positive)" : "var(--ds-color-content-body)";

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

          {/* Progresso: cards e subtasks */}
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
                {fmtH(t.hours.done)} de {fmtH(t.hours.total)} em subtasks concluídas
                <MetricTooltip text="Subtasks (Sub-task e Sub-bug) em horas, pelo Original Estimate, a mesma base do Burndown em horas. Subtask sem estimativa não entra na conta." />
              </p>
              <Bar pct={t.hours.pct} height={12} />
              <p className="mt-1.5 text-[12px]">
                <span style={{ color: "var(--ds-color-content-positive)" }}>{t.hours.pct}% concluído</span>
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

        {/* Direita: Features priorizadas, bloqueadas primeiro */}
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--ds-color-content-caption)" }}>
            Features priorizadas ({t.features.total})
          </p>
          {data.features.length === 0 ? (
            <p className="py-3 text-[12px] t-muted">Nenhum card da sprint está ligado a uma Feature.</p>
          ) : (
            <>
              <ul className="divide-y" style={{ borderColor: "var(--ds-color-container-divider-card)" }}>
                {visible.map((f) => (
                  <FeatureRow key={f.key} f={f} />
                ))}
              </ul>
              {rest.length > 0 && (
                <details className="mt-1">
                  <summary className="cursor-pointer py-2 text-[12px] font-medium" style={{ color: "var(--ds-color-content-primary)" }}>
                    Ver as outras {rest.length} {rest.length === 1 ? "Feature" : "Features"}
                  </summary>
                  <ul className="divide-y" style={{ borderColor: "var(--ds-color-container-divider-card)" }}>
                    {rest.map((f) => (
                      <FeatureRow key={f.key} f={f} />
                    ))}
                  </ul>
                </details>
              )}
            </>
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
