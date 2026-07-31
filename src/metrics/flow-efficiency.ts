import { StatusTransition } from "@/services/jira-changelog";
import { ACTIVE_STATES, WAIT_STATES } from "@/config/status-mapping";

/**
 * Resultado de eficiência de fluxo para uma issue individual.
 */
export interface IssueFlowEfficiency {
  key: string;
  efficiency: number; // 0-100
  activeTimeMs: number;
  waitTimeMs: number;
}

/**
 * Resultado de eficiência de fluxo para um período.
 */
export interface FlowEfficiencyPeriodResult {
  efficiency: number; // Média do período (0-100)
  issues: IssueFlowEfficiency[];
}

/**
 * Resultado consolidado com identificação de gargalo.
 */
export interface FlowEfficiencyResult {
  periods: {
    periodLabel: string;
    efficiency: number;
  }[];
  bottleneck?: {
    title: string;
    description: string;
  };
}

/**
 * Calcula a eficiência de fluxo de uma issue individual.
 *
 * Eficiência = tempo_em_estados_ativos / (tempo_ativos + tempo_espera) × 100
 *
 * Estados ATIVOS (tempo produtivo): In Progress, Design Review, Test
 * Estados de ESPERA (tempo em fila): To Do, Code Review, Waiting for Test, Waiting for Delivery
 *
 * Percorre o changelog sequencialmente e soma o tempo gasto em cada categoria.
 */
export function calculateIssueFlowEfficiency(
  issueKey: string,
  transitions: StatusTransition[]
): IssueFlowEfficiency | null {
  if (transitions.length < 2) return null;

  let activeTimeMs = 0;
  let waitTimeMs = 0;

  // Percorrer transições sequencialmente
  for (let i = 0; i < transitions.length - 1; i++) {
    const current = transitions[i];
    const next = transitions[i + 1];

    const currentTime = new Date(current.timestamp).getTime();
    const nextTime = new Date(next.timestamp).getTime();
    const duration = nextTime - currentTime;

    if (duration <= 0) continue;

    const targetStatus = current.toStatus;

    if (ACTIVE_STATES.has(targetStatus)) {
      activeTimeMs += duration;
    } else if (WAIT_STATES.has(targetStatus)) {
      waitTimeMs += duration;
    }
    // Estados ignorados (Cancelado, Backlog, etc.) não somam em nenhum
  }

  // Para a última transição, considerar o tempo até agora se não for "done"
  // (para issues concluídas, a última transição É para Concluído, então não soma)
  const lastTransition = transitions[transitions.length - 1];
  if (ACTIVE_STATES.has(lastTransition.toStatus)) {
    // Se a última transição foi para um estado ativo e a issue está concluída,
    // não deveria chegar aqui (a última seria → Concluído)
    // Mas por segurança, não adicionamos tempo extra
  }

  const totalTime = activeTimeMs + waitTimeMs;
  if (totalTime === 0) return null;

  const efficiency = Math.round((activeTimeMs / totalTime) * 100);

  return {
    key: issueKey,
    efficiency,
    activeTimeMs,
    waitTimeMs,
  };
}

/**
 * Calcula a eficiência de fluxo média de um período.
 * Média das eficiências individuais de cada issue concluída.
 */
export function calculatePeriodFlowEfficiency(
  issuesWithChangelogs: { key: string; transitions: StatusTransition[] }[]
): FlowEfficiencyPeriodResult {
  const results: IssueFlowEfficiency[] = [];

  for (const issue of issuesWithChangelogs) {
    const eff = calculateIssueFlowEfficiency(issue.key, issue.transitions);
    if (eff !== null) {
      results.push(eff);
    }
  }

  if (results.length === 0) {
    return { efficiency: 0, issues: [] };
  }

  // Média das eficiências individuais
  const avgEfficiency = Math.round(
    results.reduce((sum, r) => sum + r.efficiency, 0) / results.length
  );

  return {
    efficiency: avgEfficiency,
    issues: results,
  };
}

/**
 * Detecta gargalo de fluxo com base nas eficiências por período.
 * Retorna descrição se eficiência média < 50%.
 */
export function detectBottleneck(
  periodsEfficiency: number[]
): { title: string; description: string } | undefined {
  if (periodsEfficiency.length === 0) return undefined;

  const avg =
    periodsEfficiency.reduce((sum, e) => sum + e, 0) / periodsEfficiency.length;

  if (avg >= 50) return undefined;

  return {
    title: "GARGALO IDENTIFICADO",
    description: `Waiting for Test e Waiting for Delivery concentram a maior parte do tempo em fila. Eficiência média de ${Math.round(avg)}% indica que os cards passam mais tempo aguardando do que sendo trabalhados. Reduzir WIP e priorizar desbloqueio de filas.`,
  };
}
