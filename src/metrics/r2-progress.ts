import { JiraIssue } from "@/services/jira-search";
import { CYCLE_TIME_END_STATUSES } from "@/config/status-mapping";

/**
 * Contagem por status de itens R2.
 */
export interface R2ItemCount {
  total: number;
  done: number;
  inProgress: number;
  pending: number;
}

/**
 * Resultado completo de progresso R2.
 */
export interface R2ProgressResult {
  epics: R2ItemCount;
  features: R2ItemCount;
  releaseName: string;
  deadline: string;
  riskInsight?: string;
}

/**
 * Status que indicam "Em Andamento" para itens R2.
 */
const IN_PROGRESS_STATUSES = new Set([
  "In Progress",
  "Em Progresso",
  "Em Desenvolvimento",
  "Design Review",
  "Code Review",
  "Test",
  "Em Teste",
  "Waiting for Test",
  "Waiting for Delivery",
]);

/**
 * Categoriza issues R2 em Concluído / Em Andamento / Pendente.
 *
 * Regras:
 * - Concluído: status atual é "Concluído", "Done", "Closed", "Finalizado"
 * - Em Andamento: status em qualquer estado de trabalho ativo ou espera
 * - Pendente: todos os demais (To Do, Backlog, etc.)
 * - NUNCA listar nomes individuais — apenas quantidades
 */
export function categorizeR2Items(issues: JiraIssue[]): R2ItemCount {
  let done = 0;
  let inProgress = 0;
  let pending = 0;

  for (const issue of issues) {
    if (CYCLE_TIME_END_STATUSES.has(issue.status)) {
      done++;
    } else if (IN_PROGRESS_STATUSES.has(issue.status)) {
      inProgress++;
    } else {
      pending++;
    }
  }

  return {
    total: issues.length,
    done,
    inProgress,
    pending,
  };
}

/**
 * Calcula progresso R2 completo (Épicos + Features).
 *
 * @param epics - Issues do tipo Épico filtradas para a squad
 * @param features - Issues do tipo Feature filtradas para a squad
 * @param deadline - Data limite do R2 (ISO 8601)
 */
export function calculateR2Progress(
  epics: JiraIssue[],
  features: JiraIssue[],
  deadline: string = "2026-07-31",
  releaseName: string = "R2"
): R2ProgressResult {
  const epicsCount = categorizeR2Items(epics);
  const featuresCount = categorizeR2Items(features);
  const riskInsight = generateR2RiskInsight(featuresCount, deadline);

  return {
    epics: epicsCount,
    features: featuresCount,
    releaseName,
    deadline,
    riskInsight,
  };
}

/**
 * Gera insight de risco para o progresso R2.
 * Verifica se o ritmo atual é suficiente para atingir o deadline.
 */
function generateR2RiskInsight(
  features: R2ItemCount,
  deadline: string
): string | undefined {
  if (features.total === 0) return undefined;

  const donePercentage = Math.round((features.done / features.total) * 100);
  const deadlineDate = new Date(deadline);
  const today = new Date();
  const daysRemaining = Math.max(
    0,
    Math.floor((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  );

  // Se menos de 50% concluído e menos de 30 dias restantes
  if (donePercentage < 50 && daysRemaining < 30) {
    const remaining = features.total - features.done;
    return `R2 deadline: ${formatDeadline(deadline)} — ${donePercentage}% Features concluídas. ${remaining} restantes com ${daysRemaining} dias. Ritmo precisa acelerar.`;
  }

  // Se muito pouco concluído em geral
  if (donePercentage < 30) {
    return `R2 deadline: ${formatDeadline(deadline)} — ${donePercentage}% Features concluídas. Ritmo precisa acelerar.`;
  }

  return undefined;
}

function formatDeadline(isoDate: string): string {
  // Parse diretamente do formato YYYY-MM-DD para evitar deslocamento de timezone
  const parts = isoDate.split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  // Fallback para parsing UTC se formato inesperado
  const d = new Date(isoDate);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}
