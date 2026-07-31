import { getJiraClient } from "./jira-client";
import { getCacheManager } from "@/cache/cache-manager";
import { CACHE_TTLS } from "@/config/jira";

/**
 * Transição de status extraída do changelog de uma issue.
 */
export interface StatusTransition {
  timestamp: string; // ISO 8601
  fromStatus: string;
  toStatus: string;
}

/**
 * Resposta da API de changelog do Jira
 */
interface JiraChangelogResponse {
  startAt: number;
  maxResults: number;
  total: number;
  values: JiraChangelogEntry[];
}

interface JiraChangelogEntry {
  created: string;
  items: {
    field: string;
    fromString: string | null;
    toString: string | null;
  }[];
}

/**
 * Busca o changelog de uma issue e retorna apenas as transições de status.
 * Resultado é cacheado por 1 hora (changelogs mudam raramente para issues concluídas).
 */
export async function fetchChangelog(issueKey: string): Promise<StatusTransition[]> {
  const cache = getCacheManager();
  const cacheKey = `changelog:${issueKey}`;

  // Verificar cache
  const cached = cache.get<StatusTransition[]>(cacheKey);
  if (cached) return cached;

  const client = getJiraClient();
  const allTransitions: StatusTransition[] = [];
  let startAt = 0;
  const maxResults = 100;
  let total = 0;

  do {
    const response = await client.get<JiraChangelogResponse>(
      `/rest/api/3/issue/${issueKey}/changelog`,
      { startAt: startAt.toString(), maxResults: maxResults.toString() }
    );

    total = response.total;

    for (const entry of response.values) {
      for (const item of entry.items) {
        // Filtrar APENAS transições de campo "status"
        if (item.field === "status" && item.fromString && item.toString) {
          allTransitions.push({
            timestamp: entry.created,
            fromStatus: item.fromString,
            toStatus: item.toString,
          });
        }
      }
    }

    startAt += maxResults;
  } while (startAt < total);

  // Ordenar por timestamp (mais antigo primeiro)
  allTransitions.sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Salvar no cache
  cache.set(cacheKey, allTransitions, CACHE_TTLS.changelog);

  return allTransitions;
}

/**
 * Busca changelogs de múltiplas issues em paralelo (respeitando o semáforo do JiraClient).
 * Retorna um Map de issueKey → transições.
 */
export async function fetchChangelogsBatch(
  issueKeys: string[]
): Promise<Map<string, StatusTransition[]>> {
  const results = new Map<string, StatusTransition[]>();

  // Executa em paralelo (JiraClient já limita a 5 simultâneas via semáforo)
  const promises = issueKeys.map(async (key) => {
    const transitions = await fetchChangelog(key);
    results.set(key, transitions);
  });

  await Promise.all(promises);

  return results;
}
