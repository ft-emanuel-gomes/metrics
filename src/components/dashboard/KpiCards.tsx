import type { KpiSummary, KpiItem } from "@/adapters/types";
import MetricTooltip from "@/components/ui/MetricTooltip";
import CapacityButton from "./CapacityButton";

interface KpiCardsProps {
  kpis: KpiSummary;
  squad?: string;
  availableSprints?: { id: number; name: string }[];
}

const STATUS_COLORS: Record<KpiItem["status"], string> = {
  good: "from-emerald-500 to-emerald-400",
  warn: "from-amber-500 to-amber-400",
  danger: "from-red-500 to-red-400",
  info: "from-indigo-500 to-indigo-400",
  purple: "from-violet-500 to-violet-400",
};

const METRIC_TOOLTIPS: Record<string, string> = {
  "Cycle Time P85": "Métrica que mede o tempo total de trabalho ativo necessário para concluir um item no fluxo, desde o ponto de compromisso do time (To Do) até a sua entrega final (Done). Nos ajuda a entender quanto tempo o time leva para executar o trabalho.",
  "Vazão": "Métrica que mede quantos itens foram concluídos em um período de tempo específico pelo time. A vazão nos ajuda a entender a capacidade real do time, baseada em histórico, e serve como base para previsibilidade.",
  "Eficiência de Fluxo": "Métrica que mede a proporção entre o tempo ativo de trabalho (valor agregado) e o tempo total de permanência do item no fluxo (Cycle Time). Nos ajuda a identificar tempos de espera excessivos, gargalos e desperdícios ao longo dos status.",
  "Transbordo": "Percentual de itens comprometidos no início da sprint que não foram concluídos dentro do período. Indica se o time está comprometendo acima da sua capacidade real.",
  "WIP Aging (>10d)": "Percentual de itens atualmente no fluxo de trabalho (To Do a Done) que estão há mais de 10 dias sem conclusão. Dados realtime — reflete o estado atual do board.",
  "Ocupação": "Percentual da capacidade do time que foi alocada via Original Estimate das issues. Capacidade = pessoas × 6h/dia × dias úteis da sprint.",
};

function KpiCard({ item, extra }: { item: KpiItem; extra?: React.ReactNode }) {
  const barColor = STATUS_COLORS[item.status];
  const tooltip = METRIC_TOOLTIPS[item.label];

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/5 bg-white/5 p-4">
      {/* Status bar top */}
      <div
        className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${barColor}`}
      />

      <div className="flex items-center justify-between">
        <span className="block text-[9px] font-semibold uppercase tracking-wide text-gray-300">
          {item.label}
          {tooltip && <MetricTooltip text={tooltip} />}
        </span>
        {extra}
      </div>
      <p className="mt-2 text-3xl font-black text-white leading-none">
        {item.value}
      </p>

      {item.delta && (
        <p
          className={`mt-1.5 text-[11px] font-semibold ${
            item.deltaDirection === "up"
              ? item.status === "good"
                ? "text-emerald-400"
                : "text-red-400"
              : item.deltaDirection === "down"
              ? item.status === "good"
                ? "text-emerald-400"
                : "text-red-400"
              : "text-amber-400"
          }`}
        >
          {item.delta}
        </p>
      )}

      {item.previousValue && (
        <p className="mt-0.5 text-[9px] text-gray-500">{item.previousValue}</p>
      )}
    </div>
  );
}

export default function KpiCards({ kpis, squad, availableSprints }: KpiCardsProps) {
  const items: KpiItem[] = [
    kpis.cycleTime,
    kpis.throughput,
    kpis.flowEfficiency,
    kpis.spilloverOrWip,
    kpis.occupation,
    // Adicionar WIP Aging como 6º card somente se for diferente do spilloverOrWip (Sprint squads)
    ...(kpis.wipAging && kpis.wipAging.label !== kpis.spilloverOrWip.label ? [kpis.wipAging] : []),
  ];

  return (
    <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${items.length > 5 ? "lg:grid-cols-6" : "lg:grid-cols-5"}`}>
      {items.map((item, idx) => (
        <KpiCard
          key={`${item.label}-${idx}`}
          item={item}
          extra={item.label === "Ocupação" && squad && availableSprints ? (
            <CapacityButton squad={squad} availableSprints={availableSprints} />
          ) : undefined}
        />
      ))}
    </div>
  );
}
