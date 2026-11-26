import type { SquadConfig } from "@/config/squads";
import { fetchActiveSprint, fetchAllSprints, type SprintData } from "./jira-sprints";
import { resolveSprintCapacity } from "./capacity-resolver";
import { getSprintNamer } from "./sprint-display";
import { CANCELED, EXCLUDED, STANDARD_TYPES, SUBTASK_TYPES, readHistory, searchAll, type RawSearchIssue } from "./jira-burndown";
import { resolveWindowStartMs } from "./live-sprint-metrics";
import { doneAt } from "@/metrics/sprint-burndown";
import { sprintAllocationHours, type AllocationCard, type AllocationSub } from "@/metrics/sprint-executive";
import { businessDaysListBrt } from "@/lib/utils";
import { CYCLE_TIME_END_STATUSES } from "@/config/status-mapping";

const SUBTASK_TYPE_NAMES = new Set(["Sub-task", "Subtarefa", "Sub-bug"]);
const DONE_LIST = [...CYCLE_TIME_END_STATUSES].map((s) => `"${s}"`).join(", ");

export interface SprintCapacityResult {
  sprint: { id: number; name: string; startDate: string; endDate: string };
  /** active = sprint vigente no Jira; future = próxima sprint (a vigente já foi concluída) */
  state: "active" | "future";
  /** Pessoas consideradas (integrantes com % > 0, ou pessoas do formato antigo) */
  teamSize: number;
  /** Pessoas-equivalentes (Σ % / 100) */
  fte: number;
  /** Horas do time por dia útil (Σ horas por dia × %) */
  hoursPerDayTotal: number;
  /** Horas por dia padrão (ou do formato antigo) */
  hoursPerDay: number;
  /** De onde veio a capacidade: ajustada, herdada, padrão (integrantes a 100%), legado ou time-padrão */
  capacitySource: "ajustada" | "herdada" | "padrao" | "legado" | "time-padrao";
  inheritedFromSprintName?: string;
  /** Dias úteis considerados na capacidade (configurados em Capacidade ou calculados pelas datas) */
  businessDays: number;
  availableHours: number;
  /**
   * Horas comprometidas DESTA sprint (regra do maior entre card e subtasks, sem o trabalho concluído em
   * sprints anteriores). Mesma conta do Resumo executivo (sprintAllocationHours).
   */
  allocatedHours: number;
  /** Comprometido ainda não concluído nesta sprint (alocado − concluído). Não depende do Remaining Estimate. */
  remainingHours: number;
  /** Dias úteis da sprint (YYYY-MM-DD, fuso de Brasília) para a faixa do tempo */
  days: string[];
  asOf: string;
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

  // Regra: só o comprometido DESTA sprint (mesma função do Resumo executivo).
  // - Trabalho concluído antes da janela da sprint (sprint anterior) fica fora.
  // - Por card: o maior entre (estimativa do card − subtasks concluídas antes da sprint) e as subtasks desta sprint.
  // - Concluído: card concluído = todas as horas dele; card em andamento = subtasks concluídas nesta sprint.
  // O time não preenche o Remaining Estimate: restante = comprometido − concluído.
  const windowStartMs = await resolveWindowStartMs(squad.boardId, sprint);
  const isPrior = (d: number | null) => d !== null && d < windowStartMs;
  const base = `project = "${squad.project}" AND sprint = ${sprint.id} AND issuetype in (${STANDARD_TYPES.slice(1, -1)}, ${SUBTASK_TYPES.slice(1, -1)}) AND ${EXCLUDED}`;
  const fields = ["timetracking", "parent", "issuetype", "status", "created"];
  // Abertos: só o estado atual; concluídos: com histórico (quando foram concluídos)
  const [openRaw, doneRaw, canceledRaw] = await Promise.all([
    searchAll(`${base} AND status not in (${DONE_LIST})`, fields, false),
    searchAll(`${base} AND status in (${DONE_LIST})`, fields),
    // Subtasks canceladas/rejeitadas: só descontam da estimativa do card pai
    searchAll(`project = "${squad.project}" AND sprint = ${sprint.id} AND issuetype in ${SUBTASK_TYPES} AND ${CANCELED}`, ["parent", "timetracking"], false),
  ]);
  const doneMs = new Map<string, number | null>();
  for (const r of doneRaw) {
    const { transitions } = await readHistory(r, sprint.id);
    doneMs.set(r.key, doneAt({ key: r.key, issueType: r.fields.issuetype.name, status: r.fields.status.name, created: r.fields.created, transitions }));
  }

