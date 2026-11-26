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
 * Busca TODAS as sprints do board (closed, active e future) que tenham datas.
 * Usado pelo Calendário da Release. Cacheado junto com os demais dados de sprint.
 */
export async function fetchAllSprints(boardId: number, options: { fresh?: boolean } = {}): Promise<SprintData[]> {
  const cache = getCacheManager();
  const cacheKey = `sprints-all:${boardId}`;
  // fresh = ignora o cache (o calendário precisa do estado atual da sprint no Jira)
  const cached = options.fresh ? undefined : cache.get<SprintData[]>(cacheKey);
  if (cached) return cached;

  const client = getJiraClient();
  const all: SprintData[] = [];
  let startAt = 0;
  let isLast = false;

  do {
    const response = await client.get<JiraSprintsResponse>(
      `/rest/agile/1.0/board/${boardId}/sprint`,
      { state: "active,closed,future", startAt, maxResults: 50 }
    );
    isLast = response.isLast;
    for (const raw of response.values) {
      if (!raw.startDate || !raw.endDate) continue;
      all.push({
        id: raw.id,
        name: raw.name,
        state: raw.state as SprintData["state"],
        startDate: raw.startDate,
        endDate: raw.endDate,
        completeDate: raw.completeDate,
      });
    }
    startAt += 50;
  } while (!isLast);

  cache.set(cacheKey, all, CACHE_TTLS.sprints);
  return all;
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

/**
 * Sprint ainda aberta no Jira (ativa ou futura), cujas datas podem não existir (sprint em planejamento).
 */
export interface OpenSprint {
  id: number;
  name: string;
  state: "active" | "future";
  startDate?: string;
  endDate?: string;
}

/**
 * Sprint cuja Capacidade (pessoas e dias úteis) pode ser ajustada: a VIGENTE; só quando não há vigente
 * (a anterior foi encerrada), a PRÓXIMA, que costuma estar em planejamento e por isso pode não ter datas.
 * Sempre direto no Jira (sem cache). Retorna null se não houver sprint ativa nem futura, ou se o Jira falhar.
 */
export async function fetchEditableSprint(boardId: number): Promise<OpenSprint | null> {
  const client = getJiraClient();
  try {
    const open: OpenSprint[] = [];
    let startAt = 0;
    let isLast = false;
    do {
      const response = await client.get<JiraSprintsResponse>(
        `/rest/agile/1.0/board/${boardId}/sprint`,
        { state: "active,future", startAt, maxResults: 50 }
      );
      isLast = response.isLast;
      for (const raw of response.values) {
        if (raw.state !== "active" && raw.state !== "future") continue;
        open.push({ id: raw.id, name: raw.name, state: raw.state, startDate: raw.startDate, endDate: raw.endDate });
      }
      startAt += 50;
    } while (!isLast);

    const active = open.find((s) => s.state === "active");
    if (active) return active;
    // Próxima: a de início mais cedo; sem datas, a de menor id (criada primeiro)
    return (
      open
        .filter((s) => s.state === "future")
        .sort((a, b) => {
          const sa = a.startDate ? new Date(a.startDate).getTime() : Number.POSITIVE_INFINITY;
          const sb = b.startDate ? new Date(b.startDate).getTime() : Number.POSITIVE_INFINITY;
          return sa !== sb ? sa - sb : a.id - b.id;
        })[0] ?? null
    );
  } catch {
    return null;
  }
}

/**
 * PRÓXIMA sprint do board (para o Backlog estimado): com sprint vigente, a futura de início mais cedo;
 * sem vigente, a própria futura de início mais cedo (a que vai começar). Sprint em planejamento pode não ter datas
 * (aí vale a de menor id). Sempre direto no Jira. Retorna null se não houver sprint futura ou se o Jira falhar.
 */
export async function fetchNextSprint(boardId: number): Promise<OpenSprint | null> {
  const client = getJiraClient();
  try {
    const future: OpenSprint[] = [];
    let startAt = 0;
    let isLast = false;
    do {
      const response = await client.get<JiraSprintsResponse>(`/rest/agile/1.0/board/${boardId}/sprint`, { state: "future", startAt, maxResults: 50 });
      isLast = response.isLast;
      for (const raw of response.values) {
        if (raw.state === "future") future.push({ id: raw.id, name: raw.name, state: "future", startDate: raw.startDate, endDate: raw.endDate });
      }
      startAt += 50;
    } while (!isLast);
    return (
      future.sort((a, b) => {
        const sa = a.startDate ? new Date(a.startDate).getTime() : Number.POSITIVE_INFINITY;
        const sb = b.startDate ? new Date(b.startDate).getTime() : Number.POSITIVE_INFINITY;
        return sa !== sb ? sa - sb : a.id - b.id;
      })[0] ?? null
    );
  } catch {
    return null;
  }
}
