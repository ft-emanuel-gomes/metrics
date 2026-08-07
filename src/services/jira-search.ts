import { getJiraClient } from "./jira-client";
import { getCacheManager } from "@/cache/cache-manager";
import { CACHE_TTLS } from "@/config/jira";
import { hashString } from "@/lib/utils";

/**
 * Modelo interno de issue do Jira
 */
export interface JiraIssue {
  key: string;
  summary: string;
  issueType: string;
  status: string;
  created: string;
  resolutionDate?: string;
}

/**
 * Resposta da API de search do Jira (nova API /search/jql)
 */
interface JiraSearchResponse {
  issues: JiraRawIssue[];
  nextPageToken?: string;
  isLast?: boolean;
  total?: number;
}

interface JiraRawIssue {
  key: string;
  fields: {
    summary: string;
    issuetype: { name: string };
    status: { name: string };
    created: string;
    resolutiondate?: string;
  };
  changelog?: {
    histories: {
      created: string;
      items: { field: string; fromString: string | null; toString: string | null }[];
    }[];
  };
}

/**
 * Executa uma JQL com paginação automática (usa nextPageToken).
 * Nova API: POST /rest/api/3/search/jql
 */
export async function searchIssues(
  jql: string,
  fields: string[] = ["summary", "status", "issuetype", "created", "resolutiondate"]
): Promise<JiraIssue[]> {
  const cache = getCacheManager();
  const cacheKey = `issues:${hashString(jql)}`;

  // Verificar cache
  const cached = cache.get<JiraIssue[]>(cacheKey);
  if (cached) return cached;

  const client = getJiraClient();
  const allIssues: JiraIssue[] = [];
  let nextPageToken: string | undefined = undefined;
  let hasMore = true;

  do {
    const body: Record<string, unknown> = {
      jql,
      fields,
      maxResults: 100,
    };
    if (nextPageToken) {
      body.nextPageToken = nextPageToken;
    }

    const response = await client.post<JiraSearchResponse>(
      "/rest/api/3/search/jql",
      body
    );

    const mapped = response.issues.map(mapRawIssue);
    allIssues.push(...mapped);

    nextPageToken = response.nextPageToken;
    hasMore = !response.isLast && !!nextPageToken;
  } while (hasMore);

  // Salvar no cache
  cache.set(cacheKey, allIssues, CACHE_TTLS.issues);

  return allIssues;
}

/**
 * Busca issues concluídas em um período (sprint ou janela temporal).
 * Aplica filtros padrão: tipos válidos, exclui cancelados.
 */
export async function fetchCompletedIssues(
  project: string,
  sprintId: number | null,
  startDate: string,
  endDate: string
): Promise<JiraIssue[]> {
  const sprintClause = sprintId ? `AND sprint = ${sprintId}` : "";

  // Jira DURING requer formato YYYY-MM-DD (sem horário)
  const start = startDate.split("T")[0];
  const end = endDate.split("T")[0];

  const jql = `
    project = "${project}"
    ${sprintClause}
    AND status CHANGED TO "Concluído" DURING ("${start}", "${end}")
    AND issuetype in (História, Story, Bug, Design, "Technical Debt", Kaizen, Task, Spike)
    AND status != Cancelado
  `.trim().replace(/\s+/g, " ");

  const issues = await searchIssues(jql);

  // Validação de status atual: manter APENAS issues com status = Concluído/Done
  return issues.filter(
    (issue) =>
      issue.status === "Concluído" ||
      issue.status === "Done" ||
      issue.status === "Closed" ||
      issue.status === "Finalizado"
  );
}

/**
 * Issue com changelog inline (otimização: elimina chamadas individuais de changelog).
 */
export interface JiraIssueWithChangelog extends JiraIssue {
  transitions: { timestamp: string; fromStatus: string; toStatus: string }[];
}

/**
 * OTIMIZADO: Busca issues concluídas COM changelog inline (expand=changelog).
 * Em vez de fazer 1 request por issue para changelogs, traz tudo junto.
 * Reduz de ~45 requests para 1-2 por sprint.
 */
