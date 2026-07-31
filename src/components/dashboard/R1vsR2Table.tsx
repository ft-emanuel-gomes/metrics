import type { R1vsR2Row } from "@/adapters/types";

interface R1vsR2TableProps {
  rows: R1vsR2Row[];
}

export default function R1vsR2Table({ rows }: R1vsR2TableProps) {
  if (rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/5 bg-white/5 p-4">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">
        R1 vs R2 — Comparativo (Percentil 85)
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="bg-indigo-500/10 text-indigo-300">
              <th className="px-2 py-1.5 text-left font-semibold">Métrica</th>
              <th className="px-2 py-1.5 text-center font-semibold">R1</th>
              <th className="px-2 py-1.5 text-center font-semibold">R2</th>
              <th className="px-2 py-1.5 text-center font-semibold">Variação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-white/[0.04]">
                <td className="px-2 py-1.5 text-gray-300">{row.name}</td>
                <td className="px-2 py-1.5 text-center text-gray-300">{row.r1Value}</td>
                <td className="px-2 py-1.5 text-center text-gray-300">{row.r2Value}</td>
                <td
                  className={`px-2 py-1.5 text-center font-semibold ${
                    row.isPositive ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {row.variation}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
