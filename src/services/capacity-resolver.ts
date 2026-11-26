/**
 * Capacidade de uma sprint: ÚNICO ponto que decide a capacidade (Capacidade da Sprint, Ocupação das
 * sprints concluídas, adapters e tela de administração). A decisão está em src/metrics/capacity-resolution.ts;
 * aqui ficam a leitura do Jira e do S3 e a materialização automática.
 *
 * Arquivos: config/capacity/{slug}/{sprintId}.json (por integrante) e config/capacity.json (legado, só leitura).
 */

import type { SquadConfig } from "@/config/squads";
import { businessDaysListBrt } from "@/lib/utils";
import { fetchAllSprints, fetchEditableSprint } from "./jira-sprints";
import { loadCapacityConfig } from "./capacity-store";
import { ConfigConflictError, deleteConfig, readConfig, updateConfig, writeConfig } from "./config-store";
import { activeMembers, getGlobalSettings, getSquadTeam, type TeamMember } from "./squad-team";
import {
  decideSprintCapacity,
  type CapacityDecision,
  type LegacyCapacityEntry,
  type SprintCapacityConfig,
} from "@/metrics/capacity-resolution";
import { refreshSprintCapacity, validateAllocationPct, validateHoursPerDay, type SprintMemberCapacity } from "@/metrics/capacity";

export type { SprintCapacityConfig } from "@/metrics/capacity-resolution";

/** Sprint de referência para a resolução. */
export interface CapacitySprintRef {
  id: number;
  name?: string;
  state: "closed" | "active" | "future";
  startDate?: string;
  /** Fim usado para os dias úteis automáticos (cada chamador mantém a data que já usava) */
  endDate?: string;
}

export interface ResolvedMember extends SprintMemberCapacity {
  name: string;
  avatarUrl?: string;
  inactiveInJira?: boolean;
  /** Desvinculado da squad (só aparece em configuração já gravada de sprint concluída) */
  removed?: boolean;
}

export interface ResolvedCapacity extends Omit<CapacityDecision, "members" | "materialize"> {
  sprintId: number;
  editable: boolean;
  /** Horas por dia padrão (squad → global) */
  hoursPerDayDefault: number;
  /** Dias úteis pelas datas do Jira */
  autoBusinessDays?: number;
  inheritedFromSprintName?: string;
  members: ResolvedMember[];
}

const SYSTEM_ACTOR = "sistema";
/** Quantas sprints anteriores procurar por configuração para herdar. */
const INHERIT_LOOKBACK = 8;
const sprintKey = (slug: string, sprintId: number) => `config/capacity/${slug}/${sprintId}.json`;

export async function getSprintCapacityConfig(slug: string, sprintId: number): Promise<SprintCapacityConfig | null> {
  return (await readConfig<SprintCapacityConfig>(sprintKey(slug, sprintId))).data;
}

/** A sprint aceita ajuste? Vigente, ou a próxima quando não há vigente (mesma regra atual da Capacidade). */
async function isEditable(squad: SquadConfig, sprint: CapacitySprintRef): Promise<boolean> {
  if (sprint.state === "active") return true;
  if (sprint.state === "closed") return false;
  const editable = await fetchEditableSprint(squad.boardId);
  return editable?.id === sprint.id;
}

/** Configuração por integrante da sprint anterior mais próxima (por data de início). */
async function findPreviousConfig(
  squad: SquadConfig,
  sprint: CapacitySprintRef
): Promise<{ sprintId: number; name: string; config: SprintCapacityConfig } | null> {
  const all = await fetchAllSprints(squad.boardId).catch(() => []);
  const startMs = sprint.startDate ? new Date(sprint.startDate).getTime() : Number.POSITIVE_INFINITY;
  const candidates = all
    .filter((s) => s.id !== sprint.id && new Date(s.startDate).getTime() < startMs)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
    .slice(0, INHERIT_LOOKBACK);
  for (const s of candidates) {
    const config = await getSprintCapacityConfig(squad.slug, s.id);
    if (config) return { sprintId: s.id, name: s.name, config };
  }
  return null;
}

function enrich(members: SprintMemberCapacity[], team: TeamMember[]): ResolvedMember[] {
  const byId = new Map(team.map((m) => [m.accountId, m]));
  return members.map((m) => {
    const t = byId.get(m.accountId);
    return { ...m, name: t?.name ?? "Integrante", avatarUrl: t?.avatarUrl, inactiveInJira: t?.inactiveInJira, removed: !!t?.removedAt || !t };
  });
}

/**
 * Resolve a capacidade da sprint. Para sprint editável resolvida por herança ou padrão, grava a configuração
 * automaticamente (autor "sistema"), a menos que `materialize: false`.
 */
