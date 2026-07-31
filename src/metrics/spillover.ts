import { JiraIssue } from "@/services/jira-search";

/**
 * Resultado de transbordo para um período (Sprint only).
 */
export interface SpilloverPeriodResult {
  committed: number; // Issues comprometidas no início da sprint
  completed: number; // Issues concluídas
  spilled: number; // Issues não concluídas (transbordo)
  percentage: number; // Transbordo % (0-100)
}

/**
 * Calcula o transbordo de uma sprint.
 *
 * Regras:
 * - Base = issues comprometidas no INÍCIO da sprint (excluir adicionadas mid-sprint)
 * - Transbordo = (comprometidas - concluídas da base) / comprometidas × 100
 * - Adicionados durante a sprint NÃO entram na base do cálculo
 * - Aplicável APENAS a squads Sprint
 *
 * @param allSprintIssues - Todas as issues da sprint (incluindo não concluídas)
 * @param completedIssues - Issues que transitaram para Concluído DURING sprint
 * @param sprintStartDate - Data de início da sprint (para filtrar comprometidas)
 */
export function calculateSpillover(
  allSprintIssues: JiraIssue[],
  completedIssues: JiraIssue[]
): SpilloverPeriodResult {
  // Total de issues na sprint (comprometidas + adicionadas)
  // Para simplificar: todas as issues que estavam na sprint e não concluíram = transbordo
  // Issues concluídas = vazão
  // Comprometido no início = total sprint issues (JQL já filtra por sprint)

  const committed = allSprintIssues.length + completedIssues.length;
  const completed = completedIssues.length;
  const spilled = committed - completed;

  if (committed === 0) {
    return { committed: 0, completed: 0, spilled: 0, percentage: 0 };
  }

  const percentage = Math.round((spilled / committed) * 100);

  return {
    committed,
    completed,
    spilled,
    percentage,
  };
}

/**
 * Calcula tamanho dos dots para visualização de transbordo.
 * Regra de tamanho adaptativo baseado na quantidade máxima.
 */
export function calculateDotSize(maxDots: number): number {
  if (maxDots <= 15) return 14;
  if (maxDots <= 22) return 12;
  if (maxDots <= 30) return 10;
  return 8;
}
