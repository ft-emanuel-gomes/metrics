"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PersonAvatar from "@/components/ui/PersonAvatar";
import { computeCapacity, type SprintMemberCapacity } from "@/metrics/capacity";
import type { ResolvedCapacity } from "@/services/capacity-resolver";
import type { TeamMember } from "@/services/squad-team";

interface Props {
  squad: string;
  sprintId: number;
  /** Chamado depois de salvar com sucesso */
  onSaved?: () => void;
  onCancel?: () => void;
}

interface Row {
  accountId: string;
  name: string;
  avatarUrl?: string;
  inactiveInJira?: boolean;
  allocationPct: number;
  /** null = segue o padrão da squad */
  hoursOverride: number | null;
}

const PCT_OPTIONS = Array.from({ length: 21 }, (_, i) => i * 5);
const fmt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

const SOURCE_LABEL: Record<ResolvedCapacity["source"], string> = {
  ajustada: "Ajustada nesta sprint",
  herdada: "Herdada da sprint anterior",
  padrao: "Integrantes da squad a 100%",
  legado: "Formato anterior (pessoas × dias)",
  "time-padrao": "Padrão da squad (sem integrantes)",
};

/**
 * Editor da capacidade da sprint vigente ou da próxima por integrante: % de atuação, horas por dia e dias úteis.
 * A configuração em uso já vale sem nenhuma ação; salvar só é preciso quando algo muda.
 */
