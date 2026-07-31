import type { PeriodMetrics } from "@/adapters/types";

interface SpilloverDotsProps {
  periodMetrics: PeriodMetrics[];
}

/**
 * Calcula tamanho dos dots baseado no máximo de itens.
 * Mais agressivo na redução para evitar overflow.
 */
function getDotSize(maxDots: number): number {
  if (maxDots <= 12) return 14;
  if (maxDots <= 18) return 12;
  if (maxDots <= 25) return 10;
  if (maxDots <= 35) return 8;
  return 6;
}

export default function SpilloverDots({ periodMetrics }: SpilloverDotsProps) {
  const maxDots = Math.max(
    ...periodMetrics.map((pm) => pm.spillover?.committed ?? 0)
  );
  const dotSize = getDotSize(maxDots);

  return (
    <div className="rounded-xl border border-white/5 bg-white/5 p-4">
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-3">
        Transbordo — Sprint Report
      </h3>
      <div className="space-y-2.5">
        {periodMetrics.map((pm) => {
          const sp = pm.spillover;
          if (!sp) return null;

          return (
            <div
              key={pm.period.shortName}
              className="flex items-center gap-2.5"
            >
              <span className="w-7 text-right text-[10px] text-gray-400 shrink-0">
                {pm.period.shortName}
              </span>
              <div className="flex flex-wrap gap-[3px] items-center flex-1 min-w-0">
                {Array.from({ length: sp.completed }).map((_, i) => (
                  <span
                    key={`done-${i}`}
                    className="rounded-full bg-emerald-400 shrink-0"
                    style={{ width: dotSize, height: dotSize }}
                  />
                ))}
                {Array.from({ length: sp.spilled }).map((_, i) => (
                  <span
                    key={`spill-${i}`}
                    className="rounded-full bg-red-400 shrink-0"
                    style={{ width: dotSize, height: dotSize }}
                  />
                ))}
              </div>
              <span className="whitespace-nowrap text-[10px] text-gray-400 shrink-0">
                {sp.percentage}% ({sp.spilled}/{sp.committed})
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
