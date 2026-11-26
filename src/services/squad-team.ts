/**
 * Integrantes da squad e horas por dia (Central Administrativa), guardados no S3.
 * - config/settings.json: horas por dia padrão global (inicialmente 6h).
 * - config/team/{slug}.json: integrantes vinculados (pelo accountId do Jira) e horas por dia da squad.
 *
 * Regras de negócio:
 * - Desvincular é lógico (removedAt): o histórico das sprints já salvas continua com a pessoa.
 * - Uma pessoa pode estar em mais de uma squad (cada squad tem o seu arquivo).
 * - Horas por dia: integrante (ajuste na sprint) → squad → global.
 */

import { readConfig, updateConfig, type Audited } from "./config-store";
import { LEGACY_HOURS_PER_DAY, validateHoursPerDay } from "@/metrics/capacity";
import type { JiraPerson } from "./jira-users";

export interface GlobalSettings {
  hoursPerDayDefault: number;
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

export async function getGlobalSettings(): Promise<GlobalSettings & Partial<Audited>> {
  const { data } = await readConfig<GlobalSettings & Audited>(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(data ?? {}) };
}

export async function saveGlobalSettings(hoursPerDayDefault: number, actor: string): Promise<GlobalSettings> {
  const hours = validateHoursPerDay(hoursPerDayDefault);
  await updateConfig<GlobalSettings>(SETTINGS_KEY, (cur) => ({ ...(cur ?? DEFAULT_SETTINGS), hoursPerDayDefault: hours }), { actor });
  return { hoursPerDayDefault: hours };
}

export async function getSquadTeam(slug: string): Promise<SquadTeam & Partial<Audited>> {
  const { data } = await readConfig<SquadTeam & Audited>(teamKey(slug));
  return data ?? { members: [] };
}

/** Integrantes ativos (não desvinculados), na ordem em que foram vinculados. */
export function activeMembers(team: SquadTeam): TeamMember[] {
  return team.members.filter((m) => !m.removedAt);
}

/** Horas por dia padrão da squad (squad → global). */
export async function getSquadDefaultHours(slug: string): Promise<number> {
  const [team, settings] = await Promise.all([getSquadTeam(slug), getGlobalSettings()]);
  return team.hoursPerDay ?? settings.hoursPerDayDefault;
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