export default function SprintCapacityEditor({ squad, sprintId, onSaved, onCancel }: Props) {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [error, setError] = useState("");
  const [capacity, setCapacity] = useState<ResolvedCapacity | null>(null);
  const [defaultHours, setDefaultHours] = useState(6);
  const [rows, setRows] = useState<Row[]>([]);
  const [businessDays, setBusinessDays] = useState(10);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [confirmDays, setConfirmDays] = useState(false);

  const load = useCallback(async () => {
    setState("loading");
    setError("");
    try {
      const [capRes, teamRes] = await Promise.all([
        fetch(`/api/admin/squads/${squad}/capacity/${sprintId}`, { cache: "no-store" }),
        fetch(`/api/admin/squads/${squad}/team`, { cache: "no-store" }),
      ]);
      const capJson = await capRes.json();
      const teamJson = await teamRes.json();
      if (!capRes.ok) throw new Error(capJson.message || "Falha ao carregar a capacidade.");
      if (!teamRes.ok) throw new Error(teamJson.message || "Falha ao carregar os integrantes.");
      const cap = capJson.capacity as ResolvedCapacity;
      const members = teamJson.members as TeamMember[];
      // Horas padrão vigentes na data de início desta sprint (squad → global com vigência)
      const squadDefault = cap.hoursPerDayDefault;
      const byId = new Map(cap.members.map((m) => [m.accountId, m]));
      setCapacity(cap);
      setDefaultHours(squadDefault);
      setBusinessDays(cap.businessDays);
      setRows(
        members.map((m) => {
          const c = byId.get(m.accountId);
          return {
            accountId: m.accountId,
            name: m.name,
            avatarUrl: m.avatarUrl,
            inactiveInJira: m.inactiveInJira,
            allocationPct: c ? c.allocationPct : 100,
            hoursOverride: c && c.hoursOverride ? c.hoursPerDay : null,
          };
        })
      );
      setState("ok");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar.");
      setState("error");
    }
  }, [squad, sprintId]);

  useEffect(() => {
    void load();
  }, [load]);

  const members: SprintMemberCapacity[] = useMemo(
    () => rows.map((r) => ({ accountId: r.accountId, allocationPct: r.allocationPct, hoursPerDay: r.hoursOverride ?? defaultHours, hoursOverride: r.hoursOverride !== null })),
    [rows, defaultHours]
  );
  const totals = computeCapacity(members, businessDays);
  const uniformHours = members.every((m) => m.hoursPerDay === defaultHours);
  const auto = capacity?.autoBusinessDays;
  const daysChangedByHand = capacity ? businessDays !== capacity.businessDays && businessDays !== auto : false;
  const invalidDays = !Number.isInteger(businessDays) || businessDays < 1 || businessDays > 30;
  const invalidHours = rows.some((r) => r.hoursOverride !== null && (r.hoursOverride < 1 || r.hoursOverride > 12 || Math.round(r.hoursOverride * 2) !== r.hoursOverride * 2));

  const update = (id: string, patch: Partial<Row>) => setRows((prev) => prev.map((r) => (r.accountId === id ? { ...r, ...patch } : r)));

  async function save() {
    setConfirmDays(false);
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/squads/${squad}/capacity/${sprintId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Igual ao das datas do Jira = automático (acompanha as datas da sprint)
          businessDays: auto !== undefined && businessDays === auto ? null : businessDays,
          members: rows.map((r) => ({ accountId: r.accountId, allocationPct: r.allocationPct, hoursPerDay: r.hoursOverride })),
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setMessage({ tone: "error", text: data.message });
        await load();
        return;
      }
      if (!res.ok) {
        // 503 e validação: mantém a edição na tela
        setMessage({ tone: "error", text: data.message || "Erro ao salvar." });
        return;
      }
      setCapacity(data.capacity as ResolvedCapacity);
      setMessage({ tone: "ok", text: "Capacidade salva. As métricas já usam o novo valor." });
      window.dispatchEvent(new CustomEvent("capacity-updated", { detail: { squad } }));
      onSaved?.();
    } catch {
      setMessage({ tone: "error", text: "Erro de conexão. Sua edição foi mantida: tente de novo." });
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    if (saving || invalidDays || invalidHours) return;
    if (daysChangedByHand) {
      setConfirmDays(true);
      return;
    }
    void save();
  }

  if (state === "loading") return <p className="py-6 text-[12px] t-muted">Carregando a capacidade da sprint…</p>;
  if (state === "error" || !capacity) {
    return (
      <p className="py-6 text-[12px]" style={{ color: "var(--ds-color-content-negative)" }}>
        {error}{" "}
        <button className="underline" onClick={() => void load()}>Tentar de novo</button>
      </p>
    );
  }

  const label = "block text-[10px] uppercase font-semibold mb-1";
  const origin =
    capacity.source === "herdada" && capacity.inheritedFromSprintName ? `Herdada da ${capacity.inheritedFromSprintName}` : SOURCE_LABEL[capacity.source];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="ds-badge" style={{ background: "var(--ds-color-feedback-primary-surface)", color: "var(--ds-color-feedback-primary-label)" }}>
          {origin}
        </span>
        <span className="text-[11px] t-muted">Já em uso nos cálculos. Ajuste só o que mudou.</span>
      </div>

      {rows.length === 0 ? (
        <div className="mb-4 rounded-md p-3 text-[12px]" style={{ background: "var(--ds-color-feedback-neutral-surface)", color: "var(--ds-color-content-body)" }}>
          A squad ainda não tem integrantes vinculados, então vale o formato anterior
          {capacity.legacy ? ` (${capacity.legacy.teamSize} pessoas × ${fmt(capacity.legacy.hoursPerDay)}h × ${capacity.businessDays} dias = ${fmt(capacity.capacityHours)}h)` : ""}.{" "}
          Vincule os integrantes em <strong>Integrantes da squad</strong> (Central Administrativa, no menu Administrador da home).
        </div>
      ) : (
        // @container: as colunas se ajustam à largura do editor (modal, coluna da Central ou celular)
        <div className="@container mb-4 overflow-hidden rounded-lg" style={{ border: "1px solid var(--ds-color-container-divider-card)" }}>
          <div className="hidden @xl:grid @xl:grid-cols-[minmax(0,1fr)_200px_130px] text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ds-color-content-caption)" }}>
            <p className="px-3 py-1.5">Integrante</p>
            <p className="px-2 py-1.5">% de atuação</p>
            <p className="px-2 py-1.5">Horas por dia</p>
          </div>
          {rows.map((r) => (
            <div
              key={r.accountId}
              // Estreito: nome em cima e, embaixo, Atuação e Horas na mesma linha (quebram só se não couber). Largo: tabela.
              className="flex flex-wrap items-center pb-1.5 text-[12px] @xl:grid @xl:grid-cols-[minmax(0,1fr)_200px_130px] @xl:pb-0"
              style={{ borderTop: "1px solid var(--ds-color-container-divider-card)", color: "var(--ds-color-content-title)" }}
            >
              <div className="flex min-w-0 basis-full items-center gap-2 px-3 py-1.5 @xl:basis-auto">
                <PersonAvatar name={r.name} avatarUrl={r.avatarUrl} size={24} />
                <span className="truncate" style={{ opacity: r.allocationPct === 0 ? 0.55 : 1 }}>{r.name}</span>
                {r.inactiveInJira && <span className="ds-badge ds-badge-alert shrink-0">inativo no Jira</span>}
              </div>
              <div className="flex items-center gap-1 py-0.5 pl-[44px] pr-3 @xl:px-2 @xl:py-1.5">
                <span className="w-[52px] shrink-0 text-[10px] font-semibold uppercase t-muted @xl:hidden">Atuação</span>
                <select
                  aria-label={`% de atuação de ${r.name}`}
                  value={r.allocationPct}
                  onChange={(e) => update(r.accountId, { allocationPct: Number(e.target.value) })}
                  className="theme-input w-[104px] shrink-0 rounded-md !py-1 text-[12px]"
                >
                  {PCT_OPTIONS.map((p) => (
                    <option key={p} value={p}>{p}%</option>
                  ))}
                </select>
                {[0, 50, 100].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => update(r.accountId, { allocationPct: p })}
                    className="rounded px-1 text-[10px] font-semibold"
                    style={{ color: r.allocationPct === p ? "var(--ds-color-content-primary)" : "var(--ds-color-content-subdued)" }}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 py-0.5 pl-[44px] pr-3 @md:pl-2 @xl:px-2 @xl:py-1.5">
                <span className="w-[52px] shrink-0 text-[10px] font-semibold uppercase t-muted @xl:hidden">Horas</span>
                <input
                  type="number"
                  aria-label={`Horas por dia de ${r.name}`}
                  min={1}
                  max={12}
                  step={0.5}
                  value={r.hoursOverride ?? defaultHours}
                  onChange={(e) => update(r.accountId, { hoursOverride: e.target.value === "" ? null : Number(e.target.value) })}
                  className="theme-input w-[64px] rounded-md !py-1 text-[12px]"
                />
                {r.hoursOverride !== null ? (
                  <button type="button" className="text-[10px] underline t-muted" onClick={() => update(r.accountId, { hoursOverride: null })} title={`Voltar ao padrão da squad (${fmt(defaultHours)}h)`}>
                    padrão
                  </button>
                ) : (
                  <span className="text-[10px] t-muted">padrão</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div>
          <label className={label} style={{ color: "var(--ds-color-content-caption)" }}>Dias úteis</label>
          <input type="number" min={1} max={30} value={businessDays} onChange={(e) => setBusinessDays(Number(e.target.value))} className="w-24 rounded-md theme-input" />
        </div>
        <p className="pb-2 text-[10px]" style={{ color: "var(--ds-color-content-subdued)" }}>
          {auto !== undefined ? `Pelas datas da sprint no Jira: ${auto} dias úteis.` : "Sprint sem datas no Jira: informe os dias úteis."}
        </p>
      </div>

      {rows.length > 0 && (
        <div className="mb-4 rounded-md p-3" style={{ backgroundColor: "var(--accent-bg)" }}>
          <p className="text-[11px]" style={{ color: "var(--accent)" }}>
            {uniformHours ? (
              <>Capacidade = {fmt(totals.fte)} pessoas-equivalentes × {fmt(defaultHours)}h/dia × {businessDays} dias = <strong>{fmt(totals.capacityHours)}h</strong></>
            ) : (
              <>Capacidade = Σ horas/dia × % = {fmt(totals.hoursPerDayTotal)}h/dia × {businessDays} dias = <strong>{fmt(totals.capacityHours)}h</strong></>
            )}
          </p>
          <p className="mt-0.5 text-[10px]" style={{ color: "var(--accent)" }}>
            {totals.headcount} {totals.headcount === 1 ? "pessoa atuando" : "pessoas atuando"}
            {rows.length > totals.headcount ? ` · ${rows.length - totals.headcount} ausente(s) (0%)` : ""}
          </p>
        </div>
      )}

      {invalidHours && <p className="mb-2 text-[11px]" style={{ color: "var(--ds-color-content-negative)" }}>Horas por dia: de 1 a 12, em passos de 0,5.</p>}
      {message && (
        <p className="mb-3 text-[11px]" style={{ color: message.tone === "ok" ? "var(--ds-color-content-positive)" : "var(--ds-color-content-negative)" }}>
          {message.text}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button onClick={onCancel} className="rounded-md bg-[var(--ds-color-input-surface)] px-3 py-1.5 text-[10px] font-semibold text-[color:var(--ds-color-content-body)] hover:bg-[var(--ds-color-input-surface-hover)] transition">
            Fechar
          </button>
        )}
        <button onClick={handleSave} disabled={saving || invalidDays || invalidHours || rows.length === 0} className="btn-primary rounded-md px-4 py-1.5 text-[10px] disabled:opacity-40">
          {saving ? "Salvando..." : "Salvar ajuste"}
        </button>
      </div>

      {confirmDays && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3" role="dialog" aria-modal="true" data-nested="true">
          <div className="w-full max-w-sm rounded-xl p-6 shadow-2xl theme-modal">
            <h3 className="mb-2 text-sm font-bold" style={{ color: "var(--text-primary)" }}>Ajustar dias úteis manualmente?</h3>
            <p className="mb-3 text-[12px]" style={{ color: "var(--ds-color-content-body)" }}>Tem certeza que deseja ajustar os dias úteis manualmente?</p>
            <div className="mb-4 rounded-md p-3 text-[11px]" style={{ backgroundColor: "var(--accent-bg)", color: "var(--accent)" }}>
              De <strong>{capacity.businessDays}</strong> para <strong>{businessDays}</strong> dias úteis{auto !== undefined && ` (Jira: ${auto})`}. Capacidade = <strong>{fmt(totals.capacityHours)}h</strong>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDays(false)} className="rounded-md bg-[var(--ds-color-input-surface)] px-3 py-1.5 text-[10px] font-semibold text-[color:var(--ds-color-content-body)]">Voltar</button>
              <button onClick={() => void save()} className="btn-primary rounded-md px-4 py-1.5 text-[10px]" autoFocus>Sim, ajustar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
