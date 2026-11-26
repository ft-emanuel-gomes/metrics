/**
 * Horas por dia padrão (global) com data de vigência (funções puras).
 *
 * Regras de negócio:
 * - Cada mudança das horas por dia globais vale a partir de uma data (ex.: 8h a partir de 01/12). O histórico fica
 *   guardado: 6h até 30/11, 8h de 01/12 em diante.
 * - Uma sprint usa o valor vigente na DATA DE INÍCIO dela. A sprint em andamento não muda no meio; as concluídas
 *   ficam com o valor da época. Sprint sem data no Jira usa o valor vigente hoje.
 * - A data de vigência não pode ser anterior ao início da sprint vigente (nem estar no passado): precisa ser
 *   posterior ao início de todas as sprints vigentes e igual ou posterior a hoje.
 * - Datas no formato AAAA-MM-DD, no fuso de Brasília.
 */

import { LEGACY_HOURS_PER_DAY, validateHoursPerDay } from "./capacity";

export interface HoursVersion {
  hoursPerDay: number;
  /** AAAA-MM-DD (Brasília) */
  effectiveFrom: string;
  createdAt?: string;
  createdBy?: string;
}

/** Vigência da versão inicial (vale para todo o histórico). */
export const BASE_EFFECTIVE_FROM = "2000-01-01";
const BRT_OFFSET_MS = 3 * 3_600_000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Data (AAAA-MM-DD) em Brasília de um instante ISO; datas já no formato AAAA-MM-DD passam direto. */
export function brtDate(iso: string | Date): string {
  if (typeof iso === "string" && YMD.test(iso)) return iso;
  const ms = typeof iso === "string" ? new Date(iso).getTime() : iso.getTime();
  return new Date(ms - BRT_OFFSET_MS).toISOString().slice(0, 10);
}

/** DD/MM/AAAA para mensagens. */
export function fmtYmd(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

/** Versões em ordem; sem histórico salvo, uma versão base com o valor antigo (ou 6h). */
export function normalizeVersions(settings: { hoursPerDayDefault?: number; hoursVersions?: HoursVersion[] } | null | undefined): HoursVersion[] {
  const list = settings?.hoursVersions?.length
    ? [...settings.hoursVersions]
    : [{ hoursPerDay: settings?.hoursPerDayDefault ?? LEGACY_HOURS_PER_DAY, effectiveFrom: BASE_EFFECTIVE_FROM }];
  return list.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/** Horas por dia vigentes numa data (a versão com a maior vigência ≤ data). */
export function hoursAt(versions: HoursVersion[], date: string | Date): number {
  const day = brtDate(date);
  let value = LEGACY_HOURS_PER_DAY;
  for (const v of [...versions].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))) {
    if (v.effectiveFrom <= day) value = v.hoursPerDay;
    else break;
  }
  return value;
}

/**
 * Menor data aceita para uma nova vigência: hoje, ou o dia seguinte ao início da sprint vigente mais recente
 * (o que for maior). Assim nenhuma sprint em andamento muda de valor.
 */
export function minEffectiveFrom(todayYmd: string, activeSprintStarts: string[]): string {
  let min = todayYmd;
  for (const s of activeSprintStarts) {
    const next = nextDay(brtDate(s));
    if (next > min) min = next;
  }
  return min;
}

export class HoursScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HoursScheduleError";
  }
}

/** Valida a data de vigência (formato e limite mínimo). */
export function validateEffectiveFrom(effectiveFrom: unknown, todayYmd: string, activeSprintStarts: string[]): string {
  if (typeof effectiveFrom !== "string" || !YMD.test(effectiveFrom) || Number.isNaN(new Date(`${effectiveFrom}T12:00:00Z`).getTime())) {
    throw new HoursScheduleError("Informe a data de início da vigência (AAAA-MM-DD).");
  }
  const min = minEffectiveFrom(todayYmd, activeSprintStarts);
  if (effectiveFrom < min) {
    throw new HoursScheduleError(`A data de vigência não pode ser anterior a ${fmtYmd(min)}: ela não pode alterar a sprint vigente nem o histórico.`);
  }
  return effectiveFrom;
}

/**
 * Agenda uma nova versão. Versões futuras com vigência igual ou posterior são substituídas
 * (a nova regra passa a valer daquela data em diante).
 */
export function scheduleVersion(versions: HoursVersion[], v: HoursVersion): HoursVersion[] {
  const hours = validateHoursPerDay(v.hoursPerDay);
  const kept = versions.filter((x) => x.effectiveFrom < v.effectiveFrom);
  if (kept.length === 0) kept.push({ hoursPerDay: LEGACY_HOURS_PER_DAY, effectiveFrom: BASE_EFFECTIVE_FROM });
  return [...kept, { ...v, hoursPerDay: hours }].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/** Cancela uma versão agendada (nunca a base nem uma já em vigor; a validação da data fica com quem chama). */
export function removeVersion(versions: HoursVersion[], effectiveFrom: string): HoursVersion[] {
  if (effectiveFrom === BASE_EFFECTIVE_FROM) throw new HoursScheduleError("A versão inicial não pode ser removida.");
  if (!versions.some((v) => v.effectiveFrom === effectiveFrom)) throw new HoursScheduleError("Agendamento não encontrado.");
  return versions.filter((v) => v.effectiveFrom !== effectiveFrom);
}

function nextDay(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
