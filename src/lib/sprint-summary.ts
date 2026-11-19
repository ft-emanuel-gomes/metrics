import type { PeriodMetrics } from "@/adapters/types";

/**
 * Resumo da Sprint: texto curto e automático, escrito por regras (sem IA) sobre os números da sprint.
 *
 * Regras de negócio:
 * - Período resumido = o último da seleção (a sprint concluída mais recente); a comparação é com o anterior.
 * - Metas = as mesmas do sinaleiro da home: Cycle Time P85 até 15 dias, Eficiência de Fluxo a partir de 70%,
 *   Ocupação a partir de 80%. Ocupação acima de 100% aparece como alerta na linha (planejou além da capacidade),
 *   mas só conta como meta fora abaixo de 80%, como no sinaleiro.
 * - Veredito = quantas dessas metas ficaram de fora (até 1 = no ritmo; 2 = atenção; 3 = abaixo do esperado).
 * - Sem entrega concluída, o veredito é "Sem entregas", seja qual for o restante.
 */

export const SUMMARY_GOALS = {
  cycleTimeDays: 15,
  flowEfficiencyPct: 70,
  occupationPct: 80,
} as const;

export type SummaryTone = "positive" | "alert" | "negative" | "neutral";

export interface SummaryLine {
  id: "entrega" | "prazo" | "transbordo" | "fluxo" | "ocupacao";
  label: string;
  text: string;
  tone: SummaryTone;
}

export interface SprintSummary {
  /** "Sprint 1" */
  periodLabel: string;
  /** "17/11 a 01/12" */
  periodRange: string;
  /** Período usado na comparação (o anterior da seleção) */
  comparedWith?: string;
  verdict: { badge: string; tone: SummaryTone };
  /** Frase de abertura (vai em destaque) */
  lead: string;
  /** Complemento da abertura */
  body: string;
  lines: SummaryLine[];
  /** Comprometidos x concluídos (só sprint) */
  progress?: { done: number; total: number; pct: number; spilled: number };
  /** Métrica mais distante da meta, com a distância */
  focus?: string;
  /** Linha de transparência: base dos dados */
  footnote: string;
}

const BRT_OFFSET_MS = 3 * 3_600_000;

