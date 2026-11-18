import { fetchAllSprints } from "./jira-sprints";
import type { JiraVersion } from "./jira-versions";
import type { SquadConfig } from "@/config/squads";
import { pickReleaseSprints, type ReleaseSprint } from "@/lib/release-calendar";
import { fetchProjectVersions } from "./jira-versions";
import { fetchR2Epics, fetchR2Features } from "./jira-search";
import { fetchChangelogsBatch } from "./jira-changelog";
import type { RawForecastBasis } from "./s3-raw-storage";

export interface ReleaseCalendarFields {
  releaseStartDate?: string;
  releaseSprints?: ReleaseSprint[];
  forecastBasis?: RawForecastBasis | null;
}

/**
 * Monta os campos do Calendário da Release para gravar no r2.json.
 * - Squads Kanban não têm sprints: grava lista vazia (o calendário não é exibido).
 * - Falha no Jira não derruba o sync: retorna vazio e o calendário é refeito na próxima leitura.
 */
async function buildCalendarOnly(
  squad: SquadConfig,
  activeRelease: JiraVersion | null
): Promise<ReleaseCalendarFields> {
  if (squad.methodology !== "sprint") return { releaseStartDate: activeRelease?.startDate, releaseSprints: [] };
  if (!activeRelease?.releaseDate) return { releaseStartDate: activeRelease?.startDate, releaseSprints: [] };

  try {
    const all = await fetchAllSprints(squad.boardId);
    const releaseSprints = pickReleaseSprints(
      all.map((s) => ({ id: s.id, name: s.name, startDate: s.startDate, endDate: s.endDate, state: s.state, completeDate: s.completeDate })),
      activeRelease.startDate,
      activeRelease.releaseDate
    );
    return { releaseStartDate: activeRelease.startDate, releaseSprints };
  } catch {
    return {};
  }
}
/**
 * Forecast automático: a base é a ÚLTIMA release encerrada (releaseDate anterior a hoje),
 * pois só ela tem ciclo completo de Épicos/Features. Ao fechar uma release, o Forecast passa
 * a olhar para ela no próximo sync. Sem release encerrada com itens da squad: null
 * (o Forecast usa a release ativa). Falha no Jira: undefined (tenta de novo no próximo sync).
 */
async function buildForecastBasis(squad: SquadConfig, activeRelease: JiraVersion | null): Promise<RawForecastBasis | null | undefined> {
  try {
    const versions = await fetchProjectVersions("EP");
    const today = new Date().toISOString().split("T")[0];
    const closed = versions
      .filter((v) => v.releaseDate && v.releaseDate < today && v.name !== activeRelease?.name)
      .sort((a, b) => (b.releaseDate || "").localeCompare(a.releaseDate || ""));
    for (const rel of closed) {
      const [epics, features] = await Promise.all([
        fetchR2Epics(rel.name, squad.teamFieldValue),
        fetchR2Features(rel.name, squad.teamFieldValue),
      ]);
      const items = [...epics, ...features];
      if (items.length === 0) continue; // squad sem itens nessa release: tenta a anterior
      const changelogs = await fetchChangelogsBatch(items.map((i) => i.key));
      return {
        releaseName: rel.name.split(" - ")[0] || rel.name,
        releaseDate: rel.releaseDate as string,
        items: items.map((i) => ({ key: i.key, issueType: i.issueType, status: i.status, transitions: changelogs.get(i.key) || [] })),
      };
    }
    return null;
  } catch {
    return undefined;
  }
}

/** Campos extras do r2.json: calendário da release ativa + base do Forecast. */
export async function buildReleaseCalendarFields(
  squad: SquadConfig,
  activeRelease: JiraVersion | null
): Promise<ReleaseCalendarFields> {
  const [calendar, forecastBasis] = await Promise.all([
    buildCalendarOnly(squad, activeRelease),
    buildForecastBasis(squad, activeRelease),
  ]);
  return forecastBasis === undefined ? calendar : { ...calendar, forecastBasis };
}

/**
 * Estado ATUAL das sprints da release direto no Jira (sem cache), para o calendário refletir
 * início e conclusão feitos no Jira entre dois Updates. Falha no Jira: retorna null (usa o gravado).
 */
export async function refreshReleaseSprints(
  squad: SquadConfig,
  calendar: { releaseStartDate?: string; releaseEndDate: string }
): Promise<ReleaseSprint[] | null> {
  if (squad.methodology !== "sprint") return null;
  try {
    const all = await fetchAllSprints(squad.boardId, { fresh: true });
    return pickReleaseSprints(
      all.map((s) => ({ id: s.id, name: s.name, startDate: s.startDate, endDate: s.endDate, state: s.state, completeDate: s.completeDate })),
      calendar.releaseStartDate,
      calendar.releaseEndDate
    );
  } catch {
    return null;
  }
}