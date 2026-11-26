"use client";

import { useEffect } from "react";
import AdminCentral, { type SquadOption } from "./AdminCentral";

/**
 * Central Administrativa em modal sobreposto à home (sem trocar de tela).
 * Mesma estrutura da Central: abas, squad, Integrantes | Capacidade da sprint e Horas por dia embaixo.
 * Fecha no X, no Esc ou clicando fora.
 */
export default function AdminCentralModal({ squads, onClose }: { squads: SquadOption[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc fecha, a menos que haja uma confirmação aberta por cima (ela trata o próprio Esc)
      if (e.key === "Escape" && !document.querySelector('[role="dialog"][data-nested="true"]')) onClose();
    };
    document.addEventListener("keydown", onKey);
    // Trava a rolagem da home enquanto o modal está aberto
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-2 sm:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-central-title"
        className="theme-modal flex max-h-full w-full max-w-[1600px] flex-col overflow-hidden rounded-xl shadow-2xl"
      >
        {/* Cabeçalho fixo; o conteúdo rola por baixo */}
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 sm:px-6 sm:pt-5" style={{ borderBottom: "1px solid var(--ds-color-container-divider-card)" }}>
          <div>
            <h2 id="admin-central-title" className="text-[17px] font-semibold" style={{ color: "var(--ds-color-content-title)" }}>Central Administrativa</h2>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Configurações das métricas sem alteração de código. Só administradores.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="shrink-0 rounded-md p-1.5 transition hover:bg-[var(--ds-color-input-surface-hover)]"
            style={{ color: "var(--ds-color-content-body)" }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          <AdminCentral squads={squads} />
        </div>
      </div>
    </div>
  );
}
