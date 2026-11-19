"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { businessDaysListBrt } from "@/lib/utils";
import { formatSprintName } from "@/lib/sprint-name";

/** Sprint listada no modal. Vigente/próxima trazem state "active"/"future" (a próxima pode não ter datas). */
export interface CapacitySprintOption {
  id: number;
  name: string;
  state?: "closed" | "active" | "future";
  startDate?: string;
  endDate?: string;
  /** Release a que a sprint pertence, forma curta ("R3"). Distingue "Sprint 2" de releases diferentes. */
  releaseLabel?: string;
}

interface CapacityButtonProps {
  squad: string;
  availableSprints: CapacitySprintOption[];
  /** Pessoas padrão da squad, usado quando a sprint ainda não tem capacidade salva */
  defaultTeamSize?: number;
  autoOpen?: boolean;
  onAutoClose?: () => void;
}

interface SavedCapacityEntry {
  teamSize: number;
  businessDays?: number;
}

/** Dias úteis pelas datas da sprint no Jira (mesma contagem da Capacidade da Sprint). Só para vigente/próxima com datas. */
function jiraBusinessDays(s?: CapacitySprintOption): number | undefined {
  if (!s || (s.state !== "active" && s.state !== "future") || !s.startDate || !s.endDate) return undefined;
  const n = businessDaysListBrt(s.startDate, s.endDate).length;
  return n > 0 ? n : undefined;
}

