import { StatusTransition } from "@/services/jira-changelog";
import { CYCLE_TIME_START_STATUSES, CYCLE_TIME_END_STATUSES } from "@/config/status-mapping";
import { calculateP85 } from "./percentile";
import { calendarDaysBetween } from "@/lib/utils";

/**
 * Resultado do Cycle Time para uma issue individual.
 */
export interface IssueCycleTime {
  key: string;
  days: number;
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
}

/**
 * Resultado do Cycle Time P85 para um período.
 */
export interface CycleTimePeriodResult {
  p85: number | null; // null se não houver amostra
  issueCount: number;
  issues: IssueCycleTime[];
}

/**
 * Calcula o Cycle Time de uma issue individual a partir do changelog.
 *
 * Regras:
 * - Ponto de partida: PRIMEIRA transição PARA "To Do" / "Pendente" / "A Fazer"
 * - Ponto de chegada: ÚLTIMA transição PARA "Concluído" / "Done"
 * - Unidade: dias corridos (calendário)
 * - CT = 0 é válido (concluído no mesmo dia que entrou em To Do)
 * - Retorna null se não encontrar transições válidas
 */
export function calculateIssueCycleTime(
  issueKey: string,
  transitions: StatusTransition[]
): IssueCycleTime | null {
  if (transitions.length === 0) return null;

  // Encontrar PRIMEIRA transição para status de início (To Do, Pendente, A Fazer)
  let startDate: string | null = null;
  for (const t of transitions) {
    if (CYCLE_TIME_START_STATUSES.has(t.toStatus)) {
      startDate = t.timestamp;
      break; // Primeira ocorrência
    }
  }

  // Encontrar ÚLTIMA transição para status de conclusão (Concluído, Done)
  let endDate: string | null = null;
  for (let i = transitions.length - 1; i >= 0; i--) {
    if (CYCLE_TIME_END_STATUSES.has(transitions[i].toStatus)) {
      endDate = transitions[i].timestamp;
      break; // Última ocorrência (iterando de trás para frente)
    }
  }

  // Se não encontrou ambos os pontos, não é possível calcular
  if (!startDate || !endDate) return null;

  // Calcular dias corridos
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = calendarDaysBetween(start, end);

  return {
    key: issueKey,
    days: Math.max(0, days), // CT nunca negativo
    startDate,
    endDate,
  };
}

/**
 * Calcula o P85 do Cycle Time para um conjunto de issues com seus changelogs.
 *
 * Regras:
 * - Inclui CT = 0 no cálculo
 * - Exclui issues sem transições válidas (retorno null de calculateIssueCycleTime)
 * - P85 calculado com PERCENTILE.INC + CEILING
 */
export function calculateCycleTimeP85(
  issuesWithChangelogs: { key: string; transitions: StatusTransition[] }[]
): CycleTimePeriodResult {
  const validIssues: IssueCycleTime[] = [];

  for (const issue of issuesWithChangelogs) {
    const ct = calculateIssueCycleTime(issue.key, issue.transitions);
    if (ct !== null) {
      validIssues.push(ct);
    }
  }

  if (validIssues.length === 0) {
    return { p85: null, issueCount: 0, issues: [] };
  }

  const days = validIssues.map((i) => i.days);
  const p85 = calculateP85(days);

  return {
    p85,
    issueCount: validIssues.length,
    issues: validIssues,
  };
}

/**
 * Identifica outliers que impactam significativamente o P85.
 * Retorna texto explicativo para stakeholders.
 */
export function generateCycleTimeNote(
  issues: IssueCycleTime[],
  p85: number
): string | undefined {
  if (issues.length < 3) return undefined;

  // Encontrar issues com CT > 2× a mediana
  const sorted = [...issues].sort((a, b) => a.days - b.days);
  const medianIdx = Math.floor(sorted.length / 2);
  const median = sorted[medianIdx].days;

  const outliers = issues.filter((i) => i.days > median * 2 && i.days > 30);

  if (outliers.length === 0) return undefined;

  const topOutliers = outliers
    .sort((a, b) => b.days - a.days)
    .slice(0, 3);

  const outlierText = topOutliers
    .map((o) => `${o.key}: ${o.days}d`)
    .join(", ");

  // Calcular P85 hipotético sem outliers
  const withoutOutliers = issues
    .filter((i) => !topOutliers.find((o) => o.key === i.key))
    .map((i) => i.days);

  const hypotheticalP85 = calculateP85(withoutOutliers);

  if (hypotheticalP85 && hypotheticalP85 < p85 * 0.7) {
    return `Cards legados com aging elevado (${outlierText}) impactam significativamente o P85. Sem esses outliers, P85 cairia para ~${hypotheticalP85}d.`;
  }

  return undefined;
}
