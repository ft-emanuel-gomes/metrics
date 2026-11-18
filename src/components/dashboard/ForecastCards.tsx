import type { ForecastResult } from "@/metrics/forecast";

interface ForecastCardsProps {
  forecast: ForecastResult;
}

/**
 * Forecast upstream (P85 em dias corridos por tipo).
 * A base é a última release encerrada (automático no sync); sem release encerrada, a ativa.
 */
export default function ForecastCards({ forecast }: ForecastCardsProps) {
  const rel = forecast.releaseName ?? "Release";
  const closed = forecast.basis === "encerrada";
  const items = [
    { type: "Épico", value: forecast.epic.p85Days, sample: forecast.epic.sampleSize, basis: `${rel} · ${forecast.epic.sampleSize} itens` },
    { type: "Feature", value: forecast.feature.p85Days, sample: forecast.feature.sampleSize, basis: `${rel} · ${forecast.feature.sampleSize} itens` },
    { type: "História", value: forecast.story?.p85Days ?? null, sample: forecast.story?.sampleSize ?? 0, basis: `Sprints fechadas · ${forecast.story?.sampleSize ?? 0} cards` },
  ];
  return (
    <div className="theme-section">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wide t-secondary">Forecast — tempo estimado (P85)</h3>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold"
          style={{
            background: closed ? "var(--ds-color-feedback-positive-surface)" : "var(--ds-color-feedback-primary-surface)",
            color: closed ? "var(--ds-color-feedback-positive-label)" : "var(--ds-color-feedback-primary-label)",
          }}
        >
          {closed ? `Base: ${rel} encerrada` : `Base: ${rel} em andamento`}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {items.map((item) => (
          <div
            key={item.type}
            className="flex flex-col items-center rounded-2xl px-3 py-4 text-center"
            style={{ background: "var(--ds-color-container-card-surface-default)", border: "1px solid var(--ds-color-container-divider-card)" }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--ds-color-content-caption)" }}>{item.type}</p>
            <p className="mt-1 text-3xl font-medium leading-none" style={{ color: "var(--ds-color-content-title)" }}>{item.value ?? "N/A"}</p>
            <p className="mt-1 text-[10px]" style={{ color: "var(--ds-color-content-subdued)" }}>dias corridos</p>
            <span
              className="mt-3 rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{ background: "var(--ds-color-feedback-neutral-surface)", color: "var(--ds-color-feedback-neutral-label)" }}
            >
              {item.basis}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
