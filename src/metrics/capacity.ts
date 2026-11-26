/**
 * Capacidade do time por integrante (funções puras).
 *
 * Regras de negócio:
 * - Capacidade = Σ (horas por dia do integrante × % de atuação do integrante) × dias úteis da sprint.
 *   Ex.: 5 integrantes a 100% e 1 a 50%, 6h/dia, 10 dias úteis → 5,5 × 6 × 10 = 330h.
 * - 0% = ausência na sprint (férias, afastamento): o integrante segue listado, mas não soma.
 * - Pessoas (headcount) = integrantes com % maior que 0; pessoas-equivalentes (fte) = Σ % / 100.
 * - Horas por dia: padrão global → padrão da squad → ajuste do integrante na sprint (override).
 * - A herança para a próxima sprint copia SÓ a configuração (integrantes, % e horas). Nunca usa horas
 *   alocadas, logadas nem a ocupação: quem tinha 60h de capacidade e alocou 30h herda os 60h.
 */

/** Passos aceitos na tela e na API. */
export const ALLOCATION_STEP = 5;
export const HOURS_STEP = 0.5;
export const MIN_HOURS_PER_DAY = 1;
export const MAX_HOURS_PER_DAY = 12;
/** Horas por dia usadas até esta feature (sprints concluídas no formato antigo ficam com este valor). */
export const LEGACY_HOURS_PER_DAY = 6;

/** Configuração de um integrante numa sprint. */
export interface SprintMemberCapacity {
  accountId: string;
  /** 0..100, passo de 5 */
  allocationPct: number;
  /** Valor efetivo gravado (congela o histórico) */
  hoursPerDay: number;
  /** true = ajuste do administrador; false = segue o padrão da squad/global */
  hoursOverride: boolean;
}

export interface CapacityTotals {
  capacityHours: number;
  /** Integrantes com % > 0 */
  headcount: number;
  /** Pessoas-equivalentes: Σ % / 100 */
  fte: number;
  /** Σ (horas por dia × %): horas do time por dia útil */
  hoursPerDayTotal: number;
  businessDays: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Soma a capacidade da sprint a partir da configuração de cada integrante. */
export function computeCapacity(members: SprintMemberCapacity[], businessDays: number): CapacityTotals {
  const days = Math.max(0, businessDays);
  let perDay = 0;
  let fte = 0;
  let headcount = 0;
  for (const m of members) {
    const pct = clampPct(m.allocationPct) / 100;
    if (pct <= 0) continue;
    headcount += 1;
    fte += pct;
    perDay += m.hoursPerDay * pct;
  }
  return {
    capacityHours: round1(perDay * days),
    headcount,
    fte: round1(fte * 100) / 100,
    hoursPerDayTotal: round1(perDay),
    businessDays: days,
  };
}

/** Capacidade no formato antigo (pessoas × horas por dia × dias). */
export function computeLegacyCapacity(teamSize: number, hoursPerDay: number, businessDays: number): CapacityTotals {
  return {
    capacityHours: round1(teamSize * hoursPerDay * businessDays),
    headcount: teamSize,
    fte: teamSize,
    hoursPerDayTotal: round1(teamSize * hoursPerDay),
    businessDays,
  };
}

/** Horas por dia efetivas: ajuste do integrante → padrão da squad → padrão global. */
export function effectiveHoursPerDay(defaults: { global: number; squad?: number }): number {
  return defaults.squad ?? defaults.global;
}

/**
 * Configuração herdada para a próxima sprint (ou padrão, sem sprint anterior).
 * - Integrante que continua na squad: mantém o % e, se tinha override, as horas; sem override, horas padrão atuais.
 * - Integrante novo: 100% e horas padrão.
 * - Integrante desvinculado: sai.
 * Recebe só configuração; não há parâmetro para horas alocadas ou logadas (regra de negócio).
 */
export function inheritSprintCapacity(
  previous: SprintMemberCapacity[] | null,
  currentMemberIds: string[],
  defaultHoursPerDay: number
): SprintMemberCapacity[] {
  const prev = new Map((previous ?? []).map((m) => [m.accountId, m]));
  return currentMemberIds.map((accountId) => {
    const p = prev.get(accountId);
    if (!p) return { accountId, allocationPct: 100, hoursPerDay: defaultHoursPerDay, hoursOverride: false };
    return {
      accountId,
      allocationPct: clampPct(p.allocationPct),
      hoursPerDay: p.hoursOverride ? p.hoursPerDay : defaultHoursPerDay,
      hoursOverride: p.hoursOverride,
    };
  });
}

/**
 * Reaplica os padrões numa configuração já existente de sprint editável (integrantes ou horas padrão mudaram).
 * Mantém o % de quem continua; atualiza as horas de quem não tem override; inclui novos a 100% e tira desvinculados.
 */
export function refreshSprintCapacity(
  current: SprintMemberCapacity[],
  currentMemberIds: string[],
  defaultHoursPerDay: number
): SprintMemberCapacity[] {
  return inheritSprintCapacity(current, currentMemberIds, defaultHoursPerDay);
}

/** Valida e normaliza o % de atuação (0..100, passo de 5). Lança erro com mensagem para a API. */
export function validateAllocationPct(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100 || Math.abs(n / ALLOCATION_STEP - Math.round(n / ALLOCATION_STEP)) > 1e-9) {
    throw new Error("O % de atuação deve ser de 0 a 100, em passos de 5.");
  }
  return Math.round(n);
}

/** Valida as horas por dia (1 a 12, passo de 0,5). */
export function validateHoursPerDay(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < MIN_HOURS_PER_DAY || n > MAX_HOURS_PER_DAY || Math.abs(n / HOURS_STEP - Math.round(n / HOURS_STEP)) > 1e-9) {
    throw new Error("As horas por dia devem ser de 1 a 12, em passos de 0,5.");
  }
  return n;
}

function clampPct(v: number): number {
  return Math.min(100, Math.max(0, Number(v) || 0));
}
