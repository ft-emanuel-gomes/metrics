import type { ForecastResult } from "@/metrics/forecast";

interface ForecastCardsProps {
  forecast: ForecastResult;
}

export default function ForecastCards({ forecast }: ForecastCardsProps) {
  const items = [
    { type: "Epico", value: forecast.epic.p85Days, sample: forecast.epic.sampleSize },
    { type: "Feature", value: forecast.feature.p85Days, sample: forecast.feature.sampleSize },
    { type: "Historia", value: forecast.story?.p85Days ?? null, sample: forecast.story?.sampleSize ?? 0 },
  ];

  return (
    <div className="theme-section">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide t-secondary">
        Forecast — Tempo Estimado P85
      </h3>
      <div className="grid grid-cols-3 gap-3">
        {items.map((item) => (
          <div
            key={item.type}
            className="theme-card text-center"
          >
            <p className="text-[9px] uppercase t-secondary">{item.type}</p>
            <p className="mt-1 text-xl font-black" style={{ color: "var(--text-primary)" }}>
              {item.value ?? "N/A"}
            </p>
            <p className="text-[9px] t-muted">dias corridos</p>
            <span className="mt-1.5 inline-block rounded px-2 py-0.5 text-[8px]" style={{ backgroundColor: "var(--accent-bg)", color: "var(--accent)" }}>
              R2 — {item.sample} itens
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
