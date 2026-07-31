/**
 * Utilitários de retenção de dados.
 * 
 * REGRA: Banco mantém dados de sprints concluídas nos últimos 90 dias.
 * O critério é a data de CONCLUSÃO da sprint (completeDate), não a criação da issue.
 * 
 * Exemplo (hoje = 21/07):
 * - Sprint 3 (completeDate: 28/04) → dentro da janela (21/04 é o cutoff) ✅
 * - Sprint 2 (completeDate: 16/04) → fora da janela ❌ → expurgada
 * - Se usuário seleciona Sprint 2 → fallback ao Jira com mensagem
 */

/** Janela de retenção em dias */
const RETENTION_DAYS = 90;

/**
 * Retorna a data limite da janela de retenção (hoje - 90 dias).
 * Sprints concluídas antes dessa data NÃO estão no banco.
 */
export function getRetentionCutoffDate(): Date {
  const date = new Date();
  date.setDate(date.getDate() - RETENTION_DAYS);
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Verifica se uma sprint está dentro da janela de retenção.
 * Usa a completeDate (ou endDate como fallback) da sprint.
 * 
 * @param sprintCompleteDate - Data de conclusão da sprint (ISO 8601)
 */
export function isSprintWithinRetention(sprintCompleteDate: string): boolean {
  const cutoff = getRetentionCutoffDate();
  const completeDate = new Date(sprintCompleteDate);
  return completeDate >= cutoff;
}

/**
 * Verifica se QUALQUER sprint selecionada está fora da janela de retenção.
 * Retorna true se precisa de fallback ao Jira para dados históricos.
 * 
 * @param sprintCompleteDates - Array de datas de conclusão das sprints selecionadas
 */
export function needsJiraFallback(sprintCompleteDates: string[]): boolean {
  const cutoff = getRetentionCutoffDate();
  return sprintCompleteDates.some((date) => new Date(date) < cutoff);
}

/**
 * Filtra sprints que estão FORA da janela de retenção (precisam de fallback).
 */
export function getSprintsOutsideRetention(
  sprints: { id: number; completeDate?: string; endDate: string }[]
): number[] {
  const cutoff = getRetentionCutoffDate();
  return sprints
    .filter((s) => {
      const date = new Date(s.completeDate || s.endDate);
      return date < cutoff;
    })
    .map((s) => s.id);
}

/**
 * Retorna a data formatada do cutoff para exibição.
 */
export function getRetentionCutoffFormatted(): string {
  const d = getRetentionCutoffDate();
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
