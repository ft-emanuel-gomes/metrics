/**
 * Backlog estimado (tempo real): quanto do trabalho já preparado cabe na PRÓXIMA sprint.
 *
 * Regras de negócio:
 * - Escopo = A ∪ B, cada card UMA vez só:
 *   A) cards do projeto em "Selected for Development" que NÃO estão na sprint vigente: sem sprint, ou só com
 *      sprints já encerradas (que não contam), ou na próxima sprint. Card em Selected que já está na sprint vigente
 *      é trabalho da sprint atual e fica fora;
 *   B) cards da próxima sprint, em qualquer status (menos concluídos, cancelados, rejeitados e Lista de Pendências).
 *   Card em Selected for Development E na próxima sprint conta uma vez (no grupo "na próxima sprint").
 * - Horas: mesma regra das demais visões (sprintAllocationHours): por card, o maior entre a estimativa do card
 *   (descontadas as subtasks canceladas/rejeitadas e as já concluídas) e a soma das subtasks ainda abertas.
 * - Mesmo filtro de tipos da tela; subtask segue o card pai.
 * - Capacidade = a da próxima sprint (pessoas configuradas em Capacidade, ou o padrão da squad, × horas por dia da
 *   configuração global (config/settings.json; sem configuração, 6h) × dias úteis
 *   pelas datas da sprint no Jira; sem datas, os dias salvos em Capacidade ou 10).
 */

import type { SquadConfig } from "@/config/squads";
import { CYCLE_TIME_END_STATUSES } from "@/config/status-mapping";
import { businessDaysListBrt } from "@/lib/utils";
import { sprintAllocationHours, type AllocationCard, type AllocationSub } from "@/metrics/sprint-executive";
import { getGlobalHoursPerDay, loadCapacityConfig } from "./capacity-store";
import { EXCLUDED, STANDARD_TYPES, SUBTASK_TYPES, CANCELED, hasCanceledParent, searchAll, type RawSearchIssue } from "./jira-burndown";
import { fetchActiveSprint, fetchNextSprint } from "./jira-sprints";
import { getSprintNamer } from "./sprint-display";

/** Status que define o backlog preparado. */
export const SELECTED_FOR_DEVELOPMENT = "Selected for Development";
const FALLBACK_BUSINESS_DAYS = 10;
/** Campo Sprint do Jira (lista de sprints do card) */
const SPRINT_FIELD = process.env.JIRA_SPRINT_FIELD || "customfield_10020";
const DONE_LIST = [...CYCLE_TIME_END_STATUSES].map((s) => `"${s}"`).join(", ");
/** Lote de chaves por consulta de subtasks (limite prático da JQL) */
const KEYS_PER_QUERY = 80;

export interface BacklogGroup {
  cards: number;
  hours: number;
}

export interface BacklogEstimateResult {
  nextSprint: { id: number; name: string; startDate?: string; endDate?: string };
  capacity: { teamSize: number; businessDays: number; availableHours: number; hoursPerDay: number };
  /** A ∪ B, sem repetir card */
  total: BacklogGroup;
  /** Cards da próxima sprint (com ou sem Selected for Development) */
  inNextSprint: BacklogGroup;
  /** Cards em Selected for Development que ainda não estão na próxima sprint */
  onlySelected: BacklogGroup;
  /** Cards que estão nos dois (contados uma vez, dentro de inNextSprint) */
  inBoth: number;
  /** Cards sem nenhuma estimativa (card e subtasks): somam 0h */
  unestimatedCards: string[];
  /** Cards em Selected for Development que já estão na sprint vigente: fora do backlog (só informativo) */
  excludedInActiveSprint: string[];
  asOf: string;
}

const hoursOf = (r: RawSearchIssue) => (Number(r.fields.timetracking?.originalEstimateSeconds) || 0) / 3600;
const round1 = (n: number) => Math.round(n * 10) / 10;

