import type { R2ProgressResult, R2ItemCount } from "@/metrics/r2-progress";
import ScopeDonut from "./ScopeDonut";

interface R2ProgressProps {
  r2Progress: R2ProgressResult;
  /** Dentro de outro card (Resumo executivo): sem moldura própria e donuts menores */
  embedded?: boolean;
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

function ScopeBlock({ title, item, size = 128 }: { title: string; item: R2ItemCount; size?: number }) {
  const rows = [
    { label: "Concluído", value: item.done, badge: "ds-badge-positive", dot: "var(--ds-color-content-positive)" },
    { label: "Em andamento", value: item.inProgress, badge: "ds-badge-primary", dot: "var(--ds-color-content-primary)" },
    { label: "Pendente", value: item.pending, badge: "", dot: "var(--ds-color-content-disabled)" },
  ];

  return (
    <div className="flex flex-col items-center">
      <p className="mb-3 text-[11px] font-semibold t-accent">
        {title} <span className="t-muted font-normal">({item.total})</span>
      </p>
      <div className="flex flex-col items-center gap-3">
        <ScopeDonut done={item.done} inProgress={item.inProgress} pending={item.pending} size={size} />
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center gap-2 text-[12px]">
              <span className="w-14 text-right tabular-nums t-secondary">
                {r.value} {plural(r.value, "item", "itens")}
              </span>
              <span className={`ds-badge ${r.badge}`}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: r.dot }} />
                {r.label}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * Progresso da Release em donuts: Épicos e Features separados
 * (não misturados), com o % concluído geral no cabeçalho.
 */
export default function R2Progress({ r2Progress, embedded = false }: R2ProgressProps) {
  const { epics, features, riskInsight } = r2Progress;
  const total = epics.total + features.total;
  const done = epics.done + features.done;
  const donePct = total > 0 ? Math.round((done / total) * 100) : 0;
  const donutSize = embedded ? 112 : 128;

  return (
    <div className={embedded ? "" : "theme-section"}>
      <div className="mb-4 flex items-start justify-between gap-2">
        {embedded ? (
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--ds-color-content-caption)" }}>
            Progresso da {r2Progress.releaseName || "Release"} — Épicos e Features
          </p>
        ) : (
          <h3 className="text-[11px] font-bold uppercase tracking-wide t-secondary">
            Progresso da Release — Distribuição do Escopo
          </h3>
        )}
        <span className="ds-badge ds-badge-positive shrink-0">{donePct}% concluído</span>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-4">
        <ScopeBlock title="Épicos" item={epics} size={donutSize} />
        {/* Divisor vertical entre Épicos e Features */}
        <div
          className="w-px self-stretch"
          style={{ background: "var(--ds-color-container-divider-card)" }}
          aria-hidden="true"
        />
        <ScopeBlock title="Features" item={features} size={donutSize} />
      </div>

      {riskInsight && (
        <p className="mt-4 text-center text-[10px] font-medium text-[color:var(--ds-color-content-alert)]">
          {riskInsight}
        </p>
      )}
    </div>
  );
}
