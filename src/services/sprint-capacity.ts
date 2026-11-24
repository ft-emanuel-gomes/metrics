import type { SquadConfig } from "@/config/squads";
import { fetchActiveSprint, fetchAllSprints, type SprintData } from "./jira-sprints";
import { loadCapacityConfig } from "./capacity-store";
import { getSprintNamer } from "./sprint-display";
import { EXCLUDED, STANDARD_TYPES, SUBTASK_TYPES, readHistory, searchAll, type RawSearchIssue } from "./jira-burndown";
import { resolveWindowStartMs } from "./live-sprint-metrics";
import { doneAt } from "@/metrics/sprint-burndown";
import { sprintAllocationHours, type AllocationCard, type AllocationSub } from "@/metrics/sprint-executive";
import { businessDaysListBrt } from "@/lib/utils";
import { CYCLE_TIME_END_STATUSES } from "@/config/status-mapping";

/** Regra de negócio da Ocupação: 6 horas produtivas por pessoa por dia útil. */
const HOURS_PER_DAY = 6;
const SUBTASK_TYPE_NAMES = new Set(["Sub-task", "Subtarefa", "Sub-bug"]);
const DONE_LIST = [...CYCLE_TIME_END_STATUSES].map((s) => `"${s}"`).join(", ");

export interface SprintCapacityResult {
  sprint: { id: number; name: string; startDate: string; endDate: string };
  /** active = sprint vigente no Jira; future = próxima sprint (a vigente já foi concluída) */
  state: "active" | "future";
  teamSize: number;
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
  const [openRaw, doneRaw] = await Promise.all([
    searchAll(`${base} AND status not in (${DONE_LIST})`, fields, false),
    searchAll(`${base} AND status in (${DONE_LIST})`, fields),
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
  const alloc = sprintAllocationHours(cards, subs, isPrior);
  const allocatedHours = Math.round(alloc.total);
  const remainingHours = Math.max(0, allocatedHours - Math.min(allocatedHours, Math.round(alloc.done)));
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
