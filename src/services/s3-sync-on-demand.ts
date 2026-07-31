/**
 * On-demand sync: busca dados de um período específico do Jira e salva no S3.
 * Usado quando o usuário seleciona uma sprint/mês que ainda não está no S3.
 */

import type { SquadConfig } from "@/config/squads";
import {
  fetchCompletedIssuesWithChangelogs,
  fetchSpilledIssues,
  fetchStandardIssuesWithEstimates,
  fetchCompletedBugs,
  fetchWipIssues,
  fetchR2Epics,
  fetchR2Features,
} from "@/services/jira-search";
import { fetchChangelogsBatch } from "@/services/jira-changelog";
import { fetchProjectVersions, findActiveRelease } from "@/services/jira-versions";
import { getLatestSprints } from "@/services/jira-sprints";
import {
  saveRawPeriod,
  saveRawWip,
  saveRawR2,
  loadRawWip,
  loadRawR2,
  type RawPeriodData,
  type RawWipData,
  type RawR2Data,
} from "./s3-raw-storage";

/**
 * Busca dados de uma sprint específica no Jira e salva no S3.
 * Retorna o RawPeriodData para uso imediato.
 */
export async function fetchAndSaveSprintPeriod(
  squad: SquadConfig,
  sprintId: number
): Promise<RawPeriodData> {
  // Buscar info da sprint para nome e datas
  const sprints = await getLatestSprints(squad.boardId, 20);
  const sprint = sprints.find((s) => s.id === sprintId);

  if (!sprint) {
    throw new Error(`Sprint ${sprintId} não encontrada no board ${squad.boardId}`);
  }

  // Issues concluídas com changelogs
  let completedIssues = await fetchCompletedIssuesWithChangelogs(
    squad.project, sprint.id, sprint.startDate, sprint.endDate
  );

  // Design extras (por período)
  const designItems = await fetchCompletedIssuesWithChangelogs(
    squad.project, null, sprint.startDate, sprint.endDate
  );
  const existingKeys = new Set(completedIssues.map((i) => i.key));
  const designExtras = designItems.filter(
    (i) => i.issueType === "Design" && !existingKeys.has(i.key)
  );
  completedIssues = [...completedIssues, ...designExtras];

  // Spillover
  const spilledIssues = await fetchSpilledIssues(
    squad.project, sprint.id, sprint.startDate, sprint.endDate
  );

  // Estimates
  const standardEstimates = await fetchStandardIssuesWithEstimates(squad.project, sprint.id);

  // Bugs
  const { bugs, subBugs } = await fetchCompletedBugs(
    squad.project, sprint.id, sprint.startDate, sprint.endDate
  );

  const num = sprint.name.match(/Sprint\s*(\d+)/i)?.[1] || sprint.name.match(/(\d+)/)?.[1] || String(sprint.id);

  const rawPeriod: RawPeriodData = {
    period: {
      type: "sprint",
      id: sprint.id,
      label: `Sprint ${num}`,
      shortName: `S${num}`,
      startDate: sprint.startDate,
      endDate: sprint.endDate,
    },
    completedIssues,
    standardEstimates,
    spilledIssues,
    bugs,
    subBugs,
  };

  // Salvar no S3 para próxima vez
  await saveRawPeriod(squad.slug, `sprint-${sprint.id}`, rawPeriod);

  return rawPeriod;
}

/**
 * Busca dados de um mês específico no Jira e salva no S3.
 * Retorna o RawPeriodData para uso imediato.
 */
export async function fetchAndSaveMonthPeriod(
  squad: SquadConfig,
  monthKey: string // "YYYY-MM"
): Promise<RawPeriodData> {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;

  const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const today = new Date().toISOString().split("T")[0];
  const lastDay = new Date(year, month + 1, 0).getDate();
  const fullEndDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const endDate = fullEndDate > today ? today : fullEndDate;

  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const monthFull = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const shortYear = String(year).slice(2);

  const completedIssues = await fetchCompletedIssuesWithChangelogs(
    squad.project, null, startDate, endDate
  );

  const standardEstimates = await fetchStandardIssuesWithEstimates(
    squad.project, null, startDate, endDate
  );

  const { bugs, subBugs } = await fetchCompletedBugs(
    squad.project, null, startDate, endDate
  );

  const rawPeriod: RawPeriodData = {
    period: {
      type: "kanban",
      label: `${monthFull[month]}/${shortYear}`,
      shortName: `${monthNames[month]}/${shortYear}`,
      startDate,
      endDate,
    },
    completedIssues,
    standardEstimates,
    bugs,
    subBugs,
  };

  await saveRawPeriod(squad.slug, `month-${monthKey}`, rawPeriod);

  return rawPeriod;
}

/**
 * Garante que WIP e R2 existem no S3 — busca do Jira se necessário.
 */
export async function ensureWipAndR2(
  squad: SquadConfig
): Promise<{ wipRaw: RawWipData | null; r2Raw: RawR2Data | null }> {
  let wipRaw = await loadRawWip(squad.slug).catch(() => null);
  let r2Raw = await loadRawR2(squad.slug).catch(() => null);

  // Se WIP não existe, buscar do Jira
  if (!wipRaw) {
    const wipIssues = await fetchWipIssues(squad.project);
    const wipKeys = wipIssues.map((i) => i.key);
    const wipChangelogs = await fetchChangelogsBatch(wipKeys);

    wipRaw = {
      issues: wipIssues.map((i) => ({
        key: i.key,
        summary: i.summary,
        status: i.status,
        transitions: wipChangelogs.get(i.key) || [],
      })),
      fetchedAt: new Date().toISOString(),
    };
    await saveRawWip(squad.slug, wipRaw);
  }

  // Se R2 não existe, buscar do Jira
  if (!r2Raw) {
    const projectVersions = await fetchProjectVersions("EP");
    const activeRelease = findActiveRelease(projectVersions);
    const activeFixVersion = activeRelease?.name || squad.r2FixVersion;
    const releaseDeadline = activeRelease?.releaseDate || "2026-07-31";
    const releaseName = activeRelease?.name.split(" - ")[0] || "R2";

    const [r2Epics, r2Features] = await Promise.all([
      fetchR2Epics(activeFixVersion, squad.teamFieldValue),
      fetchR2Features(activeFixVersion, squad.teamFieldValue),
    ]);

    const allR2Items = [...r2Epics, ...r2Features];
    const r2Changelogs = await fetchChangelogsBatch(allR2Items.map((i) => i.key));

    r2Raw = {
      epics: r2Epics,
      features: r2Features,
      r2WithChangelogs: allR2Items.map((i) => ({
        key: i.key,
        issueType: i.issueType,
        status: i.status,
        transitions: r2Changelogs.get(i.key) || [],
      })),
      releaseName,
      releaseDeadline,
    };
    await saveRawR2(squad.slug, r2Raw);
  }

  return { wipRaw, r2Raw };
}
