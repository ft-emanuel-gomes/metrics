import type { KpiSummary, KpiItem } from "@/adapters/types";
import MetricTooltip from "@/components/ui/MetricTooltip";
import CapacityButton from "./CapacityButton";
import MonteCarloButton from "./MonteCarloButton";

interface KpiCardsProps {
  kpis: KpiSummary;
  squad?: string;
  availableSprints?: { id: number; name: string }[];
  isDesignMode?: boolean;
  teamSize?: number;
}

const METRIC_TOOLTIPS: Record<string, string> = {
  "Cycle Time P85": "Métrica que mede o tempo total de trabalho ativo necessário para concluir um item no fluxo, desde o ponto de compromisso do time (To Do) até a sua entrega final (Done). Nos ajuda a entender quanto tempo o time leva para executar o trabalho.",
  "Vazão": "Métrica que mede quantos itens foram concluídos em um período de tempo específico pelo time. A vazão nos ajuda a entender a capacidade real do time, baseada em histórico, e serve como base para previsibilidade.",
  "Eficiência de Fluxo": "Métrica que mede a proporção entre o tempo ativo de trabalho (valor agregado) e o tempo total de permanência do item no fluxo (Cycle Time). Nos ajuda a identificar tempos de espera excessivos, gargalos e desperdícios ao longo dos status.",
  "Transbordo": "Percentual de itens comprometidos no início da sprint que não foram concluídos dentro do período. Indica se o time está comprometendo acima da sua capacidade real.",
  "WIP Aging (>10d)": "Percentual de itens atualmente no fluxo de trabalho (To Do a Done) que estão há mais de 10 dias sem conclusão. Dados realtime — reflete o estado atual do board.",
  "Ocupação": "Percentual da capacidade do time que foi alocada via Original Estimate das issues. Capacidade = pessoas × 6h/dia × dias úteis da sprint.",
};

/**
 * Determina a classe da pill badge baseado na direção do delta.
 */
function getPillClass(item: KpiItem): string {
  if (!item.delta) return "";
  if (item.status === "good" || item.status === "purple") return "theme-pill theme-pill-up";
  if (item.status === "danger" || item.status === "warn") return "theme-pill theme-pill-down";
  return "theme-pill theme-pill-neutral";
}

function KpiCard({ item, extra }: { item: KpiItem; extra?: React.ReactNode }) {
  const tooltip = METRIC_TOOLTIPS[item.label];
  const pillClass = getPillClass(item);

  return (
    <div className="theme-card flex flex-col h-full">
      {/* Row 1: Label + button (fixed height) */}
      <div className="flex items-center justify-between min-h-[24px]">
        <span className="block text-[11px] font-medium" style={{ color: "var(--text-secondary)" }}>
          {item.label}
          {tooltip && <MetricTooltip text={tooltip} />}
        </span>
        {extra}
      </div>

      {/* Row 2: Value (always same position) */}
      <p className="mt-2 text-[30px] font-medium leading-none" style={{ color: "var(--text-primary)" }}>
        {item.value}
      </p>

      {/* Row 3: Pill/delta (bottom, auto margin pushes down) */}
      <div className="mt-auto pt-2">
        {item.delta && (
          <span className={pillClass}>
            {item.deltaDirection === "up" && (
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            )}
            {item.deltaDirection === "down" && (
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
              </svg>
            )}
            {item.delta}
          </span>
        )}
        {!item.delta && item.previousValue && (
          <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            {item.previousValue}
          </p>
        )}
      </div>
    </div>
  );
}

export default function KpiCards({ kpis, squad, availableSprints, isDesignMode, teamSize }: KpiCardsProps) {
  // Em modo Design: Cycle Time + Vazao + WIP Aging (sempre 3 cards)
  // Em modo Engenharia: todos os KPIs aplicaveis
  const items: KpiItem[] = isDesignMode
    ? [
        kpis.cycleTime,
        kpis.throughput,
        kpis.wipAging || {
          label: "WIP Aging (>10d)",
          value: "0%",
          numericValue: 0,
          status: "good" as const,
          delta: "0/0 itens",
          deltaDirection: "flat" as const,
          previousValue: "Total WIP: 0",
        },
      ]
    : [
        kpis.cycleTime,
        kpis.throughput,
        kpis.flowEfficiency,
        kpis.spilloverOrWip,
        kpis.occupation,
        // WIP Aging extra somente se diferente do spilloverOrWip (Sprint squads)
        ...(kpis.wipAging && kpis.wipAging.label !== kpis.spilloverOrWip.label ? [kpis.wipAging] : []),
      ];

  const colCount = isDesignMode
    ? "lg:grid-cols-3"
    : items.length >= 6 ? "lg:grid-cols-6" : items.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4";

  return (
    <div className={`grid grid-cols-2 gap-3.5 sm:grid-cols-3 ${colCount}`}>
      {items.map((item, idx) => (
        <KpiCard
          key={`${item.label}-${idx}`}
          item={item}
          extra={
            item.label === "Ocupação" && squad && availableSprints
              ? <CapacityButton squad={squad} availableSprints={availableSprints} />
              : item.label === "Vazão" && squad && availableSprints
              ? <MonteCarloButton squad={squad} defaultTeamSize={teamSize || 6} availableSprints={availableSprints} />
              : undefined
          }
        />
      ))}
    </div>
  );
}
