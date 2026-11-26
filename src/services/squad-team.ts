/**
 * Integrantes da squad e horas por dia (Central Administrativa), guardados no S3.
 * - config/settings.json: horas por dia padrão global (inicialmente 6h), com histórico por data de vigência
 *   (cada sprint usa o valor vigente na data de início dela; ver src/metrics/hours-schedule.ts).
 * - config/team/{slug}.json: integrantes vinculados (pelo accountId do Jira) e horas por dia da squad.
 *
 * Regras de negócio:
 * - Desvincular é lógico (removedAt): o histórico das sprints já salvas continua com a pessoa.
 * - Uma pessoa pode estar em mais de uma squad (cada squad tem o seu arquivo).
 * - Horas por dia: integrante (ajuste na sprint) → squad → global.
 */

import { readConfig, updateConfig, type Audited } from "./config-store";
import { LEGACY_HOURS_PER_DAY, validateHoursPerDay } from "@/metrics/capacity";
import {
  brtDate,
  hoursAt,
  normalizeVersions,
  removeVersion,
  scheduleVersion,
  validateEffectiveFrom,
  type HoursVersion,
} from "@/metrics/hours-schedule";
import type { JiraPerson } from "./jira-users";

export interface GlobalSettings {
  /** Horas por dia vigentes HOJE (informativo; a regra de cada sprint vem de hoursVersions pela data de início) */
  hoursPerDayDefault: number;
  /** Histórico das horas por dia globais, cada uma com a data de vigência */
  hoursVersions?: HoursVersion[];
}

export interface TeamMember {
  accountId: string;
  name: string;
  avatarUrl?: string;
  addedAt: string;
  addedBy: string;
  /** Desvinculado (lógico); ausente = ativo */
  removedAt?: string;
  removedBy?: string;
  /** Pessoa inativa no Jira (atualizado ao conferir no Jira) */
  inactiveInJira?: boolean;
}

export interface SquadTeam {
  /** Horas por dia da squad; ausente = padrão global */
  hoursPerDay?: number;
  members: TeamMember[];
}

const SETTINGS_KEY = "config/settings.json";
const teamKey = (slug: string) => `config/team/${slug}.json`;

export const DEFAULT_SETTINGS: GlobalSettings = { hoursPerDayDefault: LEGACY_HOURS_PER_DAY };

/** Configuração global com o histórico normalizado; hoursPerDayDefault = valor vigente hoje. */
export async function getGlobalSettings(): Promise<GlobalSettings & { hoursVersions: HoursVersion[] } & Partial<Audited>> {
  const { data } = await readConfig<GlobalSettings & Audited>(SETTINGS_KEY);
  const hoursVersions = normalizeVersions(data);
  return { ...DEFAULT_SETTINGS, ...(data ?? {}), hoursVersions, hoursPerDayDefault: hoursAt(hoursVersions, new Date()) };
}

/** Horas por dia globais vigentes numa data (início da sprint); sem data, hoje. */
export async function getGlobalHoursAt(date?: string | Date | null): Promise<number> {
  const s = await getGlobalSettings();
  return hoursAt(s.hoursVersions, date ?? new Date());
}

/**
 * Agenda novas horas por dia globais a partir de uma data (ex.: 8h a partir de 01/12).
 * `activeSprintStarts` = início das sprints vigentes de todas as squads (a vigência não pode ser anterior).
 */
export async function scheduleGlobalHours(hoursPerDay: number, effectiveFrom: unknown, actor: string, activeSprintStarts: string[]): Promise<HoursVersion[]> {
  const hours = validateHoursPerDay(hoursPerDay);
  const from = validateEffectiveFrom(effectiveFrom, brtDate(new Date()), activeSprintStarts);
  const version: HoursVersion = { hoursPerDay: hours, effectiveFrom: from, createdAt: new Date().toISOString(), createdBy: actor };
  const saved = await updateConfig<GlobalSettings>(
    SETTINGS_KEY,
    (cur) => {
      const versions = scheduleVersion(normalizeVersions(cur), version);
      return { ...(cur ?? DEFAULT_SETTINGS), hoursVersions: versions, hoursPerDayDefault: hoursAt(versions, new Date()) };
    },
    { actor }
  );
  return normalizeVersions(saved as GlobalSettings | null);
}

