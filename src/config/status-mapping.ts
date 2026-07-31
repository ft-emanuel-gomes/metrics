/**
 * Mapeamento de status do Jira para categorias internas.
 * Usado nos cálculos de Eficiência de Fluxo e Cycle Time.
 *
 * Categorias:
 * - "active": tempo produtivo (conta para eficiência)
 * - "wait": tempo em fila (conta contra eficiência)
 * - "start": marca início do Cycle Time (To Do)
 * - "done": marca fim do Cycle Time (Concluído)
 * - "ignore": não entra em nenhum cálculo
 */
export type StatusCategory = "active" | "wait" | "start" | "done" | "ignore";

export const STATUS_MAPPING: Record<string, StatusCategory> = {
  // --- Estados ATIVOS (tempo produtivo) ---
  "In Progress": "active",
  "Em Progresso": "active",
  "Em Desenvolvimento": "active",
  "Design Review": "active",
  "Test": "active",
  "Em Teste": "active",
  "Testing": "active",

  // --- Estados de ESPERA (tempo em fila) ---
  "To Do": "start", // Também marca início do Cycle Time
  "A Fazer": "start",
  "Pendente": "start",
  "Code Review": "wait",
  "Revisão de Código": "wait",
  "Waiting for Test": "wait",
  "Aguardando Teste": "wait",
  "Waiting for Delivery": "wait",
  "Aguardando Implantação": "wait",
  "Aguardando Deploy": "wait",

  // --- Estados de CONCLUSÃO ---
  "Concluído": "done",
  "Done": "done",
  "Closed": "done",
  "Finalizado": "done",

  // --- Estados IGNORADOS ---
  "Cancelado": "ignore",
  "CANCELADO": "ignore",
  "Rejeitado": "ignore",
  "Lista de Pendências": "ignore",
  "Backlog": "ignore",
};

/**
 * Nomes de status que indicam início do Cycle Time
 * (primeira transição PARA um desses = ponto de partida)
 * Inclui "In Progress" como fallback quando não há "To Do"
 */
export const CYCLE_TIME_START_STATUSES = new Set([
  "To Do",
  "A Fazer",
  "Pendente",
  "In Progress",
  "Em Progresso",
  "Em Desenvolvimento",
]);

/**
 * Nomes de status que indicam fim do Cycle Time
 * (última transição PARA um desses = ponto de chegada)
 */
export const CYCLE_TIME_END_STATUSES = new Set([
  "Concluído",
  "Done",
  "Closed",
  "Finalizado",
]);

/**
 * Estados ativos para cálculo de Eficiência de Fluxo
 */
export const ACTIVE_STATES = new Set([
  "In Progress",
  "Em Progresso",
  "Em Desenvolvimento",
  "Design Review",
  "Test",
  "Em Teste",
  "Testing",
]);

/**
 * Estados de espera para cálculo de Eficiência de Fluxo
 * Inclui os estados "start" (To Do) que também contam como espera
 */
export const WAIT_STATES = new Set([
  "To Do",
  "A Fazer",
  "Pendente",
  "Code Review",
  "Revisão de Código",
  "Waiting for Test",
  "Aguardando Teste",
  "Waiting for Delivery",
  "Aguardando Implantação",
  "Aguardando Deploy",
]);

/**
 * Status que indicam que a issue está "em andamento" (WIP)
 * Usado para calcular WIP Aging em squads Kanban
 */
export const WIP_STATUSES = new Set([
  "In Progress",
  "Em Progresso",
  "Design Review",
  "Code Review",
  "Test",
  "Em Teste",
  "Waiting for Test",
  "Waiting for Delivery",
]);

/**
 * Tipos de issue válidos para métricas
 */
export const VALID_ISSUE_TYPES = [
  "História",
  "Story",
  "Bug",
  "Design",
  "Technical Debt",
  "Kaizen",
  "Task",
  "Spike",
];

/**
 * Status que excluem issues de todos os cálculos
 */
export const EXCLUDED_STATUSES = new Set([
  "Cancelado",
  "CANCELADO",
  "Rejeitado",
  "Lista de Pendências",
]);

/**
 * Determina a categoria de um status.
 * Retorna "wait" como fallback para status desconhecidos que não são done/ignore.
 */
export function getStatusCategory(status: string): StatusCategory {
  return STATUS_MAPPING[status] ?? "wait";
}