export async function fetchCompletedIssuesWithChangelogs(
  project: string,
  sprintId: number | null,
  startDate: string,
  endDate: string
): Promise<JiraIssueWithChangelog[]> {
  const cache = getCacheManager();
  const start = startDate.split("T")[0];
  const end = endDate.split("T")[0];
  const sprintClause = sprintId ? `AND sprint = ${sprintId}` : "";

  // Para sprints: buscar issues concluídas na sprint (sem DURING — Sprint Report behavior)
  // Para kanban: usar DURING com as datas da janela temporal
  let jql: string;
  if (sprintId) {
    // Sprint: issues do projeto concluídas DURANTE o período da sprint
    // Não filtra por sprint association — garante que itens transbordados
    // contam na sprint onde foram concluídos (não na sprint de origem)
    jql = `
      project = "${project}"
      AND status CHANGED TO "Concluído" DURING ("${start}", "${end}")
      AND issuetype in (História, Story, Bug, Design, "Technical Debt", Kaizen, Task, Spike)
      AND status != Cancelado
    `.trim().replace(/\s+/g, " ");
  } else {
    // Kanban: issues que transitaram para Concluído dentro da janela
    jql = `
      project = "${project}"
      AND status CHANGED TO "Concluído" DURING ("${start}", "${end}")
      AND issuetype in (História, Story, Bug, Design, "Technical Debt", Kaizen, Task, Spike)
      AND status != Cancelado
    `.trim().replace(/\s+/g, " ");
  }

  const cacheKey = `issues-cl:${hashString(jql)}`;
  const cached = cache.get<JiraIssueWithChangelog[]>(cacheKey);
  if (cached) return cached;

  const client = getJiraClient();
  const allIssues: JiraIssueWithChangelog[] = [];
  let nextPageToken: string | undefined = undefined;
  let hasMore = true;

  do {
    const body: Record<string, unknown> = {
      jql,
      fields: ["summary", "status", "issuetype", "created", "resolutiondate"],
      expand: "changelog",
      maxResults: 25,
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const response = await client.post<JiraSearchResponse>(
      "/rest/api/3/search/jql",
      body
    );

    for (const raw of response.issues) {
      // Filtrar: manter apenas status atual = Concluído
      const status = raw.fields.status.name;
      if (status !== "Concluído" && status !== "Done" && status !== "Closed" && status !== "Finalizado") {
        continue;
      }

      // Extrair transições de status do changelog inline
      let transitions: { timestamp: string; fromStatus: string; toStatus: string }[] = [];
      const historyCount = raw.changelog?.histories?.length || 0;

      if (raw.changelog?.histories) {
        for (const history of raw.changelog.histories) {
          for (const item of history.items) {
            if (item.field === "status" && item.fromString && item.toString) {
              transitions.push({
                timestamp: history.created,
                fromStatus: item.fromString,
                toStatus: item.toString,
              });
            }
          }
        }
      }

      // FALLBACK: Se changelog inline tem ≥100 entradas, pode estar truncado.
      // Buscar changelog completo via endpoint individual com paginação.
      if (historyCount >= 100) {
        const { fetchChangelog } = await import("./jira-changelog");
        transitions = await fetchChangelog(raw.key);
      }

      // Ordenar transições cronologicamente
      transitions.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      allIssues.push({
        key: raw.key,
        summary: raw.fields.summary,
        issueType: raw.fields.issuetype.name,
        status,
        created: raw.fields.created,
        resolutionDate: raw.fields.resolutiondate || undefined,
        transitions,
      });
    }

    nextPageToken = response.nextPageToken;
    hasMore = !response.isLast && !!nextPageToken;
  } while (hasMore);

  // Cache por 1 hora (mesmo que changelogs individuais)
  cache.set(cacheKey, allIssues, CACHE_TTLS.changelog);

  return allIssues;
}

/**
 * Busca issues que NÃO foram concluídas na sprint (transbordo).
 * Base: issues comprometidas no início, excluindo adicionadas.
 */
export async function fetchSpilledIssues(
  project: string,
  sprintId: number,
  startDate: string,
  endDate: string
): Promise<JiraIssue[]> {
  // Jira DURING requer formato YYYY-MM-DD
  const start = startDate.split("T")[0];
  const end = endDate.split("T")[0];

  const jql = `
    project = "${project}"
    AND sprint = ${sprintId}
    AND issuetype in (História, Story, Bug, Design, "Technical Debt", Kaizen, Task, Spike)
    AND NOT status CHANGED TO "Concluído" DURING ("${start}", "${end}")
    AND status != Cancelado
    AND status != "Lista de Pendências"
  `.trim().replace(/\s+/g, " ");

  return searchIssues(jql);
}

/**
 * Busca subtasks de uma sprint para cálculo de ocupação.
 */
export async function fetchSubtasks(
  project: string,
  sprintId: number | null,
  startDate?: string,
  endDate?: string
): Promise<JiraIssue[]> {
  const sprintClause = sprintId ? `AND sprint = ${sprintId}` : "";
  const dateClause =
    !sprintId && startDate && endDate
      ? `AND created >= "${startDate}" AND created <= "${endDate}"`
      : "";

  const jql = `
    project = "${project}"
    AND issuetype in (Sub-task, Subtarefa, "Sub-bug")
    ${sprintClause}
    ${dateClause}
    AND status not in (Cancelado, "Lista de Pendências")
  `.trim().replace(/\s+/g, " ");

  return searchIssues(jql);
}

/**
 * Subtask com Original Estimate (para cálculo de Ocupação).
 */
export interface SubtaskWithEstimate {
  key: string;
  originalEstimateSeconds: number;
  issueType?: string;
  parentKey?: string;
}

/**
 * Busca subtasks com Original Estimate para cálculo de ocupação.
 * Retorna apenas subtasks que têm originalEstimate preenchido.
 */
export async function fetchSubtasksWithEstimates(
  project: string,
  sprintId: number | null,
  startDate?: string,
  endDate?: string
): Promise<SubtaskWithEstimate[]> {
  const sprintClause = sprintId ? `AND sprint = ${sprintId}` : "";
  const dateClause =
    !sprintId && startDate && endDate
      ? `AND created >= "${startDate}" AND created <= "${endDate}"`
      : "";

  const jql = `
    project = "${project}"
    AND issuetype in (Sub-task, Subtarefa, "Sub-bug")
    ${sprintClause}
    ${dateClause}
    AND status not in (Cancelado, "Lista de Pendências")
  `.trim().replace(/\s+/g, " ");

  // Buscar com campo timetracking
  const cache = getCacheManager();
  const cacheKey = `subtask-est:${hashString(jql)}`;
  const cached = cache.get<SubtaskWithEstimate[]>(cacheKey);
  if (cached) return cached;

  const client = getJiraClient();
  const allSubtasks: SubtaskWithEstimate[] = [];
  let nextPageToken: string | undefined = undefined;
  let hasMore = true;

  do {
    const body: Record<string, unknown> = {
      jql,
      fields: ["timetracking"],
      maxResults: 100,
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const response = await client.post<{
      issues: { key: string; fields: { timetracking?: { originalEstimateSeconds?: number } } }[];
      nextPageToken?: string;
      isLast?: boolean;
    }>("/rest/api/3/search/jql", body);

    for (const issue of response.issues) {
      const seconds = Number(issue.fields.timetracking?.originalEstimateSeconds) || 0;
      allSubtasks.push({ key: issue.key, originalEstimateSeconds: seconds });
    }

    nextPageToken = response.nextPageToken;
    hasMore = !response.isLast && !!nextPageToken;
  } while (hasMore);

  cache.set(cacheKey, allSubtasks, CACHE_TTLS.issues);
  return allSubtasks;
}

/**
 * Busca subtasks com Original Estimate E parent key para regra de ocupação.
 * Permite agrupar subtasks por Standard Issue pai.
 */
export async function fetchSubtasksWithParent(
  project: string,
  sprintId: number | null,
  startDate?: string,
  endDate?: string
): Promise<SubtaskWithEstimate[]> {
  const sprintClause = sprintId ? `AND sprint = ${sprintId}` : "";
  const dateClause =
    !sprintId && startDate && endDate
      ? `AND created >= "${startDate}" AND created <= "${endDate}"`
      : "";

  const jql = `
    project = "${project}"
    AND issuetype in (Sub-task, Subtarefa, "Sub-bug")
    ${sprintClause}
    ${dateClause}
    AND status not in (Cancelado, "Lista de Pendências")
  `.trim().replace(/\s+/g, " ");

  const cache = getCacheManager();
  const cacheKey = `subtask-parent:${hashString(jql)}`;
  const cached = cache.get<SubtaskWithEstimate[]>(cacheKey);
  if (cached) return cached;

  const client = getJiraClient();
  const allSubtasks: SubtaskWithEstimate[] = [];
  let nextPageToken: string | undefined = undefined;
  let hasMore = true;

  do {
    const body: Record<string, unknown> = {
      jql,
      fields: ["timetracking", "parent", "issuetype"],
      maxResults: 100,
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const response = await client.post<{
      issues: {
        key: string;
        fields: {
          timetracking?: { originalEstimateSeconds?: number };
          parent?: { key?: string };
          issuetype?: { name?: string };
        };
      }[];
      nextPageToken?: string;
      isLast?: boolean;
    }>("/rest/api/3/search/jql", body);

    for (const issue of response.issues) {
      const seconds = Number(issue.fields.timetracking?.originalEstimateSeconds) || 0;
      allSubtasks.push({
        key: issue.key,
        originalEstimateSeconds: seconds,
        parentKey: issue.fields.parent?.key,
        issueType: issue.fields.issuetype?.name,
      });
    }

    nextPageToken = response.nextPageToken;
    hasMore = !response.isLast && !!nextPageToken;
  } while (hasMore);

  cache.set(cacheKey, allSubtasks, CACHE_TTLS.issues);
  return allSubtasks;
}

/**
 * Busca Standard Issues (História, Bug, Task, etc.) com Original Estimate.
 * Usado para comparar com subtasks na regra de ocupação (usar o maior).
 */
export async function fetchStandardIssuesWithEstimates(
  project: string,
  sprintId: number | null,
  startDate?: string,
  endDate?: string
): Promise<SubtaskWithEstimate[]> {
  const sprintClause = sprintId ? `AND sprint = ${sprintId}` : "";
  const dateClause =
    !sprintId && startDate && endDate
      ? `AND created >= "${startDate}" AND created <= "${endDate}"`
      : "";

  const jql = `
    project = "${project}"
    AND issuetype in (História, Story, Bug, Design, "Technical Debt", Kaizen, Task, Spike)
    ${sprintClause}
    ${dateClause}
    AND status not in (Cancelado, "Lista de Pendências")
  `.trim().replace(/\s+/g, " ");

  const cache = getCacheManager();
  const cacheKey = `standard-est:${hashString(jql)}`;
  const cached = cache.get<SubtaskWithEstimate[]>(cacheKey);
  if (cached) return cached;

  const client = getJiraClient();
  const allIssues: SubtaskWithEstimate[] = [];
  let nextPageToken: string | undefined = undefined;
  let hasMore = true;

  do {
    const body: Record<string, unknown> = {
      jql,
      fields: ["timetracking", "issuetype"],
      maxResults: 100,
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const response = await client.post<{
      issues: { key: string; fields: { timetracking?: { originalEstimateSeconds?: number }; issuetype?: { name?: string } } }[];
      nextPageToken?: string;
      isLast?: boolean;
    }>("/rest/api/3/search/jql", body);

    for (const issue of response.issues) {
      const seconds = Number(issue.fields.timetracking?.originalEstimateSeconds) || 0;
      allIssues.push({ key: issue.key, originalEstimateSeconds: seconds, issueType: issue.fields.issuetype?.name });
    }

    nextPageToken = response.nextPageToken;
    hasMore = !response.isLast && !!nextPageToken;
  } while (hasMore);

  cache.set(cacheKey, allIssues, CACHE_TTLS.issues);
  return allIssues;
}

/**
 * Busca Bugs e Sub-bugs concluídos em um período (qualidade).
 */
export async function fetchCompletedBugs(
  project: string,
  sprintId: number | null,
  startDate: string,
  endDate: string
): Promise<{ bugs: JiraIssue[]; subBugs: JiraIssue[] }> {
  const start = startDate.split("T")[0];
  const end = endDate.split("T")[0];
  const sprintClause = sprintId ? `AND sprint = ${sprintId}` : "";

  // Bugs
  const bugJql = `
    project = "${project}" ${sprintClause}
    AND status CHANGED TO "Concluído" DURING ("${start}", "${end}")
    AND issuetype = Bug AND status = Concluído
  `.trim().replace(/\s+/g, " ");

  // Sub-bugs
  const subBugJql = `
    project = "${project}" ${sprintClause}
    AND status CHANGED TO "Concluído" DURING ("${start}", "${end}")
    AND issuetype = "Sub-bug" AND status = Concluído
  `.trim().replace(/\s+/g, " ");

  const [bugs, subBugs] = await Promise.all([
    searchIssues(bugJql),
    searchIssues(subBugJql),
  ]);

  return { bugs, subBugs };
}

/**
 * Busca issues em andamento (WIP) para squads Kanban.
 */
export async function fetchWipIssues(project: string): Promise<JiraIssue[]> {
  const jql = `
    project = "${project}"
    AND status in ("To Do", "In Progress", "Design Review", "Code Review", "Test", "Waiting for Test", "Waiting for Delivery")
    AND issuetype in (História, Story, Bug, Design, "Technical Debt", Kaizen, Task, Spike)
    AND status != Cancelado
  `.trim().replace(/\s+/g, " ");

  // WIP não usa cache (precisa ser real-time)
  const client = getJiraClient();
  const allIssues: JiraIssue[] = [];
  let nextPageToken: string | undefined = undefined;
  let hasMore = true;

  do {
    const body: Record<string, unknown> = {
      jql,
      fields: ["summary", "status", "issuetype", "created", "resolutiondate"],
      maxResults: 100,
    };
    if (nextPageToken) {
      body.nextPageToken = nextPageToken;
    }

    const response = await client.post<JiraSearchResponse>(
      "/rest/api/3/search/jql",
      body
    );

    allIssues.push(...response.issues.map(mapRawIssue));
    nextPageToken = response.nextPageToken;
    hasMore = !response.isLast && !!nextPageToken;
  } while (hasMore);

  return allIssues;
}

/**
 * Busca issues em andamento (WIP) com Original Estimate — para Agile IA.
 * Retorna key + originalEstimateSeconds das Standard Issues no fluxo.
 */
export async function fetchWipIssuesWithEstimates(
  project: string
): Promise<SubtaskWithEstimate[]> {
  const jql = `
    project = "${project}"
    AND status in ("To Do", "In Progress", "Design Review", "Code Review", "Test", "Waiting for Test", "Waiting for Delivery")
    AND issuetype in (História, Story, Bug, Design, "Technical Debt", Kaizen, Task, Spike)
    AND status != Cancelado
  `.trim().replace(/\s+/g, " ");

  const client = getJiraClient();
  const allIssues: SubtaskWithEstimate[] = [];
  let nextPageToken: string | undefined = undefined;
  let hasMore = true;

  do {
    const body: Record<string, unknown> = {
      jql,
      fields: ["timetracking", "issuetype"],
      maxResults: 100,
    };
    if (nextPageToken) body.nextPageToken = nextPageToken;

    const response = await client.post<{
      issues: { key: string; fields: { timetracking?: { originalEstimateSeconds?: number }; issuetype?: { name?: string } } }[];
      nextPageToken?: string;
      isLast?: boolean;
    }>("/rest/api/3/search/jql", body);

    for (const issue of response.issues) {
      const seconds = Number(issue.fields.timetracking?.originalEstimateSeconds) || 0;
      allIssues.push({ key: issue.key, originalEstimateSeconds: seconds, issueType: issue.fields.issuetype?.name });
    }

    nextPageToken = response.nextPageToken;
    hasMore = !response.isLast && !!nextPageToken;
  } while (hasMore);

  return allIssues;
}

/**
 * Busca Épicos R2 filtrados por squad.
 */
export async function fetchR2Epics(
  fixVersion: string,
  teamFieldValue: string
): Promise<JiraIssue[]> {
  const jql = `
    project = EP
    AND issuetype = Epic
    AND fixVersion = "${fixVersion}"
    AND "Monte Bravo Teams" = "${teamFieldValue}"
  `.trim().replace(/\s+/g, " ");

  return searchIssues(jql);
}

/**
 * Busca Features R2 filtradas por squad.
 */
export async function fetchR2Features(
  fixVersion: string,
  teamFieldValue: string
): Promise<JiraIssue[]> {
  const jql = `
    project = FT
    AND fixVersion = "${fixVersion}"
    AND "Monte Bravo Teams" = "${teamFieldValue}"
  `.trim().replace(/\s+/g, " ");

  return searchIssues(jql);
}

// --- Helpers ---

function mapRawIssue(raw: JiraRawIssue): JiraIssue {
  return {
    key: raw.key,
    summary: raw.fields.summary,
    issueType: raw.fields.issuetype.name,
    status: raw.fields.status.name,
    created: raw.fields.created,
    resolutionDate: raw.fields.resolutiondate || undefined,
  };
}
