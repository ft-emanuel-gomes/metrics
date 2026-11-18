import type { R1vsR2Row } from "@/adapters/types";

interface R1vsR2TableProps {
  rows: R1vsR2Row[];
}

export default function R1vsR2Table({ rows }: R1vsR2TableProps) {
  if (rows.length === 0) return null;

  return (
    <div className="theme-section">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wide t-secondary">
        R1 vs R2 — Comparativo (Percentil 85)
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="bg-[color-mix(in_srgb,var(--ds-color-content-primary)_12%,transparent)] text-[color:var(--ds-color-content-primary)]">
              <th className="px-2 py-1.5 text-left font-semibold">Métrica</th>
              <th className="px-2 py-1.5 text-center font-semibold">R1</th>
              <th className="px-2 py-1.5 text-center font-semibold">R2</th>
              <th className="px-2 py-1.5 text-center font-semibold">Variação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name} className="border-b border-[color:var(--ds-color-container-divider-card)]">
                <td className="px-2 py-1.5 text-[color:var(--ds-color-content-body)]">{row.name}</td>
                <td className="px-2 py-1.5 text-center text-[color:var(--ds-color-content-body)]">{row.r1Value}</td>
                <td className="px-2 py-1.5 text-center text-[color:var(--ds-color-content-body)]">{row.r2Value}</td>
                <td
                  className={`px-2 py-1.5 text-center font-semibold ${
                    row.isPositive ? "text-[color:var(--ds-color-content-positive)]" : "text-[color:var(--ds-color-content-negative)]"
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
