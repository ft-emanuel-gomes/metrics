"use client";

import { useState } from "react";
import type { RetroBoardSettings } from "@/types/retro";

interface BoardSettingsModalProps {
  settings: RetroBoardSettings;
  onSave: (settings: Partial<RetroBoardSettings>) => Promise<void>;
  onClose: () => void;
}

export default function BoardSettingsModal({ settings, onSave, onClose }: BoardSettingsModalProps) {
  const [hideCards, setHideCards] = useState(settings.hideCards);
  const [votingEnabled, setVotingEnabled] = useState(settings.votingEnabled);
  const [showVoteCount, setShowVoteCount] = useState(settings.showVoteCount);
  const [maxVotesPerUser, setMaxVotesPerUser] = useState(settings.maxVotesPerUser);
  const [voteScopePerColumn, setVoteScopePerColumn] = useState(settings.voteScopePerColumn);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await onSave({ hideCards, votingEnabled, showVoteCount, maxVotesPerUser, voteScopePerColumn });
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-sm rounded-xl theme-modal p-6 shadow-2xl">
        <h3 className="text-sm font-bold text-[color:var(--ds-color-content-title)] mb-5">Configurações do Board</h3>

        <div className="space-y-4">
          {/* Ocultar cards */}
          <ToggleItem
            label="Ocultar cards"
            description="Cada participante vê apenas seus próprios cards"
            value={hideCards}
            onChange={setHideCards}
          />

          {/* Desabilitar votação */}
          <ToggleItem
            label="Votação habilitada"
            description="Permitir que participantes votem nos cards"
            value={votingEnabled}
            onChange={setVotingEnabled}
          />

          {/* Ocultar contagem de votos */}
          {votingEnabled && (
            <ToggleItem
              label="Mostrar contagem de votos"
              description="Exibir o número de votos em cada card"
              value={showVoteCount}
              onChange={setShowVoteCount}
            />
          )}

          {/* Máximo de votos */}
          {votingEnabled && (
            <div>
              <label className="block text-[11px] font-semibold text-[color:var(--ds-color-content-body)] uppercase mb-1">
                Máximo de votos por usuário
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={maxVotesPerUser}
                  onChange={(e) => setMaxVotesPerUser(Number(e.target.value))}
                  className="w-16 rounded-md border border-[color:var(--ds-color-container-divider-card)] bg-[var(--ds-color-input-surface)] px-2 py-1.5 text-sm text-[color:var(--ds-color-content-title)] text-center outline-none focus:ring-1 focus:ring-[color:var(--ds-color-container-border-primary)]"
                />
                <span className="text-[10px] text-[color:var(--ds-color-content-caption)]">votos</span>
              </div>
            </div>
          )}

          {/* Escopo do limite */}
          {votingEnabled && (
            <div>
              <label className="block text-[11px] font-semibold text-[color:var(--ds-color-content-body)] uppercase mb-2">
                Escopo do limite de votos
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => setVoteScopePerColumn(false)}
                  className={`flex-1 rounded-md px-3 py-2 text-[11px] font-semibold transition ${
                    !voteScopePerColumn
                      ? "btn-primary"
                      : "bg-[var(--ds-color-input-surface)] text-[color:var(--ds-color-content-caption)] hover:bg-[var(--ds-color-input-surface-hover)]"
                  }`}
                >
                  Por Board
                </button>
                <button
                  onClick={() => setVoteScopePerColumn(true)}
                  className={`flex-1 rounded-md px-3 py-2 text-[11px] font-semibold transition ${
                    voteScopePerColumn
                      ? "btn-primary"
                      : "bg-[var(--ds-color-input-surface)] text-[color:var(--ds-color-content-caption)] hover:bg-[var(--ds-color-input-surface-hover)]"
                  }`}
                >
                  Por Coluna
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md bg-[var(--ds-color-input-surface)] px-3 py-1.5 text-[11px] font-semibold text-[color:var(--ds-color-content-body)] hover:bg-[var(--ds-color-input-surface-hover)] transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary rounded-md text-[11px] px-4 py-1.5 disabled:opacity-40"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ToggleItem({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="block text-[11px] font-semibold text-[color:var(--ds-color-content-body)]">{label}</span>
        <span className="block text-[9px] text-[color:var(--ds-color-content-caption)]">{description}</span>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition-colors ${
          value ? "bg-[var(--ds-color-action-primary-surface)]" : "bg-[var(--ds-color-content-subdued)]"
        }`}
      >
        <div
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
            value ? "translate-x-4.5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
