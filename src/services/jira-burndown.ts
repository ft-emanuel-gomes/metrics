import { getJiraClient } from "./jira-client";
import type { SquadConfig } from "@/config/squads";
import { fetchActiveSprint } from "./jira-sprints";
import { fetchChangelog } from "./jira-changelog";
import { calculateSprintBurndown, doneAt, type BurndownIssue, type SprintBurndownResult } from "@/metrics/sprint-burndown";
import { resolveWindowStartMs } from "./live-sprint-metrics";
import { getSprintNamer } from "./sprint-display";
import { sprintAllocationHours } from "@/metrics/sprint-executive";

/** Link entre issues como o Jira devolve (só o que o app usa). */
export interface RawIssueLink {
  type?: { name?: string };
  inwardIssue?: { key: string; fields?: { status?: { name?: string } } };
  outwardIssue?: { key: string; fields?: { status?: { name?: string } } };
}

export interface RawSearchIssue {
  key: string;
  fields: {
    issuetype: { name: string };
    status: { name: string };
    created: string;
    summary?: string;
    parent?: { key?: string; fields?: { summary?: string; status?: { name?: string }; issuetype?: { name?: string } } };
    timetracking?: { originalEstimateSeconds?: number };
    issuelinks?: RawIssueLink[];
    /** Campos extras pedidos por quem chama (ex.: Flagged) */
    [field: string]: unknown;
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
export const EXCLUDED = `status not in (Cancelado, CANCELADO, Rejeitado, "Lista de Pendências")`;
export const STANDARD_TYPES = `(História, Story, Bug, Design, "Technical Debt", Kaizen, Task, Spike)`;
export const SUBTASK_TYPES = `(Sub-task, Subtarefa, "Sub-bug")`;

/** Busca paginada. Sem changelog (withChangelog = false) é bem mais leve: use quando só o estado atual importa. */
export async function searchAll(jql: string, fields: string[], withChangelog = true): Promise<RawSearchIssue[]> {
  const client = getJiraClient();
  const raw: RawSearchIssue[] = [];
  let nextPageToken: string | undefined;
  do {
    const body: Record<string, unknown> = { jql, fields, maxResults: withChangelog ? 50 : 100 };
    if (withChangelog) body.expand = "changelog";
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const res: SearchResponse = await client.post<SearchResponse>("/rest/api/3/search/jql", body);
    raw.push(...res.issues);
    nextPageToken = res.isLast ? undefined : res.nextPageToken;
  } while (nextPageToken);
  return raw;
}

/** Transições de status e momento em que o item entrou na sprint (changelog do campo Sprint). */
export async function readHistory(r: RawSearchIssue, sprintId: number) {
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
  // Nome no padrão "Sprint N - RN"
  const sprintInfo = { id: sprint.id, name: (await getSprintNamer())(sprint.name, sprint.startDate), startDate: sprint.startDate, endDate: sprint.endDate };
  // Mesma janela do Computador de Bordo: fechamento da sprint anterior (até 72h antes do start)
  const windowStartMs = await resolveWindowStartMs(squad.boardId, sprint);

  // Standard issues: base do modo cards e, no modo horas, de quando cada card pai entrou na sprint
  const standardRaw = await searchAll(
    `project = "${squad.project}" AND sprint = ${sprint.id} AND issuetype in ${STANDARD_TYPES} AND ${EXCLUDED}`,
    ["issuetype", "status", "created", "timetracking"]
  );
  const standard: BurndownIssue[] = [];
  const cardEstimate = new Map<string, number>();
  for (const r of standardRaw) {
    const { transitions, sprintAddedAt } = await readHistory(r, sprint.id);
    standard.push({ key: r.key, issueType: r.fields.issuetype.name, status: r.fields.status.name, created: r.fields.created, transitions, sprintAddedAt });
    cardEstimate.set(r.key, (Number(r.fields.timetracking?.originalEstimateSeconds) || 0) / 3600);
  }

  if (mode === "cards") {
    const issues = issueTypeFilter ? standard.filter((i) => issueTypeFilter(i.issueType)) : standard;
    return calculateSprintBurndown(issues, sprintInfo, new Date(), "cards", { windowStartMs });
  }

  const parents = new Map(standard.map((p) => [p.key, p]));
  const subsRaw = await searchAll(
    `project = "${squad.project}" AND sprint = ${sprint.id} AND issuetype in ${SUBTASK_TYPES} AND ${EXCLUDED}`,
    ["issuetype", "status", "created", "parent", "timetracking"]
  );
  const subs: BurndownIssue[] = [];
  const subParent = new Map<string, string>();
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
    const parentDoneMs = parent ? doneAt(parent) : null;
    const scopeMs = Math.max(
      new Date(r.fields.created).getTime(),
      sprintAddedAt ? new Date(sprintAddedAt).getTime() : 0,
      parentAdded ? new Date(parentAdded).getTime() : 0
    );
    if (parentKey) subParent.set(r.key, parentKey);
    subs.push({
      key: r.key,
      issueType: r.fields.issuetype.name,
      status: r.fields.status.name,
      created: r.fields.created,
      transitions,
      sprintAddedAt: new Date(scopeMs).toISOString(),
      parentDoneAt: parentDoneMs !== null ? new Date(parentDoneMs).toISOString() : undefined,
      weight: seconds / 3600,
    });
  }

  // Mesma base do Resumo executivo e da Capacidade: comprometido DESTA sprint (sprintAllocationHours).
  // Em cada instante t entram só os itens que já estavam no escopo, e "concluído" só o que já tinha sido concluído.
  const startMs = new Date(sprint.startDate).getTime();
  const winMs = Math.min(windowStartMs, startMs);
  const isPrior = (d: number | null) => d !== null && d < winMs;
  // Concluído na lacuna (janela até o start) conta na nova sprint, queimando logo após o início
  const norm = (d: number | null) => (d !== null && d <= startMs ? startMs + 1 : d);
  const scopeOf = (i: BurndownIssue) => new Date(i.sprintAddedAt || i.created).getTime();
  const cardItems = standard
    .map((c) => ({ c, doneMs: doneAt(c) }))
    .filter((x) => !isPrior(x.doneMs))
    .map((x) => ({ scope: scopeOf(x.c), card: { key: x.c.key, estimateHours: cardEstimate.get(x.c.key) ?? 0, doneAtMs: norm(x.doneMs) } }));
  const subItems = subs.map((s) => ({
    scope: scopeOf(s),
    sub: { key: s.key, parentKey: subParent.get(s.key) ?? null, hours: s.weight ?? 0, doneAtMs: doneAt(s) },
  }));
  const allocationAt = (t: number) => {
    const cardsT = cardItems
      .filter((x) => x.scope <= t)
      .map((x) => ({ ...x.card, doneAtMs: x.card.doneAtMs !== null && x.card.doneAtMs <= t ? x.card.doneAtMs : null }));
    // Subtask feita antes da janela (sprint anterior) sempre entra: só serve para descontar da estimativa do card
    const subsT = subItems
      .filter((x) => isPrior(x.sub.doneAtMs) || x.scope <= t)
      .map((x) => {
        const d = x.sub.doneAtMs;
        if (d === null || isPrior(d)) return x.sub;
        const n = norm(d) as number;
        return { ...x.sub, doneAtMs: n <= t ? n : null };
      });
    return sprintAllocationHours(cardsT, subsT, isPrior);
  };

  return { ...calculateSprintBurndown(subs, sprintInfo, new Date(), "hours", { windowStartMs, allocationAt }), unestimated };
}
