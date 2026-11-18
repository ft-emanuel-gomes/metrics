import type { EvolutionRow, Period } from "@/adapters/types";

interface EvolutionTableProps {
  evolution: EvolutionRow[];
  periods: Period[];
}

const TREND_STYLES = {
  up: "text-[color:var(--ds-color-content-positive)]",
  down: "text-[color:var(--ds-color-content-negative)]",
  flat: "text-[color:var(--ds-color-content-alert)]",
};

const TREND_LABELS = {
  crescente: "↑ Crescente",
  decrescente: "↓ Decrescente",
  estavel: "→ Estável",
  variavel: "↔ Variável",
};

export default function EvolutionTable({ evolution, periods }: EvolutionTableProps) {
  return (
    <div className="theme-section">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide t-secondary">
        Evolução das Métricas
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="bg-[color-mix(in_srgb,var(--ds-color-content-primary)_12%,transparent)] text-[color:var(--ds-color-content-primary)]">
              <th className="px-2 py-1.5 text-left font-semibold">Métrica</th>
              {periods.map((p) => (
                <th key={p.shortName} className="px-2 py-1.5 text-center font-semibold">
                  {p.shortName}
                </th>
              ))}
              <th className="px-2 py-1.5 text-center font-semibold">Tendência</th>
            </tr>
          </thead>
          <tbody>
            {evolution.map((row) => (
              <tr key={row.metric} className="border-b border-[color:var(--ds-color-container-divider-card)]">
                <td className="px-2 py-1.5 text-[color:var(--ds-color-content-body)]">{row.metric}</td>
                {row.values.map((val, i) => (
                  <td key={i} className="px-2 py-1.5 text-center text-[color:var(--ds-color-content-body)]">
                    {val}
                  </td>
                ))}
                <td className={`px-2 py-1.5 text-center font-semibold ${TREND_STYLES[row.trendColor]}`}>
                  {TREND_LABELS[row.trend]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
