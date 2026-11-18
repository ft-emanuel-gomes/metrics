"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SquadConfig } from "@/config/squads";

// Meta do WIP Aging (dias corridos). Mesmo valor de WIP_AGING_LIMIT_DAYS em src/metrics/wip-aging.ts;
// não importado aqui porque aquele módulo depende de código server-side.
const WIP_AGING_LIMIT_DAYS = 10;

interface SquadHealthIndicatorProps {
  squad: SquadConfig;
}

type HealthStatus = "green" | "yellow" | "red" | "loading";

interface MetricHealth {
  label: string;
  value: string;
  status: "green" | "red";
}

const BORDER_COLORS: Record<HealthStatus, string> = {
  green: "border-[color:var(--ds-color-container-border-positive)]",
  yellow: "border-[color:var(--ds-color-container-border-alert)]",
  red: "border-[color:var(--ds-color-container-border-negative)]",
  loading: "border-[color:var(--ds-color-container-divider-card)]",
};

/**
 * Avalia cada metrica contra sua meta e calcula o health geral.
 *
 * Metas (Transbordo e Bugs NAO compoem o sinaleiro da home):
 *   Cycle Time <= 15d
 *   Eficiencia >= 70%
 *   Ocupacao >= 80%
 *   WIP Aging: item mais antigo <= 10 dias (acima disso nunca fica verde)
 *
 * Health:
 *   Verde: ate 1 metrica abaixo da meta
 *   Amarelo: ate 2 metricas abaixo da meta
 *   Vermelho: 3+ metricas abaixo da meta
 */
function evaluateMetrics(
  kpis: Record<string, { numericValue?: number; label?: string }>,
  wipAgingDays: number[]
): {
  health: HealthStatus;
  metrics: MetricHealth[];
} {
  const metrics: MetricHealth[] = [];

  // Cycle Time
  const ct = kpis.cycleTime?.numericValue ?? 0;
  const ctOk = ct <= 15;
  metrics.push({ label: "Cycle Time P85", value: `${ct}d`, status: ctOk ? "green" : "red" });

  // Eficiência de Fluxo (meta: >= 70%)
  const eff = kpis.flowEfficiency?.numericValue ?? 0;
  const effOk = eff >= 70;
  metrics.push({ label: "Eficiência de Fluxo", value: `${eff}%`, status: effOk ? "green" : "red" });

  // Ocupação
  const occ = kpis.occupation?.numericValue ?? 0;
  const occOk = occ >= 80;
  metrics.push({ label: "Ocupação", value: `${occ}%`, status: occOk ? "green" : "red" });

  // WIP Aging — idade real (dias corridos) do item mais antigo em andamento, e quantos passam da meta.
  // Sem itens em andamento = 0 dias.
  const oldest = wipAgingDays.length > 0 ? Math.max(...wipAgingDays) : 0;
  const overLimit = wipAgingDays.filter((d) => d > WIP_AGING_LIMIT_DAYS).length;
  const wipOk = oldest <= WIP_AGING_LIMIT_DAYS;
  metrics.push({
    label: "WIP Aging",
    value: overLimit > 0 ? `${oldest}d (${overLimit} > ${WIP_AGING_LIMIT_DAYS}d)` : `${oldest}d`,
    status: wipOk ? "green" : "red",
  });

  const belowMeta = metrics.filter((m) => m.status === "red").length;

  let health: HealthStatus;
  if (belowMeta <= 1) health = "green";
  else if (belowMeta <= 2) health = "yellow";
  else health = "red";

  return { health, metrics };
}

export default function SquadHealthIndicator({ squad }: SquadHealthIndicatorProps) {
  const [health, setHealth] = useState<HealthStatus>("loading");
  const [metrics, setMetrics] = useState<MetricHealth[]>([]);

  useEffect(() => {
    const controller = new AbortController();

    // Passar o filtro padrão de issue types (Engenharia — todas exceto Design)
    const defaultTypes = ["História", "Bug", "Task", "Tech Debt", "Kaizen", "Spike"];
    const params = new URLSearchParams({ issueType: defaultTypes.join(",") });

    fetch(`/api/metrics/${squad.slug}?${params.toString()}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.json();
      })
      .then((data) => {
        if (data.kpis) {
          // Idade (dias) de cada item em andamento — base do WIP Aging
          const wipAgingDays: number[] = (data.wipAging?.issues ?? [])
            .map((i: { agingDays?: number }) => i.agingDays)
            .filter((d: number | undefined): d is number => typeof d === "number");
          const result = evaluateMetrics(data.kpis, wipAgingDays);
          setHealth(result.health);
          setMetrics(result.metrics);
        }
      })
      .catch(() => {
        // Sem dados ainda — manter loading
      });

    return () => controller.abort();
  }, [squad.slug]);

  return (
    <Link
      href={`/dashboard/${squad.slug}`}
      className={`group relative border-2 ${BORDER_COLORS[health]} transition hover:-translate-y-0.5`}
      style={{
        backgroundColor: "var(--ds-color-container-card-surface-emphasis)",
        borderRadius: "var(--ds-radius-large)",
        boxShadow: "var(--ds-shadow-card)",
        padding: "var(--ds-space-large)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold group-hover:opacity-80" style={{ color: "var(--text-primary)" }}>
          {squad.name}
        </h2>
        <span
          className={`ds-badge uppercase ${squad.methodology === "sprint" ? "ds-badge-primary" : "ds-badge-alert"}`}
        >
          {squad.methodology}
        </span>
      </div>

      {/* Métricas com bolinhas */}
      {metrics.length > 0 ? (
        <div className="space-y-0.5">
          {metrics.map((m) => (
            <div key={m.label} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                style={{
                  backgroundColor:
                    m.status === "green"
                      ? "var(--ds-color-content-positive)"
                      : "var(--ds-color-content-negative)",
                }}
              />
              <span className="text-[11px]" style={{ color: "var(--text-primary)" }}>
                {m.label}: <strong>{m.value}</strong>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          <div className="h-2.5 w-3/4 rounded animate-pulse" style={{ backgroundColor: "var(--bg-hover)" }} />
          <div className="h-2.5 w-2/3 rounded animate-pulse" style={{ backgroundColor: "var(--bg-hover)" }} />
          <div className="h-2.5 w-1/2 rounded animate-pulse" style={{ backgroundColor: "var(--bg-hover)" }} />
        </div>
      )}
    </Link>
  );
}