function fmtDay(iso: string): string {
  const d = new Date(new Date(iso).getTime() - BRT_OFFSET_MS);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const cards = (n: number) => (n === 1 ? "1 card" : `${n} cards`);
const days = (n: number) => (n === 1 ? "1 dia" : `${n} dias`);
const joinList = (items: string[]) => (items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`);

export function buildSprintSummary(periodMetrics: PeriodMetrics[]): SprintSummary | null {
  const cur = periodMetrics[periodMetrics.length - 1];
  if (!cur) return null;
  const prev = periodMetrics.length > 1 ? periodMetrics[periodMetrics.length - 2] : null;
  const label = cur.period.label;

  const delivered = cur.throughput.total;
  const p85 = cur.cycleTime.p85;
  const eff = cur.flowEfficiency.issues.length > 0 ? Math.round(cur.flowEfficiency.efficiency) : null;
  const occ = cur.occupation.capacityHours > 0 ? cur.occupation : null;
  const occPct = occ ? Math.round(occ.percentage) : null;
  const spill = cur.spillover && cur.spillover.committed > 0 ? cur.spillover : null;

  const lines: SummaryLine[] = [];

  // Entrega (vazão)
  {
    let text = `${cards(delivered)} ${delivered === 1 ? "concluído" : "concluídos"}`;
    let tone: SummaryTone = "neutral";
    if (delivered === 0) tone = "negative";
    if (prev) {
      const d = delivered - prev.throughput.total;
      if (d > 0) { tone = delivered === 0 ? tone : "positive"; text += ` (${d} a mais que na ${prev.period.label})`; }
      else if (d < 0) { tone = delivered === 0 ? "negative" : "alert"; text += ` (${-d} a menos que na ${prev.period.label})`; }
      else text += ` (igual à ${prev.period.label})`;
    }
    lines.push({ id: "entrega", label: "Entrega", text, tone });
  }

  // Prazo (Cycle Time P85)
  if (p85 !== null) {
    const ok = p85 <= SUMMARY_GOALS.cycleTimeDays;
    lines.push({ id: "prazo", label: "Prazo", text: `85% dos cards fecharam em até ${days(p85)} (meta: até ${SUMMARY_GOALS.cycleTimeDays})`, tone: ok ? "positive" : "alert" });
  } else {
    lines.push({ id: "prazo", label: "Prazo", text: "Sem card concluído para medir o prazo", tone: "neutral" });
  }

  // Transbordo (só sprint)
  if (spill) {
    const before = prev?.spillover && prev.spillover.committed > 0 ? Math.round(prev.spillover.percentage) : null;
    const pct = Math.round(spill.percentage);
    if (spill.spilled === 0) {
      lines.push({ id: "transbordo", label: "Transbordo", text: `Nenhum dos ${cards(spill.committed)} comprometidos ficou para trás`, tone: "positive" });
    } else {
      const better = before !== null && pct < before;
      lines.push({
        id: "transbordo",
        label: "Transbordo",
        text: `${spill.spilled} de ${cards(spill.committed)} comprometidos não fecharam (${pct}%${before !== null ? `, antes ${before}%` : ""})`,
        tone: better ? "neutral" : "alert",
      });
    }
  }

  // Fluxo (eficiência)
  if (eff !== null) {
    lines.push({
      id: "fluxo",
      label: "Fluxo",
      text: `Os cards passam ${eff}% do tempo em trabalho ativo, o resto em fila (meta: ${SUMMARY_GOALS.flowEfficiencyPct}%)`,
      tone: eff >= SUMMARY_GOALS.flowEfficiencyPct ? "positive" : "alert",
    });
  }

  // Ocupação (planejado x capacidade)
  if (occ && occPct !== null) {
    const over = occPct > 100;
    const under = occPct < SUMMARY_GOALS.occupationPct;
    lines.push({
      id: "ocupacao",
      label: "Ocupação",
      text: `${occPct}% da capacidade planejada (${Math.round(occ.allocatedHours)}h de ${Math.round(occ.capacityHours)}h)${over ? ", acima da capacidade" : under ? `, abaixo da meta de ${SUMMARY_GOALS.occupationPct}%` : ""}`,
      tone: over || under ? "alert" : "positive",
    });
  }

  // Metas que ficaram de fora (as mesmas do sinaleiro da home)
  const missed: { name: string; gap: number; focus: string }[] = [];
  if (p85 !== null && p85 > SUMMARY_GOALS.cycleTimeDays) {
    missed.push({
      name: "prazo",
      gap: (p85 - SUMMARY_GOALS.cycleTimeDays) / SUMMARY_GOALS.cycleTimeDays,
      focus: `prazo. O P85 está ${days(p85 - SUMMARY_GOALS.cycleTimeDays)} acima da meta de ${SUMMARY_GOALS.cycleTimeDays}.`,
    });
  }
  if (eff !== null && eff < SUMMARY_GOALS.flowEfficiencyPct) {
    missed.push({
      name: "fluxo",
      gap: (SUMMARY_GOALS.flowEfficiencyPct - eff) / SUMMARY_GOALS.flowEfficiencyPct,
      focus: `fluxo. Faltam ${SUMMARY_GOALS.flowEfficiencyPct - eff} p.p. para a meta de ${SUMMARY_GOALS.flowEfficiencyPct}%.`,
    });
  }
  if (occ && occPct !== null && occPct < SUMMARY_GOALS.occupationPct) {
    missed.push({
      name: "ocupação",
      gap: (SUMMARY_GOALS.occupationPct - occPct) / SUMMARY_GOALS.occupationPct,
      focus: `ocupação. Faltam ${SUMMARY_GOALS.occupationPct - occPct} p.p. para a meta de ${SUMMARY_GOALS.occupationPct}%.`,
    });
  }
  const evaluated = [p85 !== null, eff !== null, occ !== null].filter(Boolean).length;

  // Abertura e veredito
  let verdict: SprintSummary["verdict"];
  let lead: string;
  let body: string;
  if (delivered === 0) {
    verdict = { badge: "Sem entregas", tone: "negative" };
    lead = `Nenhuma entrega concluída na ${label}.`;
    body = spill ? `${cards(spill.committed)} comprometidos seguem abertos.` : "";
  } else {
    lead = `A ${label} entregou ${cards(delivered)}.`;
    if (missed.length === 0) {
      verdict = { badge: "No ritmo", tone: "positive" };
      body = evaluated > 0 ? "Prazo, fluxo e ocupação dentro das metas." : "";
    } else {
      body = `Fora da meta: ${joinList(missed.map((m) => m.name))}.`;
      verdict = missed.length === 1 ? { badge: "No ritmo", tone: "positive" } : missed.length === 2 ? { badge: "Atenção", tone: "alert" } : { badge: "Abaixo do esperado", tone: "negative" };
    }
  }

  const worst = [...missed].sort((a, b) => b.gap - a.gap)[0];
  const range = `${fmtDay(cur.period.startDate)} a ${fmtDay(cur.period.endDate)}`;

  return {
    periodLabel: label,
    periodRange: range,
    comparedWith: prev?.period.label,
    verdict,
    lead,
    body,
    lines,
    progress: spill
      ? {
          done: spill.committed - spill.spilled,
          total: spill.committed,
          pct: Math.round(((spill.committed - spill.spilled) / spill.committed) * 100),
          spilled: spill.spilled,
        }
      : undefined,
    focus: worst ? `Olhar primeiro: ${worst.focus}` : undefined,
    footnote: `Base: ${label} (${range})${prev ? `, comparada com a ${prev.period.label}` : ""}.`,
  };
}
