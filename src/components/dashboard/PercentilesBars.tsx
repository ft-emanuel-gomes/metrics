"use client";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useChartTheme } from "@/lib/use-chart-theme";

interface PercentilesProps {
  p50: number | null;
  p85: number | null;
  p95: number | null;
  sampleSize: number;
}

/**
 * Confiança de Entrega: percentis combinados do Cycle Time.
 * Uma só cor (primária MB) com intensidade crescente; o P85 é o compromisso de prazo.
 */
export default function PercentilesBars({ p50, p85, p95, sampleSize }: PercentilesProps) {
  const t = useChartTheme();
  const data = [
    { name: "P50", label: "Típico", value: p50 ?? 0, opacity: 0.45, text: "50% das entregas" },
    { name: "P85", label: "Compromisso", value: p85 ?? 0, opacity: 1, text: "85% das entregas" },
    { name: "P95", label: "Pior caso", value: p95 ?? 0, opacity: 0.7, text: "95% das entregas" },
  ];

  return (
    <div className="theme-section">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wide t-secondary">
          Confiança de entrega — percentis do Cycle Time
        </h3>
        <span className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: "var(--ds-color-feedback-neutral-surface)", color: "var(--ds-color-feedback-neutral-label)" }}>
          {sampleSize} cards
        </span>
      </div>
      <div style={{ width: "100%", height: 150 }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 36, left: 0, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid horizontal={false} stroke={t.grid} />
            <XAxis type="number" tick={{ fill: t.muted, fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={(v) => `${v}d`} />
            <YAxis type="category" dataKey="name" width={34} tick={{ fill: t.body, fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: t.grid, opacity: 0.35 }}
              contentStyle={{ background: t.surface, border: `1px solid ${t.grid}`, borderRadius: 12, fontSize: 12, color: t.title }}
              labelStyle={{ color: t.title, fontWeight: 600 }}
              formatter={(v, _n, item) => [`${v} dias`, item.payload.label]}
            />
            <Bar isAnimationActive={false} dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={24}>
              {data.map((d) => (
                <Cell key={d.name} fill={t.series[0]} fillOpacity={d.opacity} />
              ))}
              <LabelList dataKey="value" position="right" formatter={(v) => `${v}d`} fill={t.title} fontSize={11} fontWeight={600} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 space-y-1 text-[11px] t-muted">
        {data.map((d) => (
          <li key={d.name}>
            {d.text} em até <strong style={{ color: "var(--ds-color-content-title)" }}>{d.value || "N/A"} dias</strong>
            {d.name === "P85" && " — prazo que podemos prometer"}
          </li>
        ))}
      </ul>
    </div>
  );
}
