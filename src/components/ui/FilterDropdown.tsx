"use client";
import { useEffect, useId, useRef, useState } from "react";

export interface FilterOption {
  value: string;
  label: string;
  /** Texto à direita (ex.: datas da sprint, contagem) */
  hint?: string;
}

export interface FilterGroup {
  id: string;
  /** Sem rótulo: as opções aparecem soltas, sem caixa de grupo */
  label?: string;
  hint?: string;
  options: FilterOption[];
}

interface FilterDropdownProps {
  /** Nome do filtro no botão (ex.: "Sprints") */
  label: string;
  /** Resumo do que está selecionado, mostrado no botão */
  summary: string;
  groups: FilterGroup[];
  selected: string[];
  onApply: (values: string[]) => void;
  disabled?: boolean;
}

type CheckState = "on" | "off" | "mixed";

function Checkbox({ state, onToggle, label, hint, nested }: { state: CheckState; onToggle: () => void; label: string; hint?: string; nested?: boolean }) {
  const on = state !== "off";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={state === "mixed" ? "mixed" : state === "on"}
      onClick={onToggle}
      className={`flex w-full items-center gap-3 rounded-lg py-2 pr-2 text-left transition-colors hover:bg-[var(--ds-color-action-tonal-surface)] ${nested ? "pl-8" : "pl-2"}`}
    >
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors"
        style={{
          borderColor: on ? "var(--ds-color-content-title)" : "var(--ds-color-input-border)",
          background: on ? "var(--ds-color-content-title)" : "transparent",
        }}
        aria-hidden="true"
      >
        {state === "on" && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ds-color-container-popover-surface)" strokeWidth="3.5">
            <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        {state === "mixed" && <span className="h-[3px] w-2.5 rounded" style={{ background: "var(--ds-color-container-popover-surface)" }} />}
      </span>
      <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "var(--ds-color-content-title)" }}>{label}</span>
      {hint && <span className="shrink-0 text-[12px] tabular-nums" style={{ color: "var(--ds-color-content-caption)" }}>{hint}</span>}
    </button>
  );
}

/**
 * Filtro em dropdown (padrão do DS MB): grupos com caixa que marca/desmarca o grupo inteiro,
 * opções com caixa e texto à direita, e rodapé com "Limpar filtro" e "Aplicar".
 * A seleção só vale ao clicar em Aplicar; fechar descarta o rascunho.
 */
export default function FilterDropdown({ label, summary, groups, selected, onApply, disabled }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(selected);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleOpen = () => {
    if (!open) setDraft(selected);
    setOpen((v) => !v);
  };
  const toggleValue = (value: string) =>
    setDraft((d) => (d.includes(value) ? d.filter((v) => v !== value) : [...d, value]));
  const groupState = (g: FilterGroup): CheckState => {
    const n = g.options.filter((o) => draft.includes(o.value)).length;
    return n === 0 ? "off" : n === g.options.length ? "on" : "mixed";
  };
  const toggleGroup = (g: FilterGroup) => {
    const values = g.options.map((o) => o.value);
    setDraft((d) => (groupState(g) === "on" ? d.filter((v) => !values.includes(v)) : Array.from(new Set([...d, ...values]))));
  };
  const changed = draft.length !== selected.length || draft.some((v) => !selected.includes(v));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggleOpen}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={panelId}
        className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-semibold transition-colors disabled:opacity-50"
        style={{
          background: open ? "var(--tab-active-bg)" : "var(--ds-color-feedback-neutral-surface)",
          color: open ? "var(--tab-active-text)" : "var(--ds-color-content-title)",
        }}
      >
        <span>{label}</span>
        <span className="max-w-[260px] truncate font-normal" style={{ opacity: 0.8 }}>{summary}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          id={panelId}
          className="absolute left-0 top-full z-50 mt-2 flex w-[320px] flex-col rounded-3xl"
          style={{ background: "var(--ds-color-container-popover-surface)", boxShadow: "var(--ds-shadow-overlay)", border: "1px solid var(--ds-color-container-divider-card)" }}
        >
          <div className="max-h-[360px] overflow-y-auto p-3">
            {groups.map((g) => (
              <div key={g.id} className="mb-1">
                {g.label ? (
                  <>
                    <Checkbox state={groupState(g)} onToggle={() => toggleGroup(g)} label={g.label} hint={g.hint} />
                    {g.options.map((o) => (
                      <Checkbox key={o.value} nested state={draft.includes(o.value) ? "on" : "off"} onToggle={() => toggleValue(o.value)} label={o.label} hint={o.hint} />
                    ))}
                  </>
                ) : (
                  g.options.map((o) => (
                    <Checkbox key={o.value} state={draft.includes(o.value) ? "on" : "off"} onToggle={() => toggleValue(o.value)} label={o.label} hint={o.hint} />
                  ))
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-2 p-3 pt-2" style={{ borderTop: "1px solid var(--ds-color-container-divider-card)" }}>
            <button
              type="button"
              onClick={() => setDraft([])}
              disabled={draft.length === 0}
              className="flex-1 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-opacity disabled:opacity-50"
              style={{ background: "var(--ds-color-feedback-neutral-surface)", color: "var(--ds-color-content-body)" }}
            >
              Limpar filtro
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                if (changed) onApply(draft);
              }}
              className="flex-1 rounded-full px-4 py-2.5 text-[13px] font-semibold"
              style={{ background: "var(--ds-color-action-primary-surface)", color: "var(--ds-color-action-primary-content)" }}
            >
              Aplicar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
