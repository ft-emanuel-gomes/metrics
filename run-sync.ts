/**
 * Script de sync manual — pula migrations (já aplicadas).
 * Uso: npx tsx run-sync.ts
 */
import { getAllSquads } from "./src/config/squads";
import { syncSquad } from "./src/sync/sync-issues";
import { syncSprints } from "./src/sync/sync-sprints";

async function main() {
  console.log("[RunSync] Iniciando sync de todas as squads...");
  console.log(`[RunSync] DATABASE_URL: ${process.env.DATABASE_URL ? "configurado" : "NÃO DEFINIDO"}`);

  const squads = getAllSquads();
  const results: { squad: string; status: string; issues: number; time: number }[] = [];

  for (const squad of squads) {
    console.log(`\n[RunSync] === ${squad.name} (${squad.project}) ===`);
    const start = Date.now();

    try {
      // 1. Sync sprints
      const sprintCount = await syncSprints(squad);
      console.log(`[RunSync] Sprints sincronizadas: ${sprintCount}`);

      // 2. Sync issues (full mode)
      const result = await syncSquad(squad, { incremental: false });
      const time = Date.now() - start;

      results.push({ squad: squad.name, status: result.status, issues: result.issuesSynced, time });
      console.log(`[RunSync] ${result.status}: ${result.issuesSynced} issues em ${time}ms`);
    } catch (error) {
      const time = Date.now() - start;
      results.push({ squad: squad.name, status: "error", issues: 0, time });
      console.error(`[RunSync] ERRO: ${(error as Error).message}`);
    }
  }

  // Relatório final
  console.log("\n\n=== RELATÓRIO FINAL ===");
  console.table(results);

  const totalIssues = results.reduce((s, r) => s + r.issues, 0);
  console.log(`\nTotal de issues sincronizadas: ${totalIssues}`);
  console.log("Sync completo.");
  process.exit(0);
}

main();
