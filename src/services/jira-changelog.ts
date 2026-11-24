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

/** Cache curto: a bandeira muda a qualquer hora e o WIP é tempo real. */
const FLAGGED_CACHE_TTL = 300;

/**
 * Desde quando o card está com o impedimento (Flagged) ativo.
 * Regra de negócio: a contagem começa na ÚLTIMA vez em que a bandeira foi colocada e segue ligada até agora.
 * Se a bandeira foi tirada e recolocada, conta só a partir da recolocação. Sem bandeira ativa: null.
 */
export async function fetchFlaggedSince(issueKey: string): Promise<string | null> {
  const cache = getCacheManager();
  const cacheKey = `flagged-since:${issueKey}`;
  const cached = cache.get<{ since: string | null }>(cacheKey);
  if (cached) return cached.since;

  const client = getJiraClient();
  const events: { at: string; set: boolean }[] = [];
  let startAt = 0;
  let total = 0;
  do {
    const response = await client.get<JiraChangelogResponse>(`/rest/api/3/issue/${issueKey}/changelog`, {
      startAt: startAt.toString(),
      maxResults: "100",
    });
    total = response.total;
    for (const entry of response.values) {
      for (const item of entry.items) {
        // No changelog o campo aparece como "Flagged"; valor preenchido = bandeira colocada, vazio = removida
        if (item.field === "Flagged") events.push({ at: entry.created, set: !!item.toString && item.toString.trim() !== "" });
      }
    }
    startAt += 100;
  } while (startAt < total);

  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  let since: string | null = null;
  for (const e of events) {
    if (e.set) since = since ?? e.at;
    else since = null;
  }
  cache.set(cacheKey, { since }, FLAGGED_CACHE_TTL);
  return since;
}

/** "Bloqueado desde" dos cards marcados com impedimento (chave → ISO). Cards sem bandeira não são consultados. */
export async function fetchFlaggedSinceBatch(issues: { key: string; flagged?: boolean }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    issues
      .filter((i) => i.flagged === true)
      .map(async (i) => {
        try {
          const since = await fetchFlaggedSince(i.key);
          if (since) out.set(i.key, since);
        } catch {
          // Sem o histórico, o card segue marcado como bloqueado, só sem o tempo
        }
      })
  );
  return out;
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

/**
 * Busca a data em que cada issue foi adicionada a uma sprint específica.
 * Retorna Map de issueKey → timestamp ISO (ou null se não encontrou no changelog).
 * Usado para filtrar transbordo (excluir itens adicionados mid-sprint).
 */
export async function fetchSprintAdditionDates(
  issueKeys: string[],
  sprintId: number
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();
  const client = getJiraClient();

  const promises = issueKeys.map(async (key) => {
    try {
      let startAt = 0;
      let foundDate: string | null = null;

      // Percorrer todo o changelog buscando campo "Sprint"
      while (true) {
        const response = await client.get<JiraChangelogResponse>(
          `/rest/api/3/issue/${key}/changelog`,
          { startAt, maxResults: 100 }
        );

        for (const entry of response.values) {
          for (const item of entry.items) {
            if (item.field === "Sprint" && item.toString) {
              // Usar regex com word boundary para evitar falso positivo (ex: ID 10 vs 100)
              const idPattern = new RegExp(`\\b${sprintId}\\b`);
              if (idPattern.test(item.toString)) {
                // Encontrou a adição a esta sprint
                foundDate = entry.created;
              }
            }
          }
        }

        if (startAt + response.maxResults >= response.total) break;
        startAt += response.maxResults;
      }

      results.set(key, foundDate);
    } catch {
      results.set(key, null);
    }
  });

  await Promise.all(promises);
  return results;
}
