"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { SquadConfig } from "@/config/squads";

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
  green: "border-emerald-500/60",
  yellow: "border-amber-400/60",
  red: "border-red-500/60",
  loading: "border-white/10",
};

/**
 * Avalia cada métrica contra sua meta e calcula o health geral.
 *
 * Metas:
 *   Cycle Time ≤ 15d
 *   Transbordo ≤ 2%
 *   Eficiência ≥ 60%
 *   Ocupação ≥ 80%
 *   WIP Aging ≤ 15% (itens acima de 15d)
 *
 * Health:
 *   Verde: até 1 métrica abaixo da meta
 *   Amarelo: até 2 métricas abaixo da meta
 *   Vermelho: 3+ métricas abaixo da meta
 */
function evaluateMetrics(kpis: Record<string, { numericValue?: number; label?: string }>, bugCount: number = 0): {
  health: HealthStatus;
  metrics: MetricHealth[];
} {
  const metrics: MetricHealth[] = [];

  // Cycle Time
  const ct = kpis.cycleTime?.numericValue ?? 0;
  const ctOk = ct <= 15;
  metrics.push({ label: "Cycle Time P85", value: `${ct}d`, status: ctOk ? "green" : "red" });

  // Transbordo (squads sprint only)
  const spillLabel = kpis.spilloverOrWip?.label || "Transbordo";
  const spillVal = kpis.spilloverOrWip?.numericValue ?? 0;
  const isWipLabel = spillLabel.includes("WIP");
  if (!isWipLabel) {
    const spillOk = spillVal <= 20;
    metrics.push({ label: "Transbordo", value: `${spillVal}%`, status: spillOk ? "green" : "red" });
  }

  // Eficiência de Fluxo
  const eff = kpis.flowEfficiency?.numericValue ?? 0;
  const effOk = eff >= 60;
  metrics.push({ label: "Eficiência de Fluxo", value: `${eff}%`, status: effOk ? "green" : "red" });

  // Ocupação
  const occ = kpis.occupation?.numericValue ?? 0;
  const occOk = occ >= 80;
  metrics.push({ label: "Ocupação", value: `${occ}%`, status: occOk ? "green" : "red" });

  // WIP Aging (>10d)
  const wip = kpis.wipAging?.numericValue ?? (isWipLabel ? spillVal : 0);
  const wipOk = wip <= 7;
  metrics.push({ label: "WIP Aging (>10d)", value: `${wip}%`, status: wipOk ? "green" : "red" });

  // Bugs (meta: ≤ 1 item)
  const bugsOk = bugCount <= 1;
  metrics.push({ label: "Bugs", value: `${bugCount} itens`, status: bugsOk ? "green" : "red" });

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

    // Passar o filtro padrão de issue types (mesmo da dashboard)
    const defaultTypes = ["História", "Bug", "Task", "Tech Debt"];
    const params = new URLSearchParams({ issueType: defaultTypes.join(",") });

    fetch(`/api/metrics/${squad.slug}?${params.toString()}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.json();
      })
      .then((data) => {
        if (data.kpis) {
          // Contar bugs do último período (bugsQuality)
          const lastPeriodBugs = data.bugsQuality?.length > 0
            ? data.bugsQuality[data.bugsQuality.length - 1]?.bugs ?? 0
            : 0;
          const result = evaluateMetrics(data.kpis, lastPeriodBugs);
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
      className={`group relative rounded-xl border-2 ${BORDER_COLORS[health]} bg-white/5 p-4 transition hover:bg-white/10`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-bold text-white group-hover:text-indigo-300">
          {squad.name}
        </h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase ${
            squad.methodology === "sprint"
              ? "bg-indigo-500/15 text-indigo-300"
              : "bg-amber-500/15 text-amber-300"
          }`}
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
                className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${
                  m.status === "green" ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              <span className="text-[11px] text-white">
                {m.label}: <strong>{m.value}</strong>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          <div className="h-2.5 w-3/4 rounded bg-white/5 animate-pulse" />
          <div className="h-2.5 w-2/3 rounded bg-white/5 animate-pulse" />
          <div className="h-2.5 w-1/2 rounded bg-white/5 animate-pulse" />
        </div>
      )}
    </Link>
  );
}