  const hours = (r: RawSearchIssue) => (Number(r.fields.timetracking?.originalEstimateSeconds) || 0) / 3600;
  const allRaw = [...openRaw, ...doneRaw];
  // Mesmo filtro de tipos da Ocupação: cards pelo tipo; subtask entra se não tem pai ou se o card pai entrou
  const standardRaw = allRaw.filter((r) => !SUBTASK_TYPE_NAMES.has(r.fields.issuetype.name) && (!typeFilter || typeFilter(r.fields.issuetype.name)));
  const keptKeys = new Set(standardRaw.map((r) => r.key));
  const cards: AllocationCard[] = standardRaw
    .map((r) => ({ key: r.key, estimateHours: hours(r), doneAtMs: doneMs.get(r.key) ?? null }))
    .filter((c) => !isPrior(c.doneAtMs)); // card concluído antes da sprint não é desta sprint
  const subs: AllocationSub[] = allRaw
    .filter((r) => SUBTASK_TYPE_NAMES.has(r.fields.issuetype.name))
    .filter((r) => !r.fields.parent?.key || keptKeys.has(r.fields.parent.key))
    .map((r) => ({ key: r.key, parentKey: r.fields.parent?.key ?? null, hours: hours(r), doneAtMs: doneMs.get(r.key) ?? null }));
  for (const r of canceledRaw) {
    const parentKey = r.fields.parent?.key;
    if (parentKey && keptKeys.has(parentKey)) subs.push({ key: r.key, parentKey, hours: hours(r), doneAtMs: null, canceled: true });
  }
  const alloc = sprintAllocationHours(cards, subs, isPrior);
  const allocatedHours = Math.round(alloc.total);
  const remainingHours = Math.max(0, allocatedHours - Math.min(allocatedHours, Math.round(alloc.done)));
  // Capacidade: integrantes × % de atuação × horas por dia × dias úteis (capacity-resolver). Sem configuração
  // por integrante, a conta antiga (pessoas × horas por dia × dias úteis), com as datas da sprint no Jira.
  const cap = await resolveSprintCapacity(squad, { id: sprint.id, name: sprint.name, state, startDate: sprint.startDate, endDate: sprint.endDate });
  // Dias úteis entre o início e o fim da sprint exatamente como no Jira (fuso de Brasília, dias incluídos)
  const days = businessDaysListBrt(sprint.startDate, sprint.endDate);
  const sprintNamer = await getSprintNamer();

  return {
    // Nome no padrão "Sprint N - RN"
    sprint: { id: sprint.id, name: sprintNamer(sprint.name, sprint.startDate), startDate: sprint.startDate, endDate: sprint.endDate },
    state,
    teamSize: cap.headcount,
    fte: cap.fte,
    hoursPerDayTotal: cap.hoursPerDayTotal,
    hoursPerDay: cap.legacy?.hoursPerDay ?? cap.hoursPerDayDefault,
    capacitySource: cap.source,
    inheritedFromSprintName: cap.inheritedFromSprintName ? sprintNamer(cap.inheritedFromSprintName, sprint.startDate) : undefined,
    businessDays: cap.businessDays,
    availableHours: cap.capacityHours,
    allocatedHours,
    remainingHours,
    days,
    asOf: new Date().toISOString(),
  };
}