export default function CapacityButton({ squad, availableSprints, defaultTeamSize = 6, autoOpen, onAutoClose }: CapacityButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(autoOpen || false);
  const [teamSize, setTeamSize] = useState(defaultTeamSize);
  const [businessDays, setBusinessDays] = useState(10);
  const [selectedSprintId, setSelectedSprintId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState("");

  // Carregar capacidades salvas
  const [savedCapacities, setSavedCapacities] = useState<Record<string, SavedCapacityEntry>>({});

  const selectedSprint = availableSprints.find((s) => String(s.id) === selectedSprintId);
  const autoDays = jiraBusinessDays(selectedSprint);
  const savedEntry = savedCapacities[selectedSprintId];
  // Dias úteis que a tela mostra ao abrir a sprint: o salvo, senão o das datas do Jira (vigente/próxima), senão 10
  const initialDays = savedEntry?.businessDays ?? autoDays ?? 10;
  // Ajuste manual dos dias úteis: mudou em relação ao carregado e não é o valor calculado pelo Jira
  const needsDaysConfirm = businessDays !== initialDays && businessDays !== autoDays;

  useEffect(() => {
    if (isOpen) {
      fetch(`/api/capacity?squad=${squad}`)
        .then((r) => r.json())
        .then((data) => {
          // Normalizar: formato antigo era { sprintId: number }, novo é { sprintId: { teamSize, businessDays } }
          const normalized: Record<string, SavedCapacityEntry> = {};
          for (const [key, val] of Object.entries(data)) {
            if (typeof val === "number") {
              normalized[key] = { teamSize: val };
            } else {
              normalized[key] = val as SavedCapacityEntry;
            }
          }
          setSavedCapacities(normalized);
        })
        .catch(() => {});
    }
  }, [isOpen, squad]);

  // Pre-selecionar a primeira da lista: a sprint vigente (ou a próxima), senão a concluída mais recente
  useEffect(() => {
    if (availableSprints.length > 0 && !selectedSprintId) {
      setSelectedSprintId(String(availableSprints[0].id));
    }
  }, [availableSprints, selectedSprintId]);

  // Quando muda a sprint selecionada (ou as capacidades chegam), preencher os campos
  useEffect(() => {
    if (!selectedSprintId) return;
    setTeamSize(savedEntry?.teamSize || defaultTeamSize);
    setBusinessDays(initialDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSprintId, savedCapacities]);

  const invalid = !selectedSprintId || !Number.isFinite(teamSize) || teamSize < 1 || !Number.isInteger(businessDays) || businessDays < 1 || businessDays > 30;

  function handleSaveClick() {
    if (invalid || saving) return;
    // Dias úteis ajustados à mão: pede confirmação antes de gravar
    if (needsDaysConfirm) {
      setConfirmOpen(true);
      return;
    }
    void doSave();
  }

  async function doSave() {
    setConfirmOpen(false);
    setSaving(true);
    setMessage("");

    try {
      // Vigente/próxima com os dias do Jira: grava "automático" (sem dias fixos), assim acompanha as datas da sprint
      const daysToSave = autoDays !== undefined && businessDays === autoDays ? undefined : businessDays;
      const res = await fetch("/api/capacity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ squad, sprintId: selectedSprintId, teamSize, businessDays: daysToSave }),
      });
      const data = await res.json();

      if (res.ok) {
        setMessage("Salvo! Recarregando métricas...");
        setSavedCapacities((prev) => ({ ...prev, [selectedSprintId]: { teamSize, businessDays: daysToSave } }));
        // Avisa a barra de Capacidade da Sprint (Computador de Bordo) para buscar de novo
        window.dispatchEvent(new CustomEvent("capacity-updated", { detail: { squad } }));
        setTimeout(() => {
          setIsOpen(false); if (onAutoClose) onAutoClose();
          setMessage("");
          router.refresh();
        }, 1000);
      } else {
        setMessage(data.error || "Erro ao salvar");
      }
    } catch {
      setMessage("Erro de conexão");
    } finally {
      setSaving(false);
    }
  }

  /** Padrão "Sprint N - RN" (regra em src/lib/sprint-name.ts). */
  function sprintDisplayName(s: CapacitySprintOption): string {
    return formatSprintName(s.name, s.releaseLabel);
  }

  function optionLabel(s: CapacitySprintOption): string {
    const saved = savedCapacities[String(s.id)];
    const savedInfo = saved ? ` (${saved.teamSize}p / ${saved.businessDays || jiraBusinessDays(s) || "?"}d)` : "";
    // Vigente e próxima: nome completo (o número da sprint se repete a cada release) e a situação
    if (s.state === "active") return `${s.name} · vigente${savedInfo}`;
    if (s.state === "future") return `${s.name} · próxima (planejamento)${savedInfo}`;
    return `${sprintDisplayName(s)}${savedInfo}`;
  }

  const capacityHours = teamSize * 6 * businessDays;
  const isOpenSprint = selectedSprint?.state === "active" || selectedSprint?.state === "future";

  return (
    <>
      {!autoOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="btn-primary rounded-lg px-3 py-2 text-[10px]"
      >
        Capacidade
      </button>
      )}

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-sm rounded-xl p-6 shadow-2xl theme-modal">
            <h3 className="text-sm font-bold mb-4" style={{ color: "var(--text-primary)" }}>
              Definir Capacidade do Time
            </h3>

            {/* Campo: Selecionar Sprint */}
            <label className="block text-[10px] text-[color:var(--ds-color-content-caption)] uppercase font-semibold mb-1">
              Selecionar Sprint
            </label>
            <select
              value={selectedSprintId}
              onChange={(e) => setSelectedSprintId(e.target.value)}
              className="w-full rounded-md border border-[color:var(--ds-color-container-divider-card)] theme-input mb-4"
            >
              {availableSprints.map((s) => (
                <option key={s.id} value={String(s.id)} className="bg-[var(--ds-color-container-popover-surface)]">
                  {optionLabel(s)}
                </option>
              ))}
            </select>

            {/* Campos: Pessoas e Dias úteis lado a lado */}
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <label className="block text-[10px] text-[color:var(--ds-color-content-caption)] uppercase font-semibold mb-1">
                  Pessoas
                </label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={teamSize}
                  onChange={(e) => setTeamSize(Number(e.target.value))}
                  className="w-full rounded-md theme-input"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[color:var(--ds-color-content-caption)] uppercase font-semibold mb-1">
                  Dias Úteis
                </label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={businessDays}
                  onChange={(e) => setBusinessDays(Number(e.target.value))}
                  className="w-full rounded-md theme-input"
                />
              </div>
            </div>

            {/* Referência dos dias úteis: datas da sprint no Jira */}
            {isOpenSprint && (
              <p className="mb-4 text-[10px]" style={{ color: "var(--ds-color-content-subdued)" }}>
                {autoDays !== undefined
                  ? `Pelas datas da sprint no Jira: ${autoDays} dias úteis.`
                  : "Sprint sem datas no Jira: informe os dias úteis."}
              </p>
            )}
            {!isOpenSprint && <div className="mb-2" />}

            {/* Info de capacidade calculada */}
            <div className="rounded-md p-3 mb-4" style={{ backgroundColor: "var(--accent-bg)" }}>
              <p className="text-[10px]" style={{ color: "var(--accent)" }}>
                Capacidade = {teamSize} pessoas × 6h/dia × {businessDays} dias = <strong>{capacityHours}h</strong>
              </p>
            </div>

            {/* Mensagem */}
            {message && (
              <p className={`text-[10px] mb-3 ${message.includes("Erro") ? "text-[color:var(--ds-color-content-negative)]" : "text-[color:var(--ds-color-content-positive)]"}`}>
                {message}
              </p>
            )}

            {/* Botões */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setIsOpen(false); if (onAutoClose) onAutoClose(); setMessage(""); }}
                className="rounded-md bg-[var(--ds-color-input-surface)] px-3 py-1.5 text-[10px] font-semibold text-[color:var(--ds-color-content-body)] hover:bg-[var(--ds-color-input-surface-hover)] transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveClick}
                disabled={saving || invalid}
                className="btn-primary rounded-md text-[10px] px-4 py-1.5 disabled:opacity-40"
              >
                {saving ? "Salvando..." : "Salvar e Recalcular"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação do ajuste manual de dias úteis */}
      {isOpen && confirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70" role="dialog" aria-modal="true" aria-labelledby="capacity-confirm-title">
          <div className="w-full max-w-sm rounded-xl p-6 shadow-2xl theme-modal">
            <h3 id="capacity-confirm-title" className="text-sm font-bold mb-2" style={{ color: "var(--text-primary)" }}>
              Ajustar dias úteis manualmente?
            </h3>
            <p className="text-[12px] mb-3" style={{ color: "var(--ds-color-content-body)" }}>
              Tem certeza que deseja ajustar os dias úteis manualmente?
            </p>
            <div className="rounded-md p-3 mb-4 text-[11px] leading-relaxed" style={{ backgroundColor: "var(--accent-bg)", color: "var(--accent)" }}>
              <p>
                {selectedSprint ? sprintDisplayName(selectedSprint) : "Sprint"}: de <strong>{initialDays}</strong> para <strong>{businessDays}</strong> dias úteis
                {autoDays !== undefined && ` (Jira: ${autoDays})`}.
              </p>
              <p>
                Capacidade = {teamSize} × 6h × {businessDays} = <strong>{capacityHours}h</strong>
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmOpen(false)}
                className="rounded-md bg-[var(--ds-color-input-surface)] px-3 py-1.5 text-[10px] font-semibold text-[color:var(--ds-color-content-body)] hover:bg-[var(--ds-color-input-surface-hover)] transition"
              >
                Voltar
              </button>
              <button
                onClick={() => void doSave()}
                className="btn-primary rounded-md text-[10px] px-4 py-1.5"
                autoFocus
              >
                Sim, ajustar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
