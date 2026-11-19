import type { SquadConfig } from "@/config/squads";
import { CYCLE_TIME_END_STATUSES } from "@/config/status-mapping";
import { fetchActiveSprint } from "./jira-sprints";
import { getSprintNamer } from "./sprint-display";
import { EXCLUDED, STANDARD_TYPES, SUBTASK_TYPES, readHistory, searchAll } from "./jira-burndown";
import { resolveWindowStartMs } from "./live-sprint-metrics";
import { doneAt, type BurndownIssue } from "@/metrics/sprint-burndown";
import { buildSprintExecutive, type ExecCardInput, type ExecSubInput, type SprintExecutiveResult } from "@/metrics/sprint-executive";

/** Campo "Flagged" (impedimento) do Jira da Monte Bravo. Pode ser trocado por env se o campo mudar. */
const FLAGGED_FIELD = process.env.JIRA_FLAGGED_FIELD || "customfield_10021";

const DONE_LIST = [...CYCLE_TIME_END_STATUSES].map((s) => `"${s}"`).join(", ");

/**
 * Resumo executivo da sprint vigente (tempo real, sem cache): Features priorizadas, avanço em cards e subtasks
 * e bloqueios. Regras em src/metrics/sprint-executive.ts. Retorna null sem sprint ativa ou em squad Kanban.
 */
export async function fetchSprintExecutive(
  squad: SquadConfig,
  issueTypeFilter?: (type: string) => boolean
): Promise<SprintExecutiveResult | null> {
  if (squad.methodology !== "sprint") return null;
  const sprint = await fetchActiveSprint(squad.boardId);
  if (!sprint) return null;
  const windowStartMs = await resolveWindowStartMs(squad.boardId, sprint);

  // Cards (standard issues): com histórico, só para saber quando cada um foi concluído
  const standardRaw = await searchAll(
    `project = "${squad.project}" AND sprint = ${sprint.id} AND issuetype in ${STANDARD_TYPES} AND ${EXCLUDED}`,
    ["summary", "issuetype", "status", "created", "parent", FLAGGED_FIELD]
  );
  const cards: ExecCardInput[] = [];
  const cardAsBurndown = new Map<string, BurndownIssue>();
  for (const r of standardRaw) {
    if (issueTypeFilter && !issueTypeFilter(r.fields.issuetype.name)) continue;
    const { transitions } = await readHistory(r, sprint.id);
    const bd: BurndownIssue = { key: r.key, issueType: r.fields.issuetype.name, status: r.fields.status.name, created: r.fields.created, transitions };
    cardAsBurndown.set(r.key, bd);
    // Bloqueio = só a bandeira de impedimento do Jira (links "bloqueia"/"é bloqueado por" não contam)
    const flagged = Array.isArray(r.fields[FLAGGED_FIELD]) && (r.fields[FLAGGED_FIELD] as unknown[]).length > 0;
    cards.push({
      key: r.key,
      summary: r.fields.summary ?? r.key,
      status: r.fields.status.name,
      featureKey: r.fields.parent?.key ?? null,
      featureTitle: r.fields.parent?.fields?.summary,
      featureStatus: r.fields.parent?.fields?.status?.name,
      flagged,
      doneAtMs: doneAt(bd),
    });
  }

  // Subtasks: as abertas só precisam do estado atual; as concluídas precisam do histórico (quando foram concluídas)
  const subFields = ["issuetype", "status", "created", "parent", "timetracking"];
  const [openSubs, doneSubs] = await Promise.all([
    searchAll(`project = "${squad.project}" AND sprint = ${sprint.id} AND issuetype in ${SUBTASK_TYPES} AND status not in (${DONE_LIST}) AND ${EXCLUDED}`, subFields, false),
    searchAll(`project = "${squad.project}" AND sprint = ${sprint.id} AND issuetype in ${SUBTASK_TYPES} AND status in (${DONE_LIST}) AND ${EXCLUDED}`, subFields),
  ]);

  const subs: ExecSubInput[] = [];
  const addSub = async (r: (typeof openSubs)[number], isDone: boolean) => {
    const parentKey = r.fields.parent?.key ?? null;
    // Mesmo filtro de tipos da tela: a subtask segue o tipo do card pai
    const parentType = (parentKey ? cardAsBurndown.get(parentKey)?.issueType : undefined) || r.fields.parent?.fields?.issuetype?.name;
    if (issueTypeFilter && parentType && !issueTypeFilter(parentType)) return;
    let doneAtMs: number | null = null;
    if (isDone) {
      const { transitions } = await readHistory(r, sprint.id);
      const parent = parentKey ? cardAsBurndown.get(parentKey) : undefined;
      const parentDone = parent ? doneAt(parent) : null;
      doneAtMs = doneAt({
        key: r.key,
        issueType: r.fields.issuetype.name,
        status: r.fields.status.name,
        created: r.fields.created,
        transitions,
        // Subtask concluída sob card já concluído queima junto com o card (mesma regra do Burndown de horas)
        parentDoneAt: parentDone !== null ? new Date(parentDone).toISOString() : undefined,
      });
    }
    subs.push({ key: r.key, parentKey, hours: (Number(r.fields.timetracking?.originalEstimateSeconds) || 0) / 3600, doneAtMs });
  };
  for (const r of openSubs) await addSub(r, false);
  for (const r of doneSubs) await addSub(r, true);

  return buildSprintExecutive({
    // Padrão de exibição "Sprint N - RN", seja qual for o nome no Jira
    sprint: { id: sprint.id, name: (await getSprintNamer())(sprint.name, sprint.startDate), startDate: sprint.startDate, endDate: sprint.endDate },
    cards,
    subs,
    windowStartMs,
  });
}
