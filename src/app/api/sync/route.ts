import { NextResponse } from "next/server";
import { getAllSquads, type SquadConfig } from "@/config/squads";
import { getLatestSprints, type SprintData } from "@/services/jira-sprints";
import {
  fetchCompletedIssuesWithChangelogs,
  fetchSpilledIssues,
  fetchStandardIssuesWithEstimates,
  fetchCompletedBugs,
  fetchR2Epics,
  fetchR2Features,
  fetchWipIssues,
} from "@/services/jira-search";
import { fetchChangelogsBatch } from "@/services/jira-changelog";
import { fetchProjectVersions, findActiveRelease } from "@/services/jira-versions";
import {
  saveRawPeriod,
  saveRawSprints,
  saveRawWip,
  saveRawR2,
  saveRawMeta,
  type RawPeriodData,
  type RawWipData,
  type RawR2Data,
} from "@/services/s3-raw-storage";
import { saveSyncMeta } from "@/services/s3-storage";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/sync
 * Busca dados brutos de todas as squads no Jira e salva no S3 por sprint/mês.
 * Permite recalcular métricas com qualquer filtro sem bater no Jira novamente.
 */
export async function POST() {
  const startTime = Date.now();
  const squads = getAllSquads();
  const results: { slug: string; status: "ok" | "error"; periods: number; error?: string }[] = [];

  for (const squad of squads) {
    try {
      if (squad.methodology === "sprint") {
        const periods = await syncSprintSquad(squad);
        results.push({ slug: squad.slug, status: "ok", periods });
      } else {
        const periods = await syncKanbanSquad(squad);
        results.push({ slug: squad.slug, status: "ok", periods });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Sync] Erro squad ${squad.slug}:`, message);
      results.push({ slug: squad.slug, status: "error", periods: 0, error: message });
    }
  }

  const durationMs = Date.now() - startTime;

  await saveSyncMeta({
    timestamp: new Date().toISOString(),
    squads: results.filter((r) => r.status === "ok").map((r) => r.slug),
    durationMs,
  });

  const successCount = results.filter((r) => r.status === "ok").length;
  const errorCount = results.filter((r) => r.status === "error").length;

  return NextResponse.json({
    success: true,
    message: `Sync concluído: ${successCount} squads ok, ${errorCount} erros`,
    durationMs,
    results,
  });
}

// --- Sprint Squad Sync ---

async function syncSprintSquad(squad: SquadConfig): Promise<number> {
  // 1. Buscar últimas 10 sprints (salvar todas para flexibilidade de filtro)
  const sprints = await getLatestSprints(squad.boardId, 10);
  await saveRawSprints(squad.slug, sprints);

  // 2. Para cada sprint, buscar dados brutos
  const lastSprints = sprints.slice(-3); // Salvar detalhes das últimas 3
  for (const sprint of lastSprints) {
    await syncSprintPeriod(squad, sprint);
  }

  // 3. WIP Aging (realtime)
  await syncWip(squad);

  // 4. R2 Progress
  await syncR2(squad);

  // 5. Metadados
  await saveRawMeta(squad.slug, {
    slug: squad.slug,
    syncedAt: new Date().toISOString(),
    sprintIds: lastSprints.map((s) => s.id),
    monthKeys: [],
    teamSize: squad.teamSize,
  });

  return lastSprints.length;
}

async function syncSprintPeriod(squad: SquadConfig, sprint: SprintData): Promise<void> {
  // Issues concluídas com changelogs
  let completedIssues = await fetchCompletedIssuesWithChangelogs(
    squad.project, sprint.id, sprint.startDate, sprint.endDate
  );

  // Design extras (por período, sem filtro de sprint)
  const designItems = await fetchCompletedIssuesWithChangelogs(
    squad.project, null, sprint.startDate, sprint.endDate
  );
  const existingKeys = new Set(completedIssues.map((i) => i.key));
  const designExtras = designItems.filter(
    (i) => i.issueType === "Design" && !existingKeys.has(i.key)
  );
  completedIssues = [...completedIssues, ...designExtras];

  // Issues transbordadas
  const spilledIssues = await fetchSpilledIssues(
    squad.project, sprint.id, sprint.startDate, sprint.endDate
  );

  // Estimates para ocupação
  const standardEstimates = await fetchStandardIssuesWithEstimates(squad.project, sprint.id);

  // Bugs e Sub-bugs
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

  await saveRawPeriod(squad.slug, `sprint-${sprint.id}`, rawPeriod);
}

// --- Kanban Squad Sync ---

async function syncKanbanSquad(squad: SquadConfig): Promise<number> {
  // 1. Gerar últimos 3 meses
  const periods = resolveMonthlyPeriods(new Date(), 3);

  // 2. Para cada mês, buscar dados brutos
  for (const period of periods) {
    await syncKanbanPeriod(squad, period);
  }

  // 3. WIP Aging
  await syncWip(squad);

  // 4. R2 Progress
  await syncR2(squad);

  // 5. Metadados
  await saveRawMeta(squad.slug, {
    slug: squad.slug,
    syncedAt: new Date().toISOString(),
    sprintIds: [],
    monthKeys: periods.map((p) => p.startDate.slice(0, 7)),
    teamSize: squad.teamSize,
  });

  return periods.length;
}

async function syncKanbanPeriod(
  squad: SquadConfig,
  period: { label: string; shortName: string; startDate: string; endDate: string }
): Promise<void> {
  const completedIssues = await fetchCompletedIssuesWithChangelogs(
    squad.project, null, period.startDate, period.endDate
  );

  const standardEstimates = await fetchStandardIssuesWithEstimates(
    squad.project, null, period.startDate, period.endDate
  );

  const { bugs, subBugs } = await fetchCompletedBugs(
    squad.project, null, period.startDate, period.endDate
  );

  const monthKey = period.startDate.slice(0, 7);

  const rawPeriod: RawPeriodData = {
    period: {
      type: "kanban",
      label: period.label,
      shortName: period.shortName,
      startDate: period.startDate,
      endDate: period.endDate,
    },
    completedIssues,
    standardEstimates,
    bugs,
    subBugs,
  };

  await saveRawPeriod(squad.slug, `month-${monthKey}`, rawPeriod);
}

// --- Shared: WIP + R2 ---

async function syncWip(squad: SquadConfig): Promise<void> {
  const wipIssues = await fetchWipIssues(squad.project);
  const wipKeys = wipIssues.map((i) => i.key);
  const wipChangelogs = await fetchChangelogsBatch(wipKeys);

  const wipData: RawWipData = {
    issues: wipIssues.map((i) => ({
      key: i.key,
      summary: i.summary,
      status: i.status,
      transitions: wipChangelogs.get(i.key) || [],
    })),
    fetchedAt: new Date().toISOString(),
  };

  await saveRawWip(squad.slug, wipData);
}

async function syncR2(squad: SquadConfig): Promise<void> {
  const projectVersions = await fetchProjectVersions("EP");
  const activeRelease = findActiveRelease(projectVersions);
  const activeFixVersion = activeRelease?.name || squad.r2FixVersion;
  const releaseDeadline = activeRelease?.releaseDate || "2026-07-31";
  const releaseName = activeRelease?.name.split(" - ")[0] || "Release";

  const [r2Epics, r2Features] = await Promise.all([
    fetchR2Epics(activeFixVersion, squad.teamFieldValue),
    fetchR2Features(activeFixVersion, squad.teamFieldValue),
  ]);

  const allR2Items = [...r2Epics, ...r2Features];
  const r2Keys = allR2Items.map((i) => i.key);
  const r2Changelogs = await fetchChangelogsBatch(r2Keys);

  const r2Data: RawR2Data = {
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

  await saveRawR2(squad.slug, r2Data);
}

// --- Helpers ---

function resolveMonthlyPeriods(referenceDate: Date, monthCount: number) {
  const monthNames = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const monthFull = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const periods: { label: string; shortName: string; startDate: string; endDate: string }[] = [];

  for (let i = monthCount - 1; i >= 0; i--) {
    const d = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - i, 1);
    const year = d.getFullYear();
    const month = d.getMonth();
    const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    let endDate: string;
    if (i === 0) {
      endDate = referenceDate.toISOString().split("T")[0];
    } else {
      const lastDay = new Date(year, month + 1, 0).getDate();
      endDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    }
    const shortYear = String(year).slice(2);
    periods.push({ label: `${monthFull[month]}/${shortYear}`, shortName: `${monthNames[month]}/${shortYear}`, startDate, endDate });
  }
  return periods;
}