/** Cancela um agendamento ainda não em vigor (mesma regra de data mínima). */
export async function cancelScheduledGlobalHours(effectiveFrom: unknown, actor: string, activeSprintStarts: string[]): Promise<HoursVersion[]> {
  const from = validateEffectiveFrom(effectiveFrom, brtDate(new Date()), activeSprintStarts);
  const saved = await updateConfig<GlobalSettings>(
    SETTINGS_KEY,
    (cur) => {
      const versions = removeVersion(normalizeVersions(cur), from);
      return { ...(cur ?? DEFAULT_SETTINGS), hoursVersions: versions, hoursPerDayDefault: hoursAt(versions, new Date()) };
    },
    { actor }
  );
  return normalizeVersions(saved as GlobalSettings | null);
}

export async function getSquadTeam(slug: string): Promise<SquadTeam & Partial<Audited>> {
  const { data } = await readConfig<SquadTeam & Audited>(teamKey(slug));
  return data ?? { members: [] };
}

/** Integrantes ativos (não desvinculados), na ordem em que foram vinculados. */
export function activeMembers(team: SquadTeam): TeamMember[] {
  return team.members.filter((m) => !m.removedAt);
}

/** Horas por dia padrão da squad (squad → global vigente na data; sem data, hoje). */
export async function getSquadDefaultHours(slug: string, date?: string | Date | null): Promise<number> {
  const [team, globalHours] = await Promise.all([getSquadTeam(slug), getGlobalHoursAt(date)]);
  return team.hoursPerDay ?? globalHours;
}

/** Vincula uma pessoa do Jira à squad (ou revincula, se tinha sido desvinculada). */
export async function addTeamMember(slug: string, person: JiraPerson, actor: string): Promise<SquadTeam> {
  const now = new Date().toISOString();
  const res = await updateConfig<SquadTeam>(
    teamKey(slug),
    (cur) => {
      const team: SquadTeam = cur ?? { members: [] };
      const existing = team.members.find((m) => m.accountId === person.accountId);
      if (existing && !existing.removedAt) return undefined; // já vinculado
      const others = team.members.filter((m) => m.accountId !== person.accountId);
      return {
        ...team,
        members: [
          ...others,
          { accountId: person.accountId, name: person.name, avatarUrl: person.avatarUrl, addedAt: now, addedBy: actor, inactiveInJira: !person.active || undefined },
        ],
      };
    },
    { actor }
  );
  return (res as SquadTeam | null) ?? { members: [] };
}

/** Desvincula (lógico): mantém o registro com removedAt. */
export async function removeTeamMember(slug: string, accountId: string, actor: string): Promise<SquadTeam> {
  const now = new Date().toISOString();
  const res = await updateConfig<SquadTeam>(
    teamKey(slug),
    (cur) => {
      if (!cur) return undefined;
      const target = cur.members.find((m) => m.accountId === accountId && !m.removedAt);
      if (!target) return undefined;
      return { ...cur, members: cur.members.map((m) => (m === target ? { ...m, removedAt: now, removedBy: actor } : m)) };
    },
    { actor }
  );
  return (res as SquadTeam | null) ?? { members: [] };
}

/** Define (ou limpa, com null) as horas por dia da squad. */
export async function setSquadHoursPerDay(slug: string, hours: number | null, actor: string): Promise<SquadTeam> {
  const value = hours === null ? undefined : validateHoursPerDay(hours);
  const res = await updateConfig<SquadTeam>(
    teamKey(slug),
    (cur) => {
      const team: SquadTeam = cur ?? { members: [] };
      const next: SquadTeam = { ...team };
      if (value === undefined) delete next.hoursPerDay;
      else next.hoursPerDay = value;
      return next;
    },
    { actor }
  );
  return (res as SquadTeam | null) ?? { members: [] };
}

/**
 * Atualiza nome, foto e situação dos integrantes com o que veio do Jira. Só grava se algo mudou.
 * Quem não voltou do Jira é marcado como inativo.
 */
export async function syncTeamProfiles(slug: string, fromJira: Map<string, JiraPerson>, actor: string): Promise<SquadTeam> {
  const res = await updateConfig<SquadTeam>(
    teamKey(slug),
    (cur) => {
      if (!cur) return undefined;
      let changed = false;
      const members = cur.members.map((m) => {
        if (m.removedAt) return m;
        const p = fromJira.get(m.accountId);
        const inactive = !p || !p.active;
        const next = p ? { ...m, name: p.name, avatarUrl: p.avatarUrl } : { ...m };
        if (inactive) next.inactiveInJira = true;
        else delete next.inactiveInJira;
        if (next.name !== m.name || next.avatarUrl !== m.avatarUrl || !!next.inactiveInJira !== !!m.inactiveInJira) changed = true;
        return next;
      });
      return changed ? { ...cur, members } : undefined;
    },
    { actor }
  );
  return (res as SquadTeam | null) ?? { members: [] };
}
