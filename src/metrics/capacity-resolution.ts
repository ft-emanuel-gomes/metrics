/**
 * Decisão da capacidade de uma sprint (função pura; o acesso ao Jira e ao S3 fica em capacity-resolver.ts).
 *
 * Ordem (regra de negócio, sem nenhuma ação manual obrigatória):
 * 1. Configuração por integrante já salva para a sprint (ajustada, herdada ou padrão) → usa.
 * 2. Sprint concluída sem configuração por integrante → formato da época: legado salvo (pessoas × 6h × dias)
 *    ou, sem legado, teamSize da squad × 6h × dias (igual a antes desta feature).
 * 3. Sprint editável (vigente ou próxima):
 *    a. existe configuração por integrante numa sprint anterior → herda (integrantes atuais, % e horas configurados);
 *    b. senão, existe legado salvo para esta sprint → continua com o legado (Requisito 6.3);
 *    c. senão, a squad tem integrantes → todos a 100% com as horas padrão (Requisito 6.4);
 *    d. senão → teamSize da squad × horas padrão × dias (igual a hoje).
 * Nos casos 3a e 3c a configuração é materializada (gravada automaticamente), para congelar o histórico quando
 * a sprint for concluída.
 */

import {
  LEGACY_HOURS_PER_DAY,
  computeCapacity,
  computeLegacyCapacity,
  inheritSprintCapacity,
  type CapacityTotals,
  type SprintMemberCapacity,
} from "./capacity";

/** Configuração por integrante gravada para uma sprint. */
export interface SprintCapacityConfig {
  version: 2;
  source: "ajustada" | "herdada" | "padrao";
  /** Sprint de onde veio a configuração (source = herdada) */
  inheritedFromSprintId?: number;
  /** Dias úteis ajustados à mão; ausente = automático pelas datas do Jira */
  businessDays?: number;
  members: SprintMemberCapacity[];
}

/** Formato antigo de config/capacity.json */
export interface LegacyCapacityEntry {
  teamSize: number;
  businessDays?: number;
}

export type CapacitySource = "ajustada" | "herdada" | "padrao" | "legado" | "time-padrao";

export interface CapacityDecisionInput {
  sprintId: number;
  /** Vigente ou próxima (única que aceita ajuste e materialização) */
  editable: boolean;
  /** Dias úteis pelas datas do Jira (fuso de Brasília); undefined = sprint sem datas */
  autoBusinessDays?: number;
  own: SprintCapacityConfig | null;
  /** Configuração por integrante da sprint anterior mais próxima (só para editável) */
  previous: { sprintId: number; config: SprintCapacityConfig } | null;
  legacy: LegacyCapacityEntry | null;
  /** Integrantes ativos da squad, em ordem */
  activeMemberIds: string[];
  /** Horas por dia padrão (squad → global) */
  defaultHoursPerDay: number;
  /** teamSize do cadastro da squad (fallback) */
  squadTeamSize: number;
}

export interface CapacityDecision extends CapacityTotals {
  source: CapacitySource;
  inheritedFromSprintId?: number;
  /** Dias úteis ajustados à mão (diferentes do automático) */
  businessDaysManual: boolean;
  /** Configuração por integrante usada (vazia para legado e time-padrão) */
  members: SprintMemberCapacity[];
  /** Pessoas e horas do formato antigo (legado e time-padrão) */
  legacy?: { teamSize: number; hoursPerDay: number };
  /** Configuração a gravar automaticamente (materialização), quando houver */
  materialize?: SprintCapacityConfig;
}

/** Sem datas e sem ajuste: mesmo padrão da tela atual (10 dias). */
const FALLBACK_BUSINESS_DAYS = 10;

export function decideSprintCapacity(input: CapacityDecisionInput): CapacityDecision {
  const auto = input.autoBusinessDays;
  const daysOf = (manual?: number) => {
    const days = manual ?? auto ?? FALLBACK_BUSINESS_DAYS;
    return { days, manual: manual !== undefined && manual !== auto };
  };

  // 1. Configuração por integrante salva
  if (input.own) {
    const { days, manual } = daysOf(input.own.businessDays ?? input.legacy?.businessDays);
    return {
      ...computeCapacity(input.own.members, days),
      source: input.own.source,
      inheritedFromSprintId: input.own.inheritedFromSprintId,
      businessDaysManual: manual,
      members: input.own.members,
    };
  }

  const legacyDecision = (entry: LegacyCapacityEntry | null, hours: number, source: "legado" | "time-padrao"): CapacityDecision => {
    const teamSize = entry?.teamSize ?? input.squadTeamSize;
    const { days, manual } = daysOf(entry?.businessDays);
    return {
      ...computeLegacyCapacity(teamSize, hours, days),
      source,
      businessDaysManual: manual,
      members: [],
      legacy: { teamSize, hoursPerDay: hours },
    };
  };

  // 2. Concluída: formato da época (sempre 6h)
  if (!input.editable) {
    return legacyDecision(input.legacy, LEGACY_HOURS_PER_DAY, input.legacy ? "legado" : "time-padrao");
  }

  // 3a. Herança da sprint anterior
  if (input.previous) {
    const members = inheritSprintCapacity(input.previous.config.members, input.activeMemberIds, input.defaultHoursPerDay);
    const materialize: SprintCapacityConfig = {
      version: 2,
      source: "herdada",
      inheritedFromSprintId: input.previous.sprintId,
      // Dias úteis ajustados à mão no legado desta sprint continuam valendo
      ...(input.legacy?.businessDays ? { businessDays: input.legacy.businessDays } : {}),
      members,
    };
    const { days, manual } = daysOf(materialize.businessDays);
    return {
      ...computeCapacity(members, days),
      source: "herdada",
      inheritedFromSprintId: input.previous.sprintId,
      businessDaysManual: manual,
      members,
      materialize,
    };
  }

  // 3b. Legado salvo para esta sprint
  if (input.legacy) return legacyDecision(input.legacy, LEGACY_HOURS_PER_DAY, "legado");

  // 3c. Integrantes a 100%
  if (input.activeMemberIds.length > 0) {
    const members = inheritSprintCapacity(null, input.activeMemberIds, input.defaultHoursPerDay);
    const materialize: SprintCapacityConfig = { version: 2, source: "padrao", members };
    const { days, manual } = daysOf(undefined);
    return { ...computeCapacity(members, days), source: "padrao", businessDaysManual: manual, members, materialize };
  }

  // 3d. Sem integrantes: teamSize da squad × horas padrão
  return legacyDecision(null, input.defaultHoursPerDay, "time-padrao");
}