export async function resolveSprintCapacity(
  squad: SquadConfig,
  sprint: CapacitySprintRef,
  opts: { materialize?: boolean } = {}
): Promise<ResolvedCapacity> {
  const [own, legacyAll, team, settings, editable] = await Promise.all([
    getSprintCapacityConfig(squad.slug, sprint.id),
    loadCapacityConfig(squad.slug).catch(() => ({} as Record<string, LegacyCapacityEntry>)),
    getSquadTeam(squad.slug),
    getGlobalSettings(),
    isEditable(squad, sprint),
  ]);
  const legacy = (legacyAll[String(sprint.id)] as LegacyCapacityEntry | undefined) ?? null;
  const defaultHours = team.hoursPerDay ?? settings.hoursPerDayDefault;
  const previous = !own && editable ? await findPreviousConfig(squad, sprint) : null;
  const autoBusinessDays = sprint.startDate && sprint.endDate ? businessDaysListBrt(sprint.startDate, sprint.endDate).length : undefined;

  let decision = decideSprintCapacity({
    sprintId: sprint.id,
    editable,
    autoBusinessDays,
    own,
    previous: previous ? { sprintId: previous.sprintId, config: previous.config } : null,
    legacy,
    activeMemberIds: activeMembers(team).map((m) => m.accountId),
    defaultHoursPerDay: defaultHours,
    squadTeamSize: squad.teamSize,
  });

  if (decision.materialize && opts.materialize !== false) {
    try {
      await writeConfig(sprintKey(squad.slug, sprint.id), decision.materialize, { actor: SYSTEM_ACTOR, ifNoneMatch: true });
    } catch (error) {
      if (error instanceof ConfigConflictError) {
        // Outra requisição materializou antes: usa o que foi gravado
        const saved = await readConfig<SprintCapacityConfig>(sprintKey(squad.slug, sprint.id), { fresh: true });
        if (saved.data) {
          decision = decideSprintCapacity({
            sprintId: sprint.id, editable, autoBusinessDays, own: saved.data, previous: null, legacy,
            activeMemberIds: [], defaultHoursPerDay: defaultHours, squadTeamSize: squad.teamSize,
          });
        }
      } else {
        // Falha ao gravar não impede o cálculo: o valor resolvido continua valendo nesta leitura
        console.error(`[capacity] Falha ao materializar a capacidade de ${squad.slug}/${sprint.id}:`, error);
      }
    }
  }

  const inheritedName =
    decision.inheritedFromSprintId === undefined
      ? undefined
      : previous?.sprintId === decision.inheritedFromSprintId
      ? previous.name
      : (await fetchAllSprints(squad.boardId).catch(() => [])).find((s) => s.id === decision.inheritedFromSprintId)?.name;

  const { members, materialize: _m, ...totals } = decision;
  void _m;
  return {
    ...totals,
    sprintId: sprint.id,
    editable,
    hoursPerDayDefault: defaultHours,
    autoBusinessDays,
    inheritedFromSprintName: inheritedName,
    members: enrich(members, team.members),
  };
}

/** Ajuste do administrador numa sprint editável. */
export interface CapacityAdjustment {
  /** Dias úteis à mão; null/ausente = automático pelas datas do Jira */
  businessDays?: number | null;
  members: { accountId: string; allocationPct: number; /** null/ausente = segue o padrão */ hoursPerDay?: number | null }[];
}

export class CapacityValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CapacityValidationError";
  }
}

/** Grava o ajuste (source = ajustada). Só sprint vigente ou próxima, só integrantes ativos da squad. */
export async function saveSprintCapacityAdjustment(
  squad: SquadConfig,
  sprint: CapacitySprintRef,
  adjustment: CapacityAdjustment,
  actor: string
): Promise<ResolvedCapacity> {
  if (!(await isEditable(squad, sprint))) {
    throw new CapacityValidationError("Só é possível ajustar a sprint vigente ou a próxima.");
  }
  const [team, settings] = await Promise.all([getSquadTeam(squad.slug), getGlobalSettings()]);
  const defaultHours = team.hoursPerDay ?? settings.hoursPerDayDefault;
  const active = new Set(activeMembers(team).map((m) => m.accountId));
  const seen = new Set<string>();
  let members: SprintMemberCapacity[];
  try {
    members = adjustment.members.map((m) => {
      if (!active.has(m.accountId)) throw new CapacityValidationError("Há integrante que não está vinculado à squad.");
      if (seen.has(m.accountId)) throw new CapacityValidationError("Integrante repetido.");
      seen.add(m.accountId);
      const override = m.hoursPerDay !== null && m.hoursPerDay !== undefined;
      return {
        accountId: m.accountId,
        allocationPct: validateAllocationPct(m.allocationPct),
        hoursPerDay: override ? validateHoursPerDay(m.hoursPerDay) : defaultHours,
        hoursOverride: override,
      };
    });
  } catch (error) {
    if (error instanceof CapacityValidationError) throw error;
    throw new CapacityValidationError((error as Error).message);
  }
  let businessDays: number | undefined;
  if (adjustment.businessDays !== null && adjustment.businessDays !== undefined) {
    const d = Number(adjustment.businessDays);
    if (!Number.isInteger(d) || d < 1 || d > 30) throw new CapacityValidationError("Dias úteis devem ser um número inteiro de 1 a 30.");
    businessDays = d;
  }
  const config: SprintCapacityConfig = { version: 2, source: "ajustada", members, ...(businessDays ? { businessDays } : {}) };
  await updateConfig<SprintCapacityConfig>(sprintKey(squad.slug, sprint.id), () => config, { actor });
  return resolveSprintCapacity(squad, sprint, { materialize: false });
}

