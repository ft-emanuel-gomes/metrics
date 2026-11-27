"use client";

import { useCallback, useEffect, useState } from "react";
import PersonAvatar from "@/components/ui/PersonAvatar";
import SprintCapacityEditor from "./SprintCapacityEditor";
import type { TeamMember } from "@/services/squad-team";

export interface SquadOption {
  slug: string;
  name: string;
  methodology: "sprint" | "kanban";
}

interface JiraPersonView {
  accountId: string;
  name: string;
  avatarUrl?: string;
  active: boolean;
  items?: number;
  linked?: boolean;
}

const BORDER = "1px solid var(--ds-color-container-divider-card)";
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { message?: string }).message || `Erro ${res.status}`);
  return data as T;
}

function Section({ title, description, children, className = "" }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`theme-section min-w-0 ${className}`}>
      <h2 className="text-[11px] font-bold uppercase tracking-wide t-secondary">{title}</h2>
      {description && <p className="mt-1 text-[12px] t-muted">{description}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Abas da Central Administrativa (Entrega 1: Capacidade e Configurações gerais). */
export default function AdminCentral({ squads, initialSquad }: { squads: SquadOption[]; initialSquad?: string }) {
  const [tab, setTab] = useState<"capacidade" | "gerais">("capacidade");
  const [squad, setSquad] = useState(initialSquad ?? squads[0]?.slug ?? "");

  return (
    <div>
      {/* Barra: abas à esquerda e squad à direita (no celular, a squad desce para a linha de baixo) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-1" role="tablist">
        {[
          { id: "capacidade", label: "Capacidade" },
          { id: "gerais", label: "Configurações gerais" },
        ].map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className="rounded-md px-3 py-1.5 text-[12px] font-semibold transition"
            style={
              tab === t.id
                ? { background: "var(--ds-color-feedback-primary-surface)", color: "var(--ds-color-feedback-primary-label)" }
                : { color: "var(--ds-color-content-body)" }
            }
          >
            {t.label}
          </button>
        ))}
      </div>
        {tab === "capacidade" && (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <label htmlFor="admin-squad" className="text-[11px] font-semibold uppercase t-secondary">Squad</label>
            <select id="admin-squad" value={squad} onChange={(e) => setSquad(e.target.value)} className="theme-input min-w-0 flex-1 rounded-md text-[13px] sm:w-56 sm:flex-none">
              {squads.map((s) => (
                <option key={s.slug} value={s.slug}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {tab === "capacidade" ? (
        squad && <SquadCapacity key={squad} squad={squad} kanban={squads.find((s) => s.slug === squad)?.methodology === "kanban"} />
      ) : (
        <GlobalSettingsPanel />
      )}
    </div>
  );
}

function SquadCapacity({ squad, kanban }: { squad: string; kanban: boolean }) {
  // Recarrega o editor da sprint quando integrantes ou horas mudam
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  // Em cima, lado a lado (mesma altura): Integrantes | Capacidade da sprint. Embaixo, na largura toda: Horas por dia.
  // Abaixo de lg, tudo empilha nessa mesma ordem.
  return (
    <div className="flex flex-col gap-4">
      {/* Lado a lado só a partir de 1280px: abaixo disso o editor ficava espremido e alto demais */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TeamPanel squad={squad} onChanged={bump} />
        {kanban ? (
          <Section title="Capacidade da sprint" description="Squad Kanban: a capacidade usa pessoas da squad × horas por dia da squad × dias úteis da janela.">
            <span />
          </Section>
        ) : (
          <EditableSprintPanel key={version} squad={squad} />
        )}
      </div>
      <SquadHoursPanel squad={squad} onChanged={bump} />
    </div>
  );
}

// --- Integrantes ---

function TeamPanel({ squad, onChanged }: { squad: string; onChanged: () => void }) {
  const [members, setMembers] = useState<TeamMember[] | null>(null);
  const [suggestions, setSuggestions] = useState<JiraPersonView[] | null>(null);
  const [suggestError, setSuggestError] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<JiraPersonView[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadMembers = useCallback(async () => {
    try {
      const d = await api<{ members: TeamMember[] }>(`/api/admin/squads/${squad}/team`);
      setMembers(d.members);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [squad]);

  const loadSuggestions = useCallback(async () => {
    setSuggestError("");
    try {
      const d = await api<{ suggestions: JiraPersonView[] }>(`/api/admin/squads/${squad}/team/suggestions`);
      setSuggestions(d.suggestions);
    } catch (e) {
      setSuggestError((e as Error).message);
      setSuggestions([]);
    }
  }, [squad]);

  useEffect(() => {
    void loadMembers();
    void loadSuggestions();
  }, [loadMembers, loadSuggestions]);

  // Busca por nome com pequena espera entre as teclas
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const d = await api<{ users: JiraPersonView[] }>(`/api/admin/jira-users?query=${encodeURIComponent(q)}`);
        setResults(d.users);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(id);
  }, [query]);

  const linkedIds = new Set((members ?? []).map((m) => m.accountId));

  async function link(accountId: string) {
    setBusy(accountId);
    setError("");
    try {
      const d = await api<{ members: TeamMember[] }>(`/api/admin/squads/${squad}/team/members`, { method: "POST", body: JSON.stringify({ accountId }) });
      setMembers(d.members);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function unlink(accountId: string) {
    setBusy(accountId);
    setError("");
    try {
      const d = await api<{ members: TeamMember[] }>(`/api/admin/squads/${squad}/team/members/${encodeURIComponent(accountId)}`, { method: "DELETE" });
      setMembers(d.members);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const personRow = (p: { accountId: string; name: string; avatarUrl?: string }, right: React.ReactNode, extra?: React.ReactNode) => (
    <li key={p.accountId} className="flex items-center gap-2 px-3 py-1.5 text-[12px] first:border-t-0" style={{ borderTop: BORDER, color: "var(--ds-color-content-title)" }}>
      <PersonAvatar name={p.name} avatarUrl={p.avatarUrl} size={26} />
      {/* Nome em até 2 linhas, sem cortar no meio da palavra */}
      <span className="min-w-0 flex-1 leading-snug [overflow-wrap:anywhere] line-clamp-2" title={p.name}>{p.name}</span>
      {extra && <span className="shrink-0">{extra}</span>}
      <span className="shrink-0">{right}</span>
    </li>
  );
  const linkButton = (accountId: string) =>
    linkedIds.has(accountId) ? (
      <span className="text-[11px] t-muted">vinculado</span>
    ) : (
      <button className="btn-primary rounded-md px-2.5 py-1 text-[10px] disabled:opacity-40" disabled={busy === accountId} onClick={() => void link(accountId)}>
        Vincular
      </button>
    );

  return (
    <Section title={`Integrantes da squad${members && members.length > 0 ? ` (${members.length})` : ""}`} description="Pessoas do Jira que atuam na squad. A capacidade da sprint usa esta lista.">
      {error && <p className="mb-2 text-[12px]" style={{ color: "var(--ds-color-content-negative)" }}>{error}</p>}
      {members === null ? (
        <p className="text-[12px] t-muted">Carregando…</p>
      ) : members.length === 0 ? (
        <p className="mb-2 text-[12px] t-muted">Nenhum integrante vinculado. Enquanto isso, a capacidade usa o formato anterior (pessoas × horas × dias).</p>
      ) : (
        <ul className="mb-4 max-h-80 overflow-y-auto rounded-lg" style={{ border: BORDER }}>
          {members.map((m) =>
            personRow(
              m,
              <button className="text-[11px] underline disabled:opacity-40" style={{ color: "var(--ds-color-content-negative)" }} disabled={busy === m.accountId} onClick={() => void unlink(m.accountId)}>
                Desvincular
              </button>,
              m.inactiveInJira ? <span className="ds-badge ds-badge-alert">inativo no Jira</span> : undefined
            )
          )}
        </ul>
      )}

      {/* Adicionar: uma busca só. Sem texto, mostra as sugestões das últimas sprints (quem ainda não está vinculado) */}
      <label htmlFor={`search-${squad}`} className="mb-1 block text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ds-color-content-caption)" }}>
        Adicionar integrante
      </label>
      <input
        id={`search-${squad}`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar no Jira pelo nome (mín. 2 letras)"
        className="theme-input mb-2 w-full rounded-md text-[13px]"
      />
      {query.trim().length >= 2 ? (
        searching ? (
          <p className="text-[12px] t-muted">Buscando…</p>
        ) : results.length === 0 ? (
          <p className="text-[12px] t-muted">Ninguém encontrado.</p>
        ) : (
          <ul className="max-h-64 overflow-y-auto rounded-lg" style={{ border: BORDER }}>{results.map((p) => personRow(p, linkButton(p.accountId)))}</ul>
        )
      ) : suggestions === null ? (
        <p className="text-[12px] t-muted">Buscando sugestões no Jira…</p>
      ) : suggestError ? (
        <p className="text-[12px]" style={{ color: "var(--ds-color-content-negative)" }}>{suggestError}</p>
      ) : (
        (() => {
          const pending = suggestions.filter((p) => !linkedIds.has(p.accountId));
          return pending.length === 0 ? (
            <p className="text-[12px] t-muted">Todos os responsáveis das últimas sprints já estão vinculados.</p>
          ) : (
            <>
              <p className="mb-1 text-[11px] t-muted">Sugestões das últimas sprints ({pending.length})</p>
              <ul className="max-h-64 overflow-y-auto rounded-lg" style={{ border: BORDER }}>
                {pending.map((p) => personRow(p, linkButton(p.accountId), <span className="text-[11px] t-muted">{p.items} itens</span>))}
              </ul>
            </>
          );
        })()
      )}
    </Section>
  );
}

// --- Horas por dia ---

function HoursField({ value, onSave, placeholder, allowClear, saving }: { value: number | null; onSave: (v: number | null) => void; placeholder?: string; allowClear?: boolean; saving: boolean }) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  useEffect(() => setDraft(value === null ? "" : String(value)), [value]);
  const n = draft === "" ? null : Number(draft.replace(",", "."));
  const invalid = n !== null && (!Number.isFinite(n) || n < 1 || n > 12 || Math.round(n * 2) !== n * 2);
  const changed = n !== value;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input type="number" min={1} max={12} step={0.5} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} className="theme-input w-24 rounded-md text-[13px]" />
      <span className="text-[12px] t-muted">horas por dia útil</span>
      <button className="btn-primary rounded-md px-3 py-1 text-[10px] disabled:opacity-40" disabled={!changed || invalid || saving || (n === null && !allowClear)} onClick={() => onSave(n)}>
        {saving ? "Salvando..." : "Salvar"}
      </button>
      {allowClear && value !== null && (
        <button className="text-[11px] underline t-muted" disabled={saving} onClick={() => onSave(null)}>usar padrão global</button>
      )}
      {invalid && <span className="text-[11px]" style={{ color: "var(--ds-color-content-negative)" }}>De 1 a 12, em passos de 0,5.</span>}
    </div>
  );
}

function SquadHoursPanel({ squad, onChanged }: { squad: string; onChanged: () => void }) {
  const [hours, setHours] = useState<number | null>(null);
  const [globalHours, setGlobalHours] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api<{ hoursPerDay: number | null; hoursPerDayDefault: number }>(`/api/admin/squads/${squad}/team`)
      .then((d) => { setHours(d.hoursPerDay); setGlobalHours(d.hoursPerDayDefault); })
      .catch((e) => setMsg((e as Error).message));
  }, [squad]);
  async function save(v: number | null) {
    setSaving(true);
    setMsg("");
    try {
      const d = await api<{ hoursPerDay: number | null }>(`/api/admin/squads/${squad}/team`, { method: "PUT", body: JSON.stringify({ hoursPerDay: v }) });
      setHours(d.hoursPerDay);
      setMsg("Salvo. Vale para a sprint vigente e as próximas; sprints concluídas não mudam.");
      onChanged();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Section title="Horas por dia da squad" description={`Sem valor próprio, a squad usa o padrão global${globalHours !== null ? ` (${fmt(globalHours)}h)` : ""}. Cada integrante ainda pode ter um ajuste na sprint.`}>
      <HoursField value={hours} placeholder={globalHours !== null ? fmt(globalHours) : undefined} allowClear onSave={(v) => void save(v)} saving={saving} />
      {hours === null && globalHours !== null && <p className="mt-1 text-[11px] t-muted">Usando o padrão global: {fmt(globalHours)}h.</p>}
      {msg && <p className="mt-2 text-[11px] t-muted">{msg}</p>}
    </Section>
  );
}

interface HoursVersionView {
  hoursPerDay: number;
  effectiveFrom: string;
  createdAt?: string;
  createdBy?: string;
}
interface SettingsPayload {
  settings: { hoursPerDayDefault: number; hoursVersions: HoursVersionView[] };
  minEffectiveFrom: string;
  today: string;
}
const fmtYmd = (ymd: string) => ymd.split("-").reverse().join("/");
const BASE_FROM = "2000-01-01";

/** Horas por dia globais com data de vigência: cada sprint usa o valor vigente na data de início dela. */
function GlobalSettingsPanel() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [hoursDraft, setHoursDraft] = useState("");
  const [fromDraft, setFromDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const apply = (d: SettingsPayload) => {
    setData(d);
    setFromDraft((cur) => (cur && cur >= d.minEffectiveFrom ? cur : d.minEffectiveFrom));
  };
  useEffect(() => {
    api<SettingsPayload>("/api/admin/settings").then(apply).catch((e) => setMsg({ tone: "error", text: (e as Error).message }));
  }, []);

  const n = hoursDraft === "" ? null : Number(hoursDraft.replace(",", "."));
  const invalidHours = n === null || !Number.isFinite(n) || n < 1 || n > 12 || Math.round(n * 2) !== n * 2;
  const invalidDate = !data || !fromDraft || fromDraft < data.minEffectiveFrom;

  async function schedule() {
    if (invalidHours || invalidDate) return;
    setSaving(true);
    setMsg(null);
    try {
      const d = await api<SettingsPayload>("/api/admin/settings", { method: "PUT", body: JSON.stringify({ hoursPerDay: n, effectiveFrom: fromDraft }) });
      apply(d);
      setHoursDraft("");
      setMsg({ tone: "ok", text: `Agendado: ${fmt(n as number)}h a partir de ${fmtYmd(fromDraft)}. Sprints que começam a partir dessa data usam o novo valor; a vigente e as concluídas não mudam.` });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function cancel(effectiveFrom: string) {
    setSaving(true);
    setMsg(null);
    try {
      apply(await api<SettingsPayload>(`/api/admin/settings?effectiveFrom=${effectiveFrom}`, { method: "DELETE" }));
      setMsg({ tone: "ok", text: `Agendamento de ${fmtYmd(effectiveFrom)} cancelado.` });
    } catch (e) {
      setMsg({ tone: "error", text: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  const versions = data ? [...data.settings.hoursVersions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)) : [];
  // Versão em vigor hoje = a mais recente com vigência ≤ hoje
  const currentFrom = data ? versions.find((v) => v.effectiveFrom <= data.today)?.effectiveFrom : undefined;
  const label = "mb-1 block text-[10px] font-semibold uppercase tracking-wide";

  return (
    <Section
      title="Horas por dia padrão"
      description="Horas produtivas por pessoa em cada dia útil, para todas as squads. Cada mudança vale a partir de uma data: cada sprint usa o valor vigente na data de início dela (cada squad e cada integrante ainda podem ter o seu ajuste)."
    >
      {!data ? (
        <p className="text-[12px] t-muted">{msg?.text ?? "Carregando…"}</p>
      ) : (
        <>
          <p className="mb-4 text-[13px]" style={{ color: "var(--ds-color-content-title)" }}>
            Em vigor hoje: <strong>{fmt(data.settings.hoursPerDayDefault)}h por dia</strong>
          </p>

          <div className="mb-2 flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="global-hours" className={label} style={{ color: "var(--ds-color-content-caption)" }}>Novas horas por dia</label>
              <input id="global-hours" type="number" min={1} max={12} step={0.5} value={hoursDraft} placeholder="ex.: 8" onChange={(e) => setHoursDraft(e.target.value)} className="theme-input w-28 rounded-md text-[13px]" />
            </div>
            <div>
              <label htmlFor="global-from" className={label} style={{ color: "var(--ds-color-content-caption)" }}>A partir de</label>
              <input id="global-from" type="date" min={data.minEffectiveFrom} value={fromDraft} onChange={(e) => setFromDraft(e.target.value)} className="theme-input rounded-md text-[13px]" />
            </div>
            <button className="btn-primary rounded-md px-4 py-2 text-[11px] disabled:opacity-40" disabled={saving || invalidHours || invalidDate} onClick={() => void schedule()}>
              {saving ? "Salvando..." : "Agendar"}
            </button>
          </div>
          <p className="mb-4 text-[11px] t-muted">
            A data não pode ser anterior a {fmtYmd(data.minEffectiveFrom)}: a sprint vigente e as concluídas mantêm o valor da época.
            {hoursDraft !== "" && invalidHours && <span style={{ color: "var(--ds-color-content-negative)" }}> Horas: de 1 a 12, em passos de 0,5.</span>}
          </p>

          <p className={label} style={{ color: "var(--ds-color-content-caption)" }}>Histórico</p>
          <ul className="overflow-hidden rounded-lg" style={{ border: BORDER }}>
            {versions.map((v) => {
              const scheduled = v.effectiveFrom > data.today;
              const inForce = v.effectiveFrom === currentFrom;
              return (
                <li key={v.effectiveFrom} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-[12px] first:border-t-0" style={{ borderTop: BORDER, color: "var(--ds-color-content-title)" }}>
                  <strong className="w-14">{fmt(v.hoursPerDay)}h</strong>
                  <span className="flex-1">{v.effectiveFrom === BASE_FROM ? "Valor inicial" : `a partir de ${fmtYmd(v.effectiveFrom)}`}</span>
                  {scheduled && <span className="ds-badge" style={{ background: "var(--ds-color-feedback-alert-surface)", color: "var(--ds-color-feedback-alert-label)" }}>agendado</span>}
                  {inForce && <span className="ds-badge ds-badge-positive">em vigor</span>}
                  {v.createdBy && <span className="text-[11px] t-muted">por {v.createdBy}</span>}
                  {scheduled && v.effectiveFrom >= data.minEffectiveFrom && (
                    <button className="text-[11px] underline disabled:opacity-40" style={{ color: "var(--ds-color-content-negative)" }} disabled={saving} onClick={() => void cancel(v.effectiveFrom)}>
                      Cancelar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {msg && <p className="mt-2 text-[11px]" style={{ color: msg.tone === "ok" ? "var(--ds-color-content-positive)" : "var(--ds-color-content-negative)" }}>{msg.text}</p>}
        </>
      )}
    </Section>
  );
}

// --- Sprint editável ---

type OpenSprintOption = { id: number; name: string; state: "active" | "future" };

function EditableSprintPanel({ squad }: { squad: string }) {
  const [sprints, setSprints] = useState<OpenSprintOption[] | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ sprints: OpenSprintOption[] }>(`/api/admin/squads/${squad}/capacity`)
      .then((d) => {
        setSprints(d.sprints);
        setSelectedId(d.sprints[0]?.id ?? null);
      })
      .catch((e) => setError((e as Error).message));
  }, [squad]);
  const stateLabel = (s: OpenSprintOption) => (s.state === "active" ? "vigente" : "próxima");
  const sprint = sprints?.find((s) => s.id === selectedId) ?? null;
  const title = sprint ? `Capacidade da ${sprint.name} · ${stateLabel(sprint)}` : "Capacidade da sprint";
  return (
    <Section title={title} description="Vale para a sprint vigente e para a próxima. Sem ajuste salvo, a próxima segue a configuração da vigente.">
      {error ? (
        <p className="text-[12px]" style={{ color: "var(--ds-color-content-negative)" }}>{error}</p>
      ) : sprints === undefined ? (
        <p className="text-[12px] t-muted">Buscando a sprint no Jira…</p>
      ) : !sprint ? (
        <p className="text-[12px] t-muted">Nenhuma sprint vigente ou próxima no Jira.</p>
      ) : (
        <>
          {sprints.length > 1 && (
            <div className="mb-3 inline-flex rounded-lg p-0.5" style={{ backgroundColor: "var(--ds-color-input-surface)" }} role="tablist">
              {sprints.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={s.id === sprint.id}
                  onClick={() => setSelectedId(s.id)}
                  className={`rounded-md px-3 py-1 text-[11px] font-semibold transition ${s.id === sprint.id ? "btn-primary" : "t-muted"}`}
                >
                  {s.name} · {stateLabel(s)}
                </button>
              ))}
            </div>
          )}
          <SprintCapacityEditor key={sprint.id} squad={squad} sprintId={sprint.id} />
        </>
      )}
    </Section>
  );
}
