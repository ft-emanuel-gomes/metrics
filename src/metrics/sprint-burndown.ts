import type { StatusTransition } from "@/services/jira-changelog";
import { CYCLE_TIME_END_STATUSES } from "@/config/status-mapping";

/**
 * Burndown da sprint vigente (quantidade de CARDS).
 * Regras de negócio:
 * - Comprometido = cards que já estavam na sprint no início dela.
 * - Adicionado = cards que entraram na sprint depois do início (a linha sobe).
 * - Concluído = status atual Concluído; a data é a ÚLTIMA transição para Concluído (nunca resolutiondate).
 * - Restante(t) = cards no escopo até t que ainda não tinham sido concluídos em t.
 * - Linha ideal: do comprometido no início até zero no fim da sprint (linear, dias corridos).
 */

const DAY_MS = 86_400_000;
/** Brasília (sem horário de verão desde 2019). */
const BR_OFFSET_H = 3;

export interface BurndownIssue {
  key: string;
  issueType: string;
  /** Status ATUAL */
  status: string;
  created: string;
  transitions: StatusTransition[];
  /** Peso do item: 1 por card (padrão) ou horas do Original Estimate (burndown de subtasks). */
  weight?: number;
  /** Quando entrou na sprint vigente (changelog do campo Sprint). Ausente = nasceu nela. */
  sprintAddedAt?: string;
}

export interface BurndownSprintInfo {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
}

export interface BurndownRow {
  /** Dias desde o início da sprint (fracionário). */
  x: number;
  /** Instante (ISO 8601). */
  at: string;
  ideal: number;
  /** null depois de "agora". */
  remaining: number | null;
}

export interface SprintBurndownResult {
  sprint: BurndownSprintInfo;
  /** cards = standard issues (quantidade); hours = subtasks (Original Estimate em horas) */
  unit: "cards" | "hours";
  /** Subtasks da sprint sem Original Estimate (só no modo horas) */
  unestimated?: string[];
  asOf: string;
  /** Duração da sprint em dias (x do último ponto da linha ideal). */
  totalDays: number;
  committed: number;
  added: number;
  completed: number;
  remaining: number;
  /** Restante ideal em "agora". */
  idealNow: number;
  rows: BurndownRow[];
  /** Marcos de meia-noite (x e rótulo dd) para o eixo. */
  dayTicks: { x: number; label: string }[];
}

function doneAt(issue: BurndownIssue): number | null {
  if (!CYCLE_TIME_END_STATUSES.has(issue.status)) return null; // revertido/aberto
  for (let i = issue.transitions.length - 1; i >= 0; i--) {
    if (CYCLE_TIME_END_STATUSES.has(issue.transitions[i].toStatus)) return new Date(issue.transitions[i].timestamp).getTime();
  }
  return new Date(issue.sprintAddedAt || issue.created).getTime();
}

function scopeAt(issue: BurndownIssue): number {
  return new Date(issue.sprintAddedAt || issue.created).getTime();
}

/** Meia-noite (Brasília) do dia seguinte a `ms`, k dias à frente. */
function brMidnight(startMs: number, k: number): number {
  const local = new Date(startMs - BR_OFFSET_H * 3_600_000);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + k, BR_OFFSET_H, 0, 0, 0);
}

function fmtDay(ms: number): string {
  const d = new Date(ms - BR_OFFSET_H * 3_600_000);
  return String(d.getUTCDate()).padStart(2, "0");
}

export function calculateSprintBurndown(
  issues: BurndownIssue[],
  sprint: BurndownSprintInfo,
  now: Date = new Date(),
  unit: "cards" | "hours" = "cards"
): SprintBurndownResult {
  const startMs = new Date(sprint.startDate).getTime();
  const endMs = new Date(sprint.endDate).getTime();
  const nowMs = Math.min(Math.max(now.getTime(), startMs), endMs + DAY_MS * 365);
  const totalDays = Math.max((endMs - startMs) / DAY_MS, 1);

  // Soma de pesos: 1 por card, ou horas estimadas por subtask (arredondado em 0,1)
  const w = (i: BurndownIssue) => (i.weight === undefined ? 1 : i.weight);
  const sum = (list: BurndownIssue[]) => Math.round(list.reduce((a, i) => a + w(i), 0) * 10) / 10;
  const remainingAt = (t: number) =>
    sum(issues.filter((i) => scopeAt(i) <= t && !(doneAt(i) !== null && (doneAt(i) as number) <= t)));

  const committed = sum(issues.filter((i) => scopeAt(i) <= startMs));
  const added = sum(issues.filter((i) => scopeAt(i) > startMs));
  const completed = sum(issues.filter((i) => doneAt(i) !== null));
  const remainingNow = remainingAt(nowMs);
  const ideal = (x: number) => Math.max(committed * (1 - x / totalDays), 0);
  const xOf = (t: number) => (t - startMs) / DAY_MS;

  // Instantes amostrados: início, cada meia-noite até agora, agora
  const instants: number[] = [startMs];
  for (let k = 1; brMidnight(startMs, k) < Math.min(nowMs, endMs); k++) {
    const m = brMidnight(startMs, k);
    if (m > startMs) instants.push(m);
  }
  const lastReal = Math.min(nowMs, endMs);
  if (lastReal > instants[instants.length - 1]) instants.push(lastReal);

  const rows: BurndownRow[] = instants.map((t) => ({
    x: Math.round(xOf(t) * 1000) / 1000,
    at: new Date(t).toISOString(),
    ideal: Math.round(ideal(xOf(t)) * 100) / 100,
    remaining: remainingAt(t),
  }));
  // Ponto final da linha ideal (fim da sprint)
  if (endMs > instants[instants.length - 1]) {
    rows.push({ x: Math.round(totalDays * 1000) / 1000, at: new Date(endMs).toISOString(), ideal: 0, remaining: null });
  }

  const dayTicks: { x: number; label: string }[] = [];
  for (let k = 1; brMidnight(startMs, k) < endMs; k++) {
    const m = brMidnight(startMs, k);
    if (m > startMs) dayTicks.push({ x: Math.round(xOf(m) * 1000) / 1000, label: fmtDay(m) });
  }

  return {
    sprint,
    unit,
    asOf: now.toISOString(),
    totalDays: Math.round(totalDays * 1000) / 1000,
    committed,
    added,
    completed,
    remaining: remainingNow,
    idealNow: Math.round(ideal(xOf(Math.min(nowMs, endMs))) * 10) / 10,
    rows,
    dayTicks,
  };
}
