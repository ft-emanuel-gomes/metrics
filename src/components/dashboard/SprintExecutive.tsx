"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import MetricTooltip from "@/components/ui/MetricTooltip";
import type { R2ProgressResult } from "@/metrics/r2-progress";
import R2Progress from "./R2Progress";
import { UNASSIGNED_ID, buildExecutiveNarrative, type ExecFeature, type ExecFeaturePerson, type FeatureState, type SprintExecutiveResult } from "@/metrics/sprint-executive";

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

const ALLOCATED_TOOLTIP =
  "Horas comprometidas nesta sprint: para cada card, vale o maior entre a estimativa do card e a soma das subtasks, sem somar os dois. O que foi concluído em sprints anteriores fica fora (ex.: card de 5h com 4h de subtasks feitas na sprint anterior = 1h comprometida). Concluído: card concluído conta todas as horas dele; card em andamento conta as subtasks concluídas nesta sprint.";

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
/** Colunas da tabela: Feature | Engenheiros | Situação | Andamento | seta */
const GRID_COLS = "grid-cols-[minmax(0,1fr)_128px_120px_200px_20px]";
/** Fotos visíveis na coluna Engenheiros; o resto vira "+N" */
const MAX_AVATARS = 4;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Foto do Jira; sem foto (ou se não carregar), as iniciais. Sem responsável: ícone neutro. */
function Avatar({ person, size = 24, ring = true }: { person: { accountId: string; name: string; avatarUrl?: string }; size?: number; ring?: boolean }) {
  const [failed, setFailed] = useState(false);
  const unassigned = person.accountId === UNASSIGNED_ID;
  const style = {
    width: size,
    height: size,
    boxShadow: ring ? "0 0 0 2px var(--bg-card)" : undefined,
    background: "var(--ds-color-feedback-primary-surface)",
    color: "var(--ds-color-feedback-primary-label)",
    fontSize: Math.round(size * 0.4),
  };
  if (!unassigned && person.avatarUrl && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={person.avatarUrl} alt={person.name} title={person.name} width={size} height={size} referrerPolicy="no-referrer" onError={() => setFailed(true)} className="shrink-0 rounded-full object-cover" style={style} />;
  }
  return (
    <span title={person.name} className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold" style={unassigned ? { ...style, background: "var(--ds-color-feedback-neutral-surface)", color: "var(--ds-color-feedback-neutral-label)" } : style}>
      {unassigned ? "?" : initials(person.name)}
    </span>
  );
}

