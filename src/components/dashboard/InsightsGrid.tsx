import type { InsightItem } from "@/adapters/types";

interface InsightsGridProps {
  insights: InsightItem[];
}

const SEVERITY_STYLES: Record<InsightItem["severity"], string> = {
  green: "border-emerald-400",
  yellow: "border-amber-400",
  red: "border-red-400",
  blue: "border-indigo-400",
};

export default function InsightsGrid({ insights }: InsightsGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {insights.map((insight, idx) => (
        <div
          key={idx}
          className={`rounded-lg border-l-[3px] bg-white/5 p-3.5 ${SEVERITY_STYLES[insight.severity]}`}
        >
          <p className="text-[11px] font-bold text-white">{insight.title}</p>
          <p className="mt-1 text-[9px] leading-relaxed text-gray-400">
            {insight.text}
          </p>
        </div>
      ))}
    </div>
  );
}
