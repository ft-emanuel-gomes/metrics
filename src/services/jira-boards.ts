import { getJiraClient } from "./jira-client";
import { getCacheManager } from "@/cache/cache-manager";
import { CACHE_TTLS } from "@/config/jira";

/**
 * Resposta da API Agile para boards
 */
interface JiraBoardsResponse {
  maxResults: number;
  startAt: number;
  isLast: boolean;
  values: JiraRawBoard[];
}

interface JiraRawBoard {
  id: number;
  name: string;
  type: string; // "scrum" | "kanban" | "simple"
  location?: {
    projectKey?: string;
  };
}

/**
 * Descobre o board ID de um projeto.
 * Prioriza boards do tipo "scrum" para squads Sprint e "kanban" para squads Kanban.
 * Resultado cacheado por 24 horas.
 */
export async function findBoardByProject(
  projectKey: string,
  preferredType?: "scrum" | "kanban"
): Promise<number | null> {
  const cache = getCacheManager();
  const cacheKey = `board:${projectKey}`;

  // Verificar cache
  const cached = cache.get<number>(cacheKey);
  if (cached) return cached;

  const client = getJiraClient();
  let startAt = 0;
  let isLast = false;
  const allBoards: JiraRawBoard[] = [];

  do {
    const response = await client.get<JiraBoardsResponse>(
      "/rest/agile/1.0/board",
      { projectKeyOrId: projectKey, startAt, maxResults: 50 }
    );

    isLast = response.isLast;
    allBoards.push(...response.values);
    startAt += 50;
  } while (!isLast);

  if (allBoards.length === 0) return null;

  // Priorizar board pelo tipo preferido
  let board: JiraRawBoard | undefined;

  if (preferredType) {
    board = allBoards.find((b) => b.type === preferredType);
  }

  // Fallback: primeiro board encontrado
  if (!board) {
    board = allBoards[0];
  }

  // Salvar no cache
  cache.set(cacheKey, board.id, CACHE_TTLS.boards);

  return board.id;
}

/**
 * Busca worklogs de uma issue (para cálculo de ocupação).
 */
export interface WorklogEntry {
  timeSpentSeconds: number;
  started: string; // ISO 8601
  author: string;
}

interface JiraWorklogResponse {
  total: number;
  worklogs: {
    timeSpentSeconds: number;
    started: string;
    author: { displayName: string };
  }[];
}

/**
 * Busca worklogs de uma issue.
 */
export async function fetchIssueWorklogs(issueKey: string): Promise<WorklogEntry[]> {
  const client = getJiraClient();

  const response = await client.get<JiraWorklogResponse>(
    `/rest/api/3/issue/${issueKey}/worklog`
  );

  return response.worklogs.map((w) => ({
    timeSpentSeconds: w.timeSpentSeconds,
    started: w.started,
    author: w.author.displayName,
  }));
}

/**
 * Busca worklogs de múltiplas issues em batch.
 */
export async function fetchWorklogsBatch(
  issueKeys: string[]
): Promise<Map<string, WorklogEntry[]>> {
  const results = new Map<string, WorklogEntry[]>();

  const promises = issueKeys.map(async (key) => {
    const worklogs = await fetchIssueWorklogs(key);
    results.set(key, worklogs);
  });

  await Promise.all(promises);
  return results;
}
