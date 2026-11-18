import type { InsightItem } from "@/adapters/types";

interface InsightsGridProps {
  insights: InsightItem[];
}

const SEVERITY_STYLES: Record<InsightItem["severity"], string> = {
  green: "border-[color:var(--ds-color-container-border-positive)]",
  yellow: "border-[color:var(--ds-color-container-border-alert)]",
  red: "border-[color:var(--ds-color-container-border-negative)]",
  blue: "border-[color:var(--ds-color-container-border-primary)]",
};

export default function InsightsGrid({ insights }: InsightsGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {insights.map((insight, idx) => (
        <div
          key={idx}
          className={`rounded-lg border-l-[3px] p-3.5 ${SEVERITY_STYLES[insight.severity]}`}
          style={{ backgroundColor: "var(--bg-card)" }}
        >
          <p className="text-[11px] font-bold" style={{ color: "var(--text-primary)" }}>{insight.title}</p>
          <p className="mt-1 text-[9px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {insight.text}
          </p>
        </div>
      ))}
    </div>
  );
}
