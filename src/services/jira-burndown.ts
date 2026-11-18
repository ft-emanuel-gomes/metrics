import { getJiraClient } from "./jira-client";
import type { SquadConfig } from "@/config/squads";
import { fetchActiveSprint } from "./jira-sprints";
import { fetchChangelog } from "./jira-changelog";
import { calculateSprintBurndown, type BurndownIssue, type SprintBurndownResult } from "@/metrics/sprint-burndown";

interface RawSearchIssue {
  key: string;
  fields: {
    issuetype: { name: string };
    status: { name: string };
    created: string;
    parent?: { key?: string; fields?: { issuetype?: { name?: string } } };
    timetracking?: { originalEstimateSeconds?: number };
  };
  changelog?: {
    histories: {
      created: string;
      items: { field: string; from?: string | null; to?: string | null; fromString: string | null; toString: string | null }[];
    }[];
  };
}

interface SearchResponse {
  issues: RawSearchIssue[];
  nextPageToken?: string;
  isLast?: boolean;
}

export type BurndownMode = "cards" | "hours";

const IDS = (s?: string | null) => (s ? s.split(",").map((v) => v.trim()).filter(Boolean) : []);
const EXCLUDED = `status not in (Cancelado, CANCELADO, Rejeitado, "Lista de Pendências")`;
const STANDARD_TYPES = `(História, Story, Bug, Design, "Technical Debt", Kaizen, Task, Spike)`;
const SUBTASK_TYPES = `(Sub-task, Subtarefa, "Sub-bug")`;

async function searchAll(jql: string, fields: string[]): Promise<RawSearchIssue[]> {
  const client = getJiraClient();
  const raw: RawSearchIssue[] = [];
  let nextPageToken: string | undefined;
  do {
    const body: Record<string, unknown> = { jql, fields, expand: "changelog", maxResults: 50 };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const res: SearchResponse = await client.post<SearchResponse>("/rest/api/3/search/jql", body);
    raw.push(...res.issues);
    nextPageToken = res.isLast ? undefined : res.nextPageToken;
  } while (nextPageToken);
  return raw;
}

/** Transições de status e momento em que o item entrou na sprint (changelog do campo Sprint). */
async function readHistory(r: RawSearchIssue, sprintId: number) {
  const histories = r.changelog?.histories ?? [];
  let transitions = histories.flatMap((h) =>
    h.items
      .filter((i) => i.field === "status" && i.fromString && i.toString)
      .map((i) => ({ timestamp: h.created, fromStatus: i.fromString as string, toStatus: i.toString as string }))
  );
  // Changelog inline pode vir truncado (100 históricos): buscar o completo só das transições de status
  if (histories.length >= 100) transitions = await fetchChangelog(r.key);
  transitions.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  // 1ª mudança do campo Sprint que passa a conter o id e antes não continha
  const sid = String(sprintId);
  let sprintAddedAt: string | undefined;
  const sorted = [...histories].sort((a, b) => new Date(a.created).getTime() - new Date(b.created).getTime());
  for (const h of sorted) {
    const hit = h.items.find((i) => i.field === "Sprint" && IDS(i.to).includes(sid) && !IDS(i.from).includes(sid));
    if (hit) {
      sprintAddedAt = h.created;
      break;
    }
  }
  return { transitions, sprintAddedAt };
}

/**
 * Burndown da sprint vigente — SEMPRE em tempo real (sem cache).
 * - cards: standard issues (quantidade de cards)
 * - hours: Sub-task e Sub-bug, pelo Original Estimate em horas. Subtask entra no escopo no momento mais tardio
 *   entre a criação dela e a entrada do card pai (ou dela) na sprint; sai do restante quando é concluída.
 *   Lista também as subtasks da sprint sem estimativa (todas precisam estar estimadas).
 */
export async function fetchSprintBurndown(
  squad: SquadConfig,
  issueTypeFilter?: (type: string) => boolean,
  mode: BurndownMode = "cards"
): Promise<SprintBurndownResult | null> {
  if (squad.methodology !== "sprint") return null;
  const sprint = await fetchActiveSprint(squad.boardId);
  if (!sprint) return null;
  const sprintInfo = { id: sprint.id, name: sprint.name, startDate: sprint.startDate, endDate: sprint.endDate };

  // Standard issues: base do modo cards e, no modo horas, de quando cada card pai entrou na sprint
  const standardRaw = await searchAll(
    `project = "${squad.project}" AND sprint = ${sprint.id} AND issuetype in ${STANDARD_TYPES} AND ${EXCLUDED}`,
    ["issuetype", "status", "created"]
  );
  const standard: BurndownIssue[] = [];
  for (const r of standardRaw) {
    const { transitions, sprintAddedAt } = await readHistory(r, sprint.id);
    standard.push({ key: r.key, issueType: r.fields.issuetype.name, status: r.fields.status.name, created: r.fields.created, transitions, sprintAddedAt });
  }

  if (mode === "cards") {
    const issues = issueTypeFilter ? standard.filter((i) => issueTypeFilter(i.issueType)) : standard;
    return calculateSprintBurndown(issues, sprintInfo);
  }

  const parents = new Map(standard.map((p) => [p.key, p]));
  const subsRaw = await searchAll(
    `project = "${squad.project}" AND sprint = ${sprint.id} AND issuetype in ${SUBTASK_TYPES} AND ${EXCLUDED}`,
    ["issuetype", "status", "created", "parent", "timetracking"]
  );
  const subs: BurndownIssue[] = [];
  const unestimated: string[] = [];
  for (const r of subsRaw) {
    const parentKey = r.fields.parent?.key;
    const parent = parentKey ? parents.get(parentKey) : undefined;
    // Mesmo filtro de tipos da tela: a subtask segue o tipo do card pai
    const parentType = parent?.issueType || r.fields.parent?.fields?.issuetype?.name;
    if (issueTypeFilter && parentType && !issueTypeFilter(parentType)) continue;

    const seconds = Number(r.fields.timetracking?.originalEstimateSeconds) || 0;
    if (seconds <= 0) unestimated.push(r.key);
    const { transitions, sprintAddedAt } = await readHistory(r, sprint.id);
    const parentAdded = parent ? parent.sprintAddedAt : undefined;
    const scopeMs = Math.max(
      new Date(r.fields.created).getTime(),
      sprintAddedAt ? new Date(sprintAddedAt).getTime() : 0,
      parentAdded ? new Date(parentAdded).getTime() : 0
    );
    subs.push({
      key: r.key,
      issueType: r.fields.issuetype.name,
      status: r.fields.status.name,
      created: r.fields.created,
      transitions,
      sprintAddedAt: new Date(scopeMs).toISOString(),
      weight: seconds / 3600,
    });
  }

  return { ...calculateSprintBurndown(subs, sprintInfo, new Date(), "hours"), unestimated };
}
