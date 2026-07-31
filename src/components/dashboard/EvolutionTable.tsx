import type { EvolutionRow, Period } from "@/adapters/types";

interface EvolutionTableProps {
  evolution: EvolutionRow[];
  periods: Period[];
}

const TREND_STYLES = {
  up: "text-emerald-400",
  down: "text-red-400",
  flat: "text-amber-400",
};

const TREND_LABELS = {
  crescente: "↑ Crescente",
  decrescente: "↓ Decrescente",
  estavel: "→ Estável",
  variavel: "↔ Variável",
};

export default function EvolutionTable({ evolution, periods }: EvolutionTableProps) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/5 p-4">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">
        Evolução das Métricas
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="bg-indigo-500/10 text-indigo-300">
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
              <tr key={row.metric} className="border-b border-white/[0.04]">
                <td className="px-2 py-1.5 text-gray-300">{row.metric}</td>
                {row.values.map((val, i) => (
                  <td key={i} className="px-2 py-1.5 text-center text-gray-300">
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