export async function fetchBacklogEstimate(
  squad: SquadConfig,
  typeFilter?: (issueType: string) => boolean
): Promise<BacklogEstimateResult | null> {
  if (squad.methodology !== "sprint") return null;
  const next = await fetchNextSprint(squad.boardId);
  if (!next) return null;

  const fields = ["issuetype", "status", "timetracking"];
  const notDone = `status not in (${DONE_LIST})`;
  const active = await fetchActiveSprint(squad.boardId);
  const [selectedRaw, sprintRaw] = await Promise.all([
    searchAll(`project = "${squad.project}" AND status = "${SELECTED_FOR_DEVELOPMENT}" AND issuetype in ${STANDARD_TYPES} AND ${EXCLUDED}`, [...fields, SPRINT_FIELD], false),
    searchAll(`project = "${squad.project}" AND sprint = ${next.id} AND issuetype in ${STANDARD_TYPES} AND ${EXCLUDED} AND ${notDone}`, fields, false),
  ]);
  const keep = (r: RawSearchIssue) => !typeFilter || typeFilter(r.fields.issuetype.name);
  // Card em Selected for Development que já está na sprint VIGENTE é trabalho da sprint atual: fica fora do backlog
  const inActive = (r: RawSearchIssue) =>
    !!active && ((r.fields[SPRINT_FIELD] as { id: number }[] | null | undefined) ?? []).some((s) => s.id === active.id);
  const inSprint = new Map(sprintRaw.filter(keep).map((r) => [r.key, r]));
  const selectedInActive = selectedRaw.filter((r) => keep(r) && !inSprint.has(r.key) && inActive(r)).map((r) => r.key);
  const selected = new Map(selectedRaw.filter((r) => keep(r) && !inActive(r)).map((r) => [r.key, r]));
  // União sem repetir: o card da próxima sprint prevalece
  const cardsRaw = new Map<string, RawSearchIssue>([...selected, ...inSprint]);
  const keys = [...cardsRaw.keys()];

  // Subtasks de todos esses cards (de qualquer sprint): abertas somam; concluídas e canceladas só descontam do card
  const subs: AllocationSub[] = [];
  for (let i = 0; i < keys.length; i += KEYS_PER_QUERY) {
    const chunk = keys.slice(i, i + KEYS_PER_QUERY).join(",");
    const [open, done, canceled] = await Promise.all([
      searchAll(`parent in (${chunk}) AND issuetype in ${SUBTASK_TYPES} AND ${EXCLUDED} AND ${notDone}`, ["parent", "timetracking"], false),
      searchAll(`parent in (${chunk}) AND issuetype in ${SUBTASK_TYPES} AND status in (${DONE_LIST})`, ["parent", "timetracking"], false),
      searchAll(`parent in (${chunk}) AND issuetype in ${SUBTASK_TYPES} AND ${CANCELED}`, ["parent", "timetracking"], false),
    ]);
    for (const r of open) if (!hasCanceledParent(r)) subs.push({ key: r.key, parentKey: r.fields.parent?.key ?? null, hours: hoursOf(r), doneAtMs: null });
    // doneAtMs = 0 + isPrior(d !== null): trabalho já feito, só desconta da estimativa do card
    for (const r of done) subs.push({ key: r.key, parentKey: r.fields.parent?.key ?? null, hours: hoursOf(r), doneAtMs: 0 });
    for (const r of canceled) subs.push({ key: r.key, parentKey: r.fields.parent?.key ?? null, hours: hoursOf(r), doneAtMs: null, canceled: true });
  }
  const subsByParent = new Map<string, AllocationSub[]>();
  for (const s of subs) {
    if (!s.parentKey) continue;
    const list = subsByParent.get(s.parentKey) ?? [];
    list.push(s);
    subsByParent.set(s.parentKey, list);
  }

  const isPrior = (d: number | null) => d !== null;
  const group = (): BacklogGroup => ({ cards: 0, hours: 0 });
  const inNextSprint = group();
  const onlySelected = group();
  const unestimatedCards: string[] = [];
  for (const [key, r] of cardsRaw) {
    const card: AllocationCard = { key, estimateHours: hoursOf(r), doneAtMs: null };
    const own = subsByParent.get(key) ?? [];
    const h = sprintAllocationHours([card], own, isPrior).total;
    const target = inSprint.has(key) ? inNextSprint : onlySelected;
    target.cards += 1;
    target.hours += h;
    if (hoursOf(r) <= 0 && !own.some((s) => !s.canceled && s.hours > 0)) unestimatedCards.push(key);
  }
  inNextSprint.hours = round1(inNextSprint.hours);
  onlySelected.hours = round1(onlySelected.hours);
  const inBoth = [...inSprint.keys()].filter((k) => selected.has(k)).length;

  // Capacidade da próxima sprint (formato atual: pessoas × 6h × dias úteis)
  const config = await loadCapacityConfig(squad.slug).catch(() => ({} as Record<string, { teamSize: number; businessDays?: number }>));
  const entry = config[String(next.id)];
  const teamSize = entry?.teamSize ?? squad.teamSize;
  const autoDays = next.startDate && next.endDate ? businessDaysListBrt(next.startDate, next.endDate).length : undefined;
  const businessDays = entry?.businessDays || autoDays || FALLBACK_BUSINESS_DAYS;
  // Horas por dia da configuração global (Central Administrativa); sem configuração, 6h
  const hoursPerDay = await getGlobalHoursPerDay();

  return {
    nextSprint: { id: next.id, name: (await getSprintNamer())(next.name, next.startDate ?? new Date().toISOString()), startDate: next.startDate, endDate: next.endDate },
    capacity: { teamSize, businessDays, availableHours: teamSize * hoursPerDay * businessDays, hoursPerDay },
    total: { cards: inNextSprint.cards + onlySelected.cards, hours: round1(inNextSprint.hours + onlySelected.hours) },
    inNextSprint,
    onlySelected,
    inBoth,
    unestimatedCards: unestimatedCards.sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
    excludedInActiveSprint: selectedInActive.sort((a, b) => a.localeCompare(b, "en", { numeric: true })),
    asOf: new Date().toISOString(),
  };
}
