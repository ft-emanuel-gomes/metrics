"use client";

import { useState } from "react";

interface AddMenuProps {
  onAddColumn: (title: string) => Promise<void>;
  onOpenTimer: () => void;
}

/**
 * Menu dropdown "Adicionar" com opções: Nova Coluna, Novo Timer.
 */
export default function AddMenu({ onAddColumn, onOpenTimer }: AddMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isNaming, setIsNaming] = useState(false);
  const [columnName, setColumnName] = useState("");

  function handleAddColumn() {
    setIsOpen(false);
    setIsNaming(true);
  }

  async function handleSubmitColumn() {
    const title = columnName.trim();
    if (title) {
      await onAddColumn(title);
      setColumnName("");
      setIsNaming(false);
    }
  }

  function handleTimerClick() {
    setIsOpen(false);
    onOpenTimer();
  }

  return (
    <div className="relative">
      {isNaming ? (
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            value={columnName}
            onChange={(e) => setColumnName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmitColumn();
              if (e.key === "Escape") { setIsNaming(false); setColumnName(""); }
            }}
            placeholder="Nome da coluna..."
            className="w-40 rounded-md border border-[color:var(--ds-color-container-divider-card)] bg-[var(--ds-color-input-surface)] px-2 py-1.5 text-[11px] text-[color:var(--ds-color-content-title)] placeholder-[color:var(--ds-color-content-subdued)] outline-none focus:border-[color:var(--ds-color-container-border-primary)]"
          />
          <button
            onClick={handleSubmitColumn}
            disabled={!columnName.trim()}
            className="rounded-md bg-[var(--ds-color-action-primary-surface)] px-2.5 py-1.5 text-[10px] font-semibold text-white hover:bg-[var(--ds-color-action-primary-surface-hover)] disabled:opacity-40"
          >
            Criar
          </button>
          <button
            onClick={() => { setIsNaming(false); setColumnName(""); }}
            className="rounded-md bg-[var(--ds-color-input-surface)] px-2 py-1.5 text-[10px] text-[color:var(--ds-color-content-caption)] hover:bg-[var(--ds-color-input-surface-hover)]"
          >
            ✕
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="btn-primary rounded-lg"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Adicionar
          </button>

          {isOpen && (
            <div className="absolute left-0 top-full mt-1 z-30 rounded-lg py-1 shadow-xl min-w-[160px]" style={{ backgroundColor: "var(--bg-card)", border: "0.5px solid var(--border-primary)" }}>
              <button
                onClick={handleAddColumn}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] text-[color:var(--ds-color-content-body)] hover:bg-[var(--ds-color-input-surface-hover)]"
              >
                <svg className="h-3.5 w-3.5 text-[color:var(--ds-color-content-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Nova Coluna
              </button>
              <button
                onClick={handleTimerClick}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] text-[color:var(--ds-color-content-body)] hover:bg-[var(--ds-color-input-surface-hover)]"
              >
                <svg className="h-3.5 w-3.5 text-[color:var(--ds-color-content-positive)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Novo Timer
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
