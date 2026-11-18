"use client";
import type { TrendReading } from "@/lib/trend-reading";

const LABEL = { melhorando: "Melhorando", estavel: "Estável", piorando: "Piorando", "sem-base": "Sem base" } as const;
const CLS = {
  melhorando: "var(--ds-color-feedback-positive-surface)",
  estavel: "var(--ds-color-feedback-neutral-surface)",
  piorando: "var(--ds-color-feedback-negative-surface)",
  "sem-base": "var(--ds-color-feedback-neutral-surface)",
} as const;
const TXT = {
  melhorando: "var(--ds-color-feedback-positive-label)",
  estavel: "var(--ds-color-feedback-neutral-label)",
  piorando: "var(--ds-color-feedback-negative-label)",
  "sem-base": "var(--ds-color-feedback-neutral-label)",
} as const;

export default function TrendVerdictBadge({ reading, unit }: { reading: TrendReading; unit: string }) {
  const d = reading.deltaPct;
  return (
    <span
      title={d == null ? "Poucos períodos para comparar" : `${d > 0 ? "+" : ""}${d.toFixed(0)}% ${unit}`}
      className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold"
      style={{ background: CLS[reading.verdict], color: TXT[reading.verdict] }}
    >
      {LABEL[reading.verdict]}
      {d != null && ` · ${d > 0 ? "+" : ""}${d.toFixed(0)}%`}
    </span>
  );
}