/**
 * Integrantes ou horas padrão mudaram: reaplica na sprint editável já materializada.
 * - Herdada ou padrão: refaz a herança (mesma regra da resolução).
 * - Ajustada: mantém os %, atualiza as horas de quem não tem override, inclui novos a 100% e tira desvinculados.
 * Sprints concluídas nunca são tocadas.
 */
export async function refreshEditableSprintCapacity(squad: SquadConfig): Promise<void> {
  const editable = await fetchEditableSprint(squad.boardId);
  if (!editable) return;
  const key = sprintKey(squad.slug, editable.id);
  const own = await getSprintCapacityConfig(squad.slug, editable.id);
  if (!own) return; // sem configuração gravada: a próxima leitura já resolve com os dados atuais
  const [team, settings] = await Promise.all([getSquadTeam(squad.slug), getGlobalSettings()]);
  const defaultHours = team.hoursPerDay ?? settings.hoursPerDayDefault;
  const ids = activeMembers(team).map((m) => m.accountId);

  if (own.source === "ajustada") {
    await updateConfig<SprintCapacityConfig>(key, (cur) => (cur ? { ...cur, members: refreshSprintCapacity(cur.members, ids, defaultHours) } : undefined), { actor: SYSTEM_ACTOR });
    return;
  }
  const ref: CapacitySprintRef = { id: editable.id, name: editable.name, state: editable.state, startDate: editable.startDate, endDate: editable.endDate };
  const previous = await findPreviousConfig(squad, ref);
  const legacyAll = await loadCapacityConfig(squad.slug).catch(() => ({} as Record<string, LegacyCapacityEntry>));
  const decision = decideSprintCapacity({
    sprintId: editable.id,
    editable: true,
    own: null,
    previous: previous ? { sprintId: previous.sprintId, config: previous.config } : null,
    legacy: (legacyAll[String(editable.id)] as LegacyCapacityEntry | undefined) ?? null,
    activeMemberIds: ids,
    defaultHoursPerDay: defaultHours,
    squadTeamSize: squad.teamSize,
  });
  if (!decision.materialize) {
    // Sem integrantes nem herança (ex.: todos desvinculados): desfaz a materialização e volta à conta antiga
    await deleteConfig(key);
    return;
  }
  const next = decision.materialize;
  await updateConfig<SprintCapacityConfig>(key, (cur) => (cur && cur.source === "ajustada" ? undefined : next), { actor: SYSTEM_ACTOR });
}

/**
 * Capacidade das sprints concluídas exibidas no dashboard (Ocupação), resolvida antes do cálculo síncrono.
 * Usa as datas do período gravado (início e conclusão), as mesmas que a Ocupação já usava para os dias úteis.
 * Falha em uma sprint não derruba as outras: ela fica de fora e cai na conta antiga.
 */
export async function resolveCapacitiesForPeriods(
  squad: SquadConfig,
  periods: { period: { type: string; id?: number; startDate: string; endDate: string } }[]
): Promise<Map<number, { capacityHours: number; businessDays: number; headcount: number; fte: number; hoursPerDayTotal: number }>> {
  const out = new Map<number, { capacityHours: number; businessDays: number; headcount: number; fte: number; hoursPerDayTotal: number }>();
  await Promise.all(
    periods
      .filter((p) => p.period.type === "sprint" && p.period.id)
      .map(async (p) => {
        try {
          const r = await resolveSprintCapacity(
            squad,
            { id: p.period.id as number, state: "closed", startDate: p.period.startDate, endDate: p.period.endDate },
            { materialize: false }
          );
          out.set(r.sprintId, { capacityHours: r.capacityHours, businessDays: r.businessDays, headcount: r.headcount, fte: r.fte, hoursPerDayTotal: r.hoursPerDayTotal });
        } catch (error) {
          console.error(`[capacity] Falha ao resolver a capacidade de ${squad.slug}/${p.period.id}:`, error);
        }
      })
  );
  return out;
}