/** Fotos sobrepostas dos engenheiros da Feature (até MAX_AVATARS) e "+N" com os demais nomes no hover. */
function AvatarStack({ people }: { people: ExecFeaturePerson[] }) {
  const named = people.filter((p) => p.accountId !== UNASSIGNED_ID);
  if (named.length === 0) return <span className="text-[11px] t-muted">Sem responsável</span>;
  const shown = named.slice(0, MAX_AVATARS);
  const rest = named.slice(MAX_AVATARS);
  return (
    <div className="flex items-center pl-1.5">
      {shown.map((p) => (
        <span key={p.accountId} className="-ml-1.5"><Avatar person={p} /></span>
      ))}
      {rest.length > 0 && (
        <span
          title={rest.map((p) => p.name).join(", ")}
          className="-ml-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[10px] font-semibold"
          style={{ boxShadow: "0 0 0 2px var(--bg-card)", background: "var(--ds-color-container-divider-card)", color: "var(--ds-color-content-title)" }}
        >
          +{rest.length}
        </span>
      )}
    </div>
  );
}

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
  const progressPct = f.allocatedHours.total > 0 ? f.allocatedHours.pct : f.cards.total > 0 ? Math.round((f.cards.done / f.cards.total) * 100) : 0;
  return (
    <li style={{ borderTop: BORDER }}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
        className={`grid cursor-pointer ${GRID_COLS} items-stretch transition hover:bg-[var(--ds-color-input-surface-hover)]`}
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
          {f.estimateAlerts.length > 0 && (
            <span className="ds-badge ds-badge-alert ml-1.5 align-middle" title="Estimativa de card a revisar no Jira. Abra o detalhe.">Revisar estimativa</span>
          )}
        </p>
        {/* Engenheiros: responsáveis dos cards e subtasks da Feature nesta sprint */}
        <div className="flex items-center px-2.5">
          <AvatarStack people={f.people} />
        </div>
        <div className="flex items-center justify-center px-2 text-[11px] font-semibold" style={{ background: cell.bg, color: cell.fg }}>
          {STATE_LABEL[f.state]}
        </div>
        {/* Andamento: % das horas alocadas (avanço de cards e subtasks) */}
        <div className="flex items-center gap-2 px-2.5" title={`${fmtH(f.allocatedHours.done)} de ${fmtH(f.allocatedHours.total)} alocadas`}>
          <span className="w-9 shrink-0 text-right text-[11px] font-semibold tabular-nums" style={{ color: "var(--ds-color-content-title)" }}>{progressPct}%</span>
          <div className="min-w-0 flex-1"><Bar pct={progressPct} color={STATE_COLOR[f.state]} height={5} /></div>
        </div>
        <div className="flex items-center justify-center" aria-hidden="true" style={{ color: "var(--ds-color-content-subdued)" }}>
          <svg width="12" height="12" viewBox="0 0 12 12" style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>
            <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {open && (
        <div className="grid grid-cols-3 gap-x-4 gap-y-3 px-4 pb-3 pt-1" style={{ borderLeft: `3px solid ${STATE_COLOR[f.state]}`, background: "var(--ds-color-container-card-surface-default)" }}>
          <Stat label="Cards" value={`${f.cards.done} de ${f.cards.total}`} hint="concluídos" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ds-color-content-caption)" }}>Bloqueio</p>
            {f.blockedCardKeys.length === 0 ? (
              <p className="mt-0.5 text-[13px]" style={{ color: "var(--ds-color-content-title)" }}>Sem bloqueio</p>
            ) : (
              <>
                <p className="mt-0.5 text-[13px] font-semibold" style={{ color: "var(--ds-color-content-negative)" }}>
                  {f.blockedCardKeys.map((k, i) => (
                    <span key={k}>
                      {i > 0 && ", "}
                      <a href={`${JIRA_BROWSE}${k}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="underline-offset-2 hover:underline">{k}</a>
                    </span>
                  ))}
                </p>
                <p className="text-[11px]" style={{ color: "var(--ds-color-content-subdued)" }}>impedimento marcado no Jira</p>
              </>
            )}
          </div>
          <Stat
            label="Horas alocadas"
            value={f.allocatedHours.total > 0 ? `${fmtH(f.allocatedHours.done)} de ${fmtH(f.allocatedHours.total)}` : "sem estimativa"}
            hint="avanço de cards e subtasks"
          />
          {/* Engenheiros: itens, horas alocadas e quanto falta de cada um (a soma bate com as horas da Feature) */}
          {f.people.length > 0 && (
            <div className="col-span-3 min-w-0">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ds-color-content-caption)" }}>Engenheiros</p>
              <div className="overflow-hidden rounded-lg" style={{ border: BORDER }}>
                <div className="grid grid-cols-[minmax(0,1fr)_64px_110px_110px] text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ds-color-content-caption)" }}>
                  <p className="px-3 py-1.5">Pessoa</p>
                  <p className="px-2 py-1.5 text-right">Itens</p>
                  <p className="px-2 py-1.5 text-right">Alocadas</p>
                  <p className="px-3 py-1.5 text-right">Falta concluir</p>
                </div>
                {f.people.map((p) => (
                  <div key={p.accountId || "sem-responsavel"} className="grid grid-cols-[minmax(0,1fr)_64px_110px_110px] items-center text-[12px] tabular-nums" style={{ borderTop: BORDER, color: "var(--ds-color-content-title)" }}>
                    <div className="flex min-w-0 items-center gap-2 px-3 py-1.5">
                      <Avatar person={p} size={22} ring={false} />
                      <span className="truncate" style={p.accountId === UNASSIGNED_ID ? { color: "var(--ds-color-content-subdued)" } : undefined}>{p.name}</span>
                    </div>
                    <p className="px-2 py-1.5 text-right">{p.items}</p>
                    <p className="px-2 py-1.5 text-right">{p.allocatedHours > 0 ? fmtH(p.allocatedHours) : <span className="t-muted">sem estimativa</span>}</p>
                    <p className="px-3 py-1.5 text-right" style={{ color: p.allocatedHours > 0 && p.remainingHours === 0 ? "var(--ds-color-content-positive)" : undefined }}>
                      {p.allocatedHours > 0 ? (p.remainingHours === 0 ? "concluído" : fmtH(p.remainingHours)) : "—"}
                    </p>
                    {/* Sem responsável: as issues desta Feature na sprint, com link para alocar no Jira (abertas primeiro) */}
                    {p.accountId === UNASSIGNED_ID && p.itemKeys.length > 0 && (
                      <p className="col-span-4 px-3 pb-2 text-[12px] leading-relaxed" style={{ color: "var(--ds-color-content-subdued)" }}>
                        {(() => {
                          const open = p.itemKeys.filter((i) => !i.done).length;
                          return open > 0 ? `${open === 1 ? "1 item aberto" : `${open} itens abertos`} para alocar: ` : "Itens já concluídos, sem responsável: ";
                        })()}
                        {p.itemKeys.map((i, idx) => (
                          <span key={i.key}>
                            {idx > 0 && ", "}
                            <a
                              href={`${JIRA_BROWSE}${i.key}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title={i.done ? "Concluído" : "Aberto: clique para alocar no Jira"}
                              className={`font-semibold underline-offset-2 hover:underline ${i.done ? "line-through" : ""}`}
                              style={{ color: i.done ? "var(--ds-color-content-subdued)" : "var(--ds-color-content-primary)" }}
                            >
                              {i.key}
                            </a>
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {f.estimateAlerts.map((a) => (
            <p key={a.cardKey} className="col-span-3 text-[12px] font-medium" style={{ color: "var(--ds-color-content-alert)" }}>
              Estimativa a revisar:{" "}
              <a href={`${JIRA_BROWSE}${a.cardKey}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="underline underline-offset-2">{a.cardKey}</a>{" "}
              {a.kind === "invalida"
                ? <>tem uma estimativa inválida no Jira (acima de 480h). Ela foi ignorada na conta, mas precisa ser corrigida.</>
                : <>tem {fmtH(a.cardHours)} no card{a.canceledHours > 0 ? ` (${fmtH(a.canceledHours)} de subtasks canceladas já descontadas)` : ""}, mas as subtasks somam {fmtH(a.subtaskHours)}. Como vale o maior valor, as horas desta Feature podem estar infladas.</>}
            </p>
          ))}
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
  // Progresso da release ativa (Épicos e Features): à direita do resumo, separado por linha vertical
  const releaseBody = hasRelease && releaseProgress ? <R2Progress r2Progress={releaseProgress} embedded /> : null;
  // Sem sprint ativa (ou carregando): a release aparece sozinha, abaixo da mensagem
  const release = releaseBody ? (
    <div className="mt-6">
      <div className="mb-4 h-px w-full" style={{ background: "var(--ds-color-container-divider-card)" }} />
      {releaseBody}
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

      {/*
        Parte de cima: resumo da sprint (esquerda) | linha vertical | Progresso da release (direita).
        Em telas estreitas as duas partes empilham e a linha vira horizontal.
      */}
      <div className={releaseBody ? "grid grid-cols-1 gap-y-6 lg:grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] lg:gap-x-10" : ""}>
        {/* Esquerda: leitura em frases e progresso */}
        <div className="flex min-w-0 flex-col">
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
                {fmtH(t.allocatedHours.done)} de {fmtH(t.allocatedHours.total)} alocadas concluídas
                <MetricTooltip text={ALLOCATED_TOOLTIP} />
              </p>
              <Bar pct={t.allocatedHours.pct} height={12} />
              <p className="mt-1.5 text-[12px]">
                <span style={{ color: "var(--ds-color-content-positive)" }}>{t.allocatedHours.pct}% concluído</span>
                <span className="t-muted"> | avanço de cards e subtasks</span>
                {t.allocatedHours.unestimatedSubtasks > 0 && (
                  <>
                    <span className="t-muted"> | </span>
                    <span style={{ color: "var(--ds-color-content-alert)" }}>{t.allocatedHours.unestimatedSubtasks === 1 ? "1 subtask sem estimativa" : `${t.allocatedHours.unestimatedSubtasks} subtasks sem estimativa`}</span>
                  </>
                )}
              </p>
              {t.estimateAlerts.length > 0 && (
                <p className="mt-1.5 flex items-start gap-1.5 text-[12px] leading-snug" style={{ color: "var(--ds-color-content-alert)" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" className="mt-[1px] shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M12 3l9.5 17H2.5L12 3z" strokeLinejoin="round" />
                    <path d="M12 10v4M12 17h.01" strokeLinecap="round" />
                  </svg>
                  <span>
                    {t.estimateAlerts.length === 1 ? "1 card com estimativa a revisar" : `${t.estimateAlerts.length} cards com estimativa a revisar`}:{" "}
                    {t.estimateAlerts.slice(0, 3).map((a, i) => (
                      <span key={a.cardKey}>
                        {i > 0 && ", "}
                        <a href={`${JIRA_BROWSE}${a.cardKey}`} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">{a.cardKey}</a>{" "}
                        ({a.kind === "invalida" ? "estimativa inválida, ignorada na conta" : `${fmtH(a.cardHours)} no card, ${fmtH(a.subtaskHours)} nas subtasks`})
                      </span>
                    ))}
                    {t.estimateAlerts.length > 3 && ` e mais ${t.estimateAlerts.length - 3}`}. Revise no Jira{t.estimateAlerts.some((a) => a.kind === "acima-subtasks") ? ": as horas alocadas podem estar infladas" : ""}.
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>

        {releaseBody && (
          <>
            {/* Divisória: vertical lado a lado, horizontal quando empilha */}
            <div className="h-px w-full lg:h-auto lg:w-px lg:self-stretch" style={{ background: "var(--ds-color-container-divider-card)" }} aria-hidden="true" />
            {/* Direita: Progresso da release ativa (Épicos e Features) */}
            <div className="flex min-w-0 flex-col justify-center">{releaseBody}</div>
          </>
        )}
      </div>

      {/* Divisória horizontal entre a parte de cima e a tabela de Features */}
      <div className="my-6 h-px w-full" style={{ background: "var(--ds-color-container-divider-card)" }} aria-hidden="true" />

      {/* Embaixo, na largura toda: tabela de Features priorizadas, bloqueadas primeiro */}
      <div>
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--ds-color-content-caption)" }}>
            Features priorizadas ({t.features.total})
          </p>
          {data.features.length === 0 ? (
            <p className="py-3 text-[12px] t-muted">Nenhum card da sprint está ligado a uma Feature.</p>
          ) : (
            <>
              <div className="overflow-hidden rounded-xl" style={{ border: BORDER }}>
                <div className={`grid ${GRID_COLS}`} style={{ background: "var(--ds-color-container-card-surface-default)", color: "var(--ds-color-content-caption)" }}>
                  <p className={head}>Feature</p>
                  <p className={head}>Engenheiros</p>
                  <p className={`${head} text-center`}>Situação</p>
                  <p className={head}>Andamento</p>
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
              <span className="ml-2 text-[11px] t-muted">Clique na Feature para ver cards, bloqueio, horas e engenheiros.</span>
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
