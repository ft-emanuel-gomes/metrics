import { getJiraClient } from "./jira-client";
import { getCacheManager } from "@/cache/cache-manager";
import { CACHE_TTLS } from "@/config/jira";

/**
 * Modelo interno de sprint
 */
export interface SprintData {
  id: number;
  name: string;
  state: "closed" | "active" | "future";
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  completeDate?: string; // ISO 8601
}

/**
 * Resposta da API Agile para sprints
 */
interface JiraSprintsResponse {
  maxResults: number;
  startAt: number;
  isLast: boolean;
  values: JiraRawSprint[];
}

interface JiraRawSprint {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
  completeDate?: string;
}

/**
 * Busca sprints concluídas de um board.
 * Retorna ordenadas por data de conclusão (mais recente primeiro).
 * Resultado cacheado por 6 horas.
 *
 * @param boardId - ID do board no Jira
 * @param limit - Quantidade máxima de sprints a retornar (default: 10)
 */
export async function fetchClosedSprints(
  boardId: number,
  limit: number = 10
): Promise<SprintData[]> {
  const cache = getCacheManager();
  const cacheKey = `sprints:${boardId}`;

  // Verificar cache
  const cached = cache.get<SprintData[]>(cacheKey);
  if (cached) return cached.slice(0, limit);

  const client = getJiraClient();
  const allSprints: SprintData[] = [];
  let startAt = 0;
  let isLast = false;

  do {
    const response = await client.get<JiraSprintsResponse>(
      `/rest/agile/1.0/board/${boardId}/sprint`,
      { state: "closed", startAt, maxResults: 50 }
    );

    isLast = response.isLast;

    for (const raw of response.values) {
      if (raw.state === "closed" && raw.startDate && raw.endDate) {
        allSprints.push({
          id: raw.id,
          name: raw.name,
          state: "closed",
          startDate: raw.startDate,
          endDate: raw.endDate,
          completeDate: raw.completeDate,
        });
      }
    }

    startAt += 50;
  } while (!isLast);

  // Ordenar por data de conclusão (mais recente primeiro)
  allSprints.sort((a, b) => {
    const dateA = new Date(a.completeDate || a.endDate).getTime();
    const dateB = new Date(b.completeDate || b.endDate).getTime();
    return dateB - dateA;
  });

  // Salvar no cache
  cache.set(cacheKey, allSprints, CACHE_TTLS.sprints);

  return allSprints.slice(0, limit);
}

/**
 * Busca a sprint ativa de um board.
 * Retorna null se nenhuma sprint ativa.
 */
export async function fetchActiveSprint(boardId: number): Promise<SprintData | null> {
  const client = getJiraClient();

  try {
    const response = await client.get<JiraSprintsResponse>(
      `/rest/agile/1.0/board/${boardId}/sprint`,
      { state: "active", maxResults: 1 }
    );

    if (response.values.length === 0) return null;

    const raw = response.values[0];
    return {
      id: raw.id,
      name: raw.name,
      state: "active",
      startDate: raw.startDate || new Date().toISOString(),
      endDate: raw.endDate || new Date().toISOString(),
      completeDate: raw.completeDate,
    };
  } catch {
    return null;
  }
}

/**
 * Busca as últimas N sprints concluídas para uma squad.
 * Converte para o formato Period usado nos adapters.
 */
export async function getLatestSprints(
  boardId: number,
  count: number = 3
): Promise<SprintData[]> {
  const sprints = await fetchClosedSprints(boardId, count);
  // Inverter para ter ordem cronológica (antiga → recente)
  return sprints.reverse();
}
