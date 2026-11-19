import type { PeriodMetrics } from "@/adapters/types";
import MetricTooltip from "@/components/ui/MetricTooltip";
import { buildSprintSummary, SUMMARY_GOALS, type SummaryTone } from "@/lib/sprint-summary";

interface SprintSummaryCardProps {
  periodMetrics: PeriodMetrics[];
}

const TONE_COLOR: Record<SummaryTone, string> = {
  positive: "var(--ds-color-content-positive)",
  alert: "var(--ds-color-content-alert)",
  negative: "var(--ds-color-content-negative)",
  neutral: "var(--ds-color-content-disabled)",
};

const TONE_BADGE: Record<SummaryTone, string> = {
  positive: "ds-badge-positive",
  alert: "ds-badge-alert",
  negative: "ds-badge-negative",
  neutral: "",
};

const TOOLTIP_TEXT =
  `Resumo automático, sem IA: cada frase vem de uma regra sobre os números da sprint, os mesmos dos gráficos desta tela. ` +
  `Metas (as mesmas do sinaleiro da home): Cycle Time P85 até ${SUMMARY_GOALS.cycleTimeDays} dias, Eficiência de Fluxo a partir de ${SUMMARY_GOALS.flowEfficiencyPct}% e Ocupação a partir de ${SUMMARY_GOALS.occupationPct}%. ` +
  `Resume a sprint mais recente da seleção e compara com a anterior. Até 1 meta fora = no ritmo; 2 = atenção; 3 = abaixo do esperado. ` +
  `Ocupação acima de 100% aparece como alerta na linha, mas só conta como meta fora abaixo de ${SUMMARY_GOALS.occupationPct}%.`;

/**
 * Resumo da Sprint: veredito em uma frase, cinco linhas com semáforo, comprometidos concluídos,
 * a meta mais distante e a base dos dados. Texto curto de propósito: o número vem primeiro.
 */
export default function SprintSummaryCard({ periodMetrics }: SprintSummaryCardProps) {
  const s = buildSprintSummary(periodMetrics);
  if (!s) return null;

  return (
    <div className="theme-section flex flex-col">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide t-secondary">
          Resumo da Sprint — {s.periodLabel}
          <MetricTooltip text={TOOLTIP_TEXT} />
        </h3>
        <span className={`ds-badge ${TONE_BADGE[s.verdict.tone]} shrink-0`}>{s.verdict.badge}</span>
      </div>

      {/* Abertura: o resultado em uma frase */}
      <p className="text-[15px] leading-snug" style={{ color: "var(--ds-color-content-body)" }}>
        <strong className="font-semibold" style={{ color: "var(--ds-color-content-title)" }}>{s.lead}</strong>
        {s.body && <> {s.body}</>}
      </p>

      <div className="my-3 h-px w-full" style={{ background: "var(--ds-color-container-divider-card)" }} />

      {/* Cinco leituras curtas, cada uma com semáforo */}
      <ul className="space-y-2">
        {s.lines.map((line) => (
          <li key={line.id} className="flex items-start gap-2.5 text-[12px] leading-snug">
            <span
              className="mt-[5px] h-2 w-2 shrink-0 rounded-full"
              style={{ background: TONE_COLOR[line.tone] }}
              aria-hidden="true"
            />
            <span style={{ color: "var(--ds-color-content-body)" }}>
              <strong className="font-semibold" style={{ color: "var(--ds-color-content-title)" }}>{line.label}.</strong> {line.text}
            </span>
          </li>
        ))}
      </ul>

      {/* Comprometidos concluídos */}
      {s.progress && (
        <div className="mt-4">
          <p className="mb-1.5 text-[12px]" style={{ color: "var(--ds-color-content-title)" }}>
            {s.progress.done} de {s.progress.total} {s.progress.total === 1 ? "card comprometido concluído" : "cards comprometidos concluídos"}
          </p>
          <div
            className="h-2.5 w-full overflow-hidden rounded-full"
            style={{ background: "var(--ds-color-container-divider-card)" }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={s.progress.pct}
            aria-label="Cards comprometidos concluídos"
          >
            <div className="h-full rounded-full" style={{ width: `${s.progress.pct}%`, background: "var(--ds-color-content-primary)" }} />
          </div>
          <p className="mt-1 text-[11px]">
            <span style={{ color: s.progress.pct >= 80 ? "var(--ds-color-content-positive)" : "var(--ds-color-content-alert)" }}>{s.progress.pct}% concluído</span>
            {s.progress.spilled > 0 && (
              <>
                <span className="t-muted"> · </span>
                <span style={{ color: "var(--ds-color-content-negative)" }}>
                  {s.progress.spilled} {s.progress.spilled === 1 ? "card transbordou" : "cards transbordaram"}
                </span>
              </>
            )}
          </p>
        </div>
      )}

      {/* A meta mais distante: por onde começar */}
      {s.focus && (
        <p className="mt-3 text-[12px] font-medium" style={{ color: "var(--ds-color-content-alert)" }}>
          {s.focus}
        </p>
      )}

      {/* Transparência: de onde vêm os números */}
      <p className="mt-auto pt-3 text-[10px] t-muted">{s.footnote}</p>
    </div>
  );
}
