import type { SquadConfig } from "@/config/squads";
import { getJiraClient } from "./jira-client";
import { fetchActiveSprint, fetchAllSprints, type SprintData } from "./jira-sprints";
import { loadCapacityConfig } from "./capacity-store";
import { getSprintNamer } from "./sprint-display";
import type { SubtaskWithEstimate } from "./jira-search";
import { resolveOccupationEstimates } from "@/metrics/occupation";
import { businessDaysListBrt } from "@/lib/utils";
import { CYCLE_TIME_END_STATUSES } from "@/config/status-mapping";

/** Regra de negócio da Ocupação: 6 horas produtivas por pessoa por dia útil. */
const HOURS_PER_DAY = 6;
const SUBTASK_TYPES = new Set(["Sub-task", "Subtarefa", "Sub-bug"]);

export interface SprintCapacityResult {
  sprint: { id: number; name: string; startDate: string; endDate: string };
  /** active = sprint vigente no Jira; future = próxima sprint (a vigente já foi concluída) */
  state: "active" | "future";
  teamSize: number;
  /** Dias úteis considerados na capacidade (configurados em Capacidade ou calculados pelas datas) */
  businessDays: number;
  availableHours: number;
  /** Original Estimate (regra da Ocupação: maior entre soma das subtasks e estimativa da história) */
  allocatedHours: number;
  /** Original Estimate dos itens ainda NÃO concluídos (mesma regra de agregação). Não depende do Remaining Estimate. */
  remainingHours: number;
  /** Dias úteis da sprint (YYYY-MM-DD, fuso de Brasília) para a faixa do tempo */
  days: string[];
  asOf: string;
}

interface RawIssue {
  key: string;
  fields: {
    issuetype?: { name?: string };
    status?: { name?: string };
    parent?: { key?: string };
    timetracking?: { originalEstimateSeconds?: number; remainingEstimateSeconds?: number };
  };
}

/** Sprint a acompanhar: a ativa no Jira; só quando não houver ativa, a próxima (futura) de início mais cedo. */
async function pickSprint(boardId: number): Promise<{ sprint: SprintData; state: "active" | "future" } | null> {
  const active = await fetchActiveSprint(boardId);
  if (active) return { sprint: active, state: "active" };
  const all = await fetchAllSprints(boardId, { fresh: true });
  const next = all
    .filter((s) => s.state === "future")
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0];
  return next ? { sprint: next, state: "future" } : null;
}

/**
 * Capacidade da sprint vigente (ou da próxima, se a vigente já foi concluída no Jira), sempre em tempo real.
 * Squads Kanban não têm sprint: retorna null.
 */
export async function fetchSprintCapacity(
  squad: SquadConfig,
  /** Filtro de tipos da tela (mesma regra da Ocupação); sem filtro, todos os tipos */
  typeFilter?: (issueType: string) => boolean
): Promise<SprintCapacityResult | null> {
  if (squad.methodology !== "sprint") return null;
  const picked = await pickSprint(squad.boardId);
  if (!picked) return null;
  const { sprint, state } = picked;

  const client = getJiraClient();
  const jql =
    `project = "${squad.project}" AND sprint = ${sprint.id} ` +
    `AND issuetype in (História, Story, Bug, Design, "Technical Debt", Kaizen, Task, Spike, Sub-task, Subtarefa, "Sub-bug") ` +
    `AND status not in (Cancelado, CANCELADO, Rejeitado, "Lista de Pendências")`;
  const raw: RawIssue[] = [];
  let nextPageToken: string | undefined;
  do {
    const body: Record<string, unknown> = { jql, fields: ["timetracking", "parent", "issuetype", "status"], maxResults: 100 };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const res = await client.post<{ issues: RawIssue[]; nextPageToken?: string; isLast?: boolean }>("/rest/api/3/search/jql", body);
    raw.push(...res.issues);
    nextPageToken = res.isLast ? undefined : res.nextPageToken;
  } while (nextPageToken);

  // Regra: o time não preenche o Remaining Estimate. O restante é o Original Estimate dos itens
  // ainda não concluídos no Jira; item concluído (status Concluído/Done) conta como entregue.
  const split = (onlyOpen: boolean) => {
    const standard: SubtaskWithEstimate[] = [];
    const subtasks: SubtaskWithEstimate[] = [];
    for (const r of raw) {
      const done = CYCLE_TIME_END_STATUSES.has(r.fields.status?.name || "");
      const item: SubtaskWithEstimate = {
        key: r.key,
        originalEstimateSeconds: onlyOpen && done ? 0 : Number(r.fields.timetracking?.originalEstimateSeconds) || 0,
        issueType: r.fields.issuetype?.name,
        parentKey: r.fields.parent?.key,
      };
      if (SUBTASK_TYPES.has(item.issueType || "")) subtasks.push(item);
      else standard.push(item);
    }
    return { standard, subtasks };
  };
  // Mesmo filtro de tipos da Ocupação: cards pelo tipo; subtask entra se não tem pai ou se o card pai entrou. A regra do maior entre a estimativa do card e a soma das subtasks vem de resolveOccupationEstimates.
  const applyTypes = (s: { standard: SubtaskWithEstimate[]; subtasks: SubtaskWithEstimate[] }) => {
    if (!typeFilter) return s;
    const standard = s.standard.filter((x) => x.issueType && typeFilter(x.issueType));
    const keys = new Set(standard.map((x) => x.key));
    const subtasks = s.subtasks.filter((x) => !x.parentKey || keys.has(x.parentKey));
    return { standard, subtasks };
  };  const all = applyTypes(split(false));
  const open = applyTypes(split(true));
  const allocatedHours = Math.round(resolveOccupationEstimates(all.standard, all.subtasks) / 3600);
  const remainingHours = Math.round(resolveOccupationEstimates(open.standard, open.subtasks) / 3600);
  // Pessoas e dias úteis: configuração de Capacidade da sprint; sem configuração, padrão da squad e datas do Jira
  const config = await loadCapacityConfig(squad.slug).catch(() => ({} as Record<string, { teamSize: number; businessDays?: number }>));
  const entry = config[String(sprint.id)];
  const teamSize = entry?.teamSize ?? squad.teamSize;
  // Dias úteis entre o início e o fim da sprint exatamente como no Jira (fuso de Brasília, dias incluídos)
  const days = businessDaysListBrt(sprint.startDate, sprint.endDate);
  const businessDays = entry?.businessDays || days.length;

  return {
    // Nome no padrão "Sprint N - RN"
    sprint: { id: sprint.id, name: (await getSprintNamer())(sprint.name, sprint.startDate), startDate: sprint.startDate, endDate: sprint.endDate },
    state,
    teamSize,
    businessDays,
    availableHours: teamSize * HOURS_PER_DAY * businessDays,
    allocatedHours,
    remainingHours,
    days,
    asOf: new Date().toISOString(),
  };
}
