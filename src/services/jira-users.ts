/**
 * Pessoas do Jira para a Central Administrativa (integrantes das squads).
 * - Sugestão: responsáveis (assignee) de cards e subtasks da squad nas últimas sprints.
 * - Busca por nome: /rest/api/3/user/search.
 * - Atualização de nome e foto: /rest/api/3/user/bulk.
 */

import { getJiraClient } from "./jira-client";
import { getCacheManager } from "@/cache/cache-manager";
import type { SquadConfig } from "@/config/squads";
import { fetchActiveSprint, fetchClosedSprints } from "./jira-sprints";
import { searchAll } from "./jira-burndown";

export interface JiraPerson {
  accountId: string;
  name: string;
  avatarUrl?: string;
  active: boolean;
}

export interface SuggestedPerson extends JiraPerson {
  /** Cards + subtasks com a pessoa como responsável nas sprints consideradas */
  items: number;
}

interface RawUser {
  accountId: string;
  displayName?: string;
  active?: boolean;
  accountType?: string;
  avatarUrls?: Record<string, string>;
}

const toPerson = (u: RawUser): JiraPerson => ({
  accountId: u.accountId,
  name: u.displayName || "Sem nome",
  avatarUrl: u.avatarUrls?.["48x48"] || u.avatarUrls?.["32x32"],
  active: u.active !== false,
});

const SUGGESTION_TTL_S = 600;
/** Quantas sprints concluídas entram na sugestão (além da vigente). */
const SUGGESTION_CLOSED_SPRINTS = 3;

/**
 * Responsáveis de cards e subtasks da squad nas 3 últimas sprints concluídas e na vigente, mais itens primeiro.
 * Cache de 10 minutos por squad.
 */
export async function suggestSquadMembers(squad: SquadConfig): Promise<SuggestedPerson[]> {
  const cache = getCacheManager();
  const key = `team-suggest:${squad.slug}`;
  const cached = cache.get<SuggestedPerson[]>(key);
  if (cached) return cached;

  const [closed, active] = await Promise.all([
    fetchClosedSprints(squad.boardId, SUGGESTION_CLOSED_SPRINTS).catch(() => []),
    fetchActiveSprint(squad.boardId),
  ]);
  const ids = [...closed.map((s) => s.id), ...(active ? [active.id] : [])];
  if (ids.length === 0) return [];

  const issues = await searchAll(
    `project = "${squad.project}" AND sprint in (${ids.join(",")}) AND assignee is not EMPTY`,
    ["assignee"],
    false
  );
  const byId = new Map<string, SuggestedPerson>();
  for (const r of issues) {
    const a = r.fields.assignee as RawUser | null | undefined;
    if (!a?.accountId) continue;
    const cur = byId.get(a.accountId);
    if (cur) cur.items += 1;
    else byId.set(a.accountId, { ...toPerson(a), items: 1 });
  }
  const result = [...byId.values()].sort((x, y) => y.items - x.items || x.name.localeCompare(y.name, "pt-BR"));
  cache.set(key, result, SUGGESTION_TTL_S);
  return result;
}

/** Busca pessoas do Jira pelo nome (mínimo de 2 caracteres). Só usuários ativos do tipo atlassian. */
export async function searchJiraUsers(query: string): Promise<JiraPerson[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const users = await getJiraClient().get<RawUser[]>("/rest/api/3/user/search", { query: q, maxResults: 20 });
  return users.filter((u) => u.active !== false && u.accountType === "atlassian").map(toPerson);
}

/** Nome e foto atuais no Jira de uma lista de pessoas (em lotes de 50). Quem não vier na resposta fica de fora. */
export async function fetchJiraUsers(accountIds: string[]): Promise<Map<string, JiraPerson>> {
  const out = new Map<string, JiraPerson>();
  const unique = [...new Set(accountIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const qs = batch.map((id) => `accountId=${encodeURIComponent(id)}`).join("&");
    const res = await getJiraClient().get<{ values: RawUser[] }>(`/rest/api/3/user/bulk?${qs}&maxResults=50`);
    for (const u of res.values ?? []) out.set(u.accountId, toPerson(u));
  }
  return out;
}

/** Busca uma pessoa do Jira pelo accountId (para vincular com nome e foto corretos). */
export async function fetchJiraUser(accountId: string): Promise<JiraPerson | null> {
  const map = await fetchJiraUsers([accountId]);
  return map.get(accountId) ?? null;
}
