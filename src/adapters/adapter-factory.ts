/**
 * Adapter factory — seleciona o adapter correto (Jira-direto ou DB-backed)
 * com base na env var USE_DATABASE_METRICS e na metodologia da squad.
 *
 * Garante exclusividade de fonte de dados: ou TODOS os dados vêm do Jira
 * ou TODOS vêm do banco local. Nunca há mixing dentro de uma computação.
 *
 * Requirements: 11.5, 6.1, 7.1
 */

import { fetchSprintDashboard } from "./sprint-adapter";
import { fetchKanbanDashboard } from "./kanban-adapter";
import { fetchSprintDashboardFromDb } from "./sprint-adapter-db";
import { fetchKanbanDashboardFromDb } from "./kanban-adapter-db";
import type { SquadConfig } from "@/config/squads";
import type { DashboardData } from "./types";

/**
 * Tipo para sprint adapters (Jira-direto e DB-backed).
 */
export type SprintDashboardAdapter = (
  squad: SquadConfig,
  requestedSprintIds?: number[],
  issueTypeFilter?: string[]
) => Promise<DashboardData>;

/**
 * Tipo para kanban adapters (Jira-direto e DB-backed).
 * Unifica as assinaturas dos dois adapters kanban.
 */
export type KanbanDashboardAdapter = (
  squad: SquadConfig,
  ...args: unknown[]
) => Promise<DashboardData>;

/**
 * Resultado do factory — função genérica que aceita squad + args variádicos.
 * Callers invocam com os argumentos específicos da metodologia.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DashboardAdapterFn = (squad: SquadConfig, ...args: any[]) => Promise<DashboardData>;

/**
 * Cria (seleciona) o adapter de dashboard apropriado para a squad informada.
 *
 * Lógica de seleção:
 * 1. Lê USE_DATABASE_METRICS env var — "true" = caminho DB, qualquer outro valor = Jira
 * 2. Seleciona sprint ou kanban com base em squad.methodology
 *
 * Isso garante zero mixing: todas as métricas de uma computação vêm
 * da mesma fonte (DB ou Jira), nunca parcialmente de cada.
 */
export function createDashboardAdapter(squad: SquadConfig): DashboardAdapterFn {
  const useDb = process.env.USE_DATABASE_METRICS === "true";

  if (useDb) {
    return squad.methodology === "sprint"
      ? fetchSprintDashboardFromDb
      : fetchKanbanDashboardFromDb;
  }

  return squad.methodology === "sprint"
    ? fetchSprintDashboard
    : fetchKanbanDashboard;
}
