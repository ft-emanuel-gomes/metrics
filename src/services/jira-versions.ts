import { getJiraClient } from "./jira-client";
import { getCacheManager } from "@/cache/cache-manager";
import { CACHE_TTLS } from "@/config/jira";

/**
 * Informações de uma fixVersion (Release) do Jira.
 */
export interface JiraVersion {
  id: string;
  name: string;
  startDate?: string;    // YYYY-MM-DD
  releaseDate?: string;  // YYYY-MM-DD
  released: boolean;
}

/**
 * Busca todas as versions de um projeto.
 * Usado para identificar a release ativa dinamicamente.
 */
export async function fetchProjectVersions(projectKey: string): Promise<JiraVersion[]> {
  const cache = getCacheManager();
  const cacheKey = `versions:${projectKey}`;

  const cached = cache.get<JiraVersion[]>(cacheKey);
  if (cached) return cached;

  const client = getJiraClient();
  const response = await client.get<JiraVersion[]>(
    `/rest/api/3/project/${projectKey}/versions`
  );

  // Filtrar apenas releases com padrão "R1", "R2", etc.
  const releases = response
    .filter((v) => /^R\d+/.test(v.name))
    .map((v) => ({
      id: v.id,
      name: v.name,
      startDate: v.startDate,
      releaseDate: v.releaseDate,
      released: v.released || false,
    }));

  cache.set(cacheKey, releases, CACHE_TTLS.r2);
  return releases;
}

/**
 * Identifica a release ativa com base na data atual.
 * A release ativa é aquela onde hoje está entre startDate e releaseDate.
 * Se nenhuma estiver ativa, retorna a próxima futura.
 */
export function findActiveRelease(
  versions: JiraVersion[],
  referenceDate: Date = new Date()
): JiraVersion | null {
  const today = referenceDate.toISOString().split("T")[0];

  // Buscar release onde hoje está entre start e end
  const active = versions.find((v) => {
    if (!v.startDate || !v.releaseDate) return false;
    return v.startDate <= today && today <= v.releaseDate;
  });

  if (active) return active;

  // Se não encontrou, buscar a próxima futura (não released)
  const future = versions
    .filter((v) => v.startDate && v.startDate > today && !v.released)
    .sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));

  return future[0] || null;
}
