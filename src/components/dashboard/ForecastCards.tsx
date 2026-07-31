import type { ForecastResult } from "@/metrics/forecast";

interface ForecastCardsProps {
  forecast: ForecastResult;
}

export default function ForecastCards({ forecast }: ForecastCardsProps) {
  const items = [
    { type: "Épico", value: forecast.epic.p85Days, sample: forecast.epic.sampleSize },
    { type: "Feature", value: forecast.feature.p85Days, sample: forecast.feature.sampleSize },
    { type: "História", value: forecast.story?.p85Days ?? null, sample: forecast.story?.sampleSize ?? 0 },
  ];

  return (
    <div className="rounded-xl border border-white/5 bg-white/5 p-4">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">
        Forecast — Tempo Estimado P85
      </h3>
      <div className="grid grid-cols-3 gap-3">
        {items.map((item) => (
          <div
            key={item.type}
            className="rounded-lg border border-white/5 bg-white/[0.03] p-3 text-center"
          >
            <p className="text-[9px] uppercase text-gray-400">{item.type}</p>
            <p className="mt-1 text-xl font-black text-white">
              {item.value ?? "N/A"}
            </p>
            <p className="text-[9px] text-gray-500">dias corridos</p>
            <span className="mt-1.5 inline-block rounded bg-indigo-500/10 px-2 py-0.5 text-[8px] text-indigo-300">
              R2 — {item.sample} itens
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
