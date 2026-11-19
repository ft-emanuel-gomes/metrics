/**
 * Nome de sprint no padrão da Monte Bravo: "Sprint N - RN". Vale para TODAS as telas.
 *
 * Regra de negócio: cada squad escreve o nome no Jira de um jeito ("R4 - Sprint 1", "R4 - SPRINT 2",
 * "Sprint 2 - R4", "CT Sprint 8"). Na exibição, o padrão é sempre "Sprint N - RN".
 * - N vem do nome ("Sprint 1", "SPRINT 2", "Sprint2").
 * - A release vem do nome ("R4"); se o nome não tiver, usa `releaseShort` (release em que a sprint cai pelas datas).
 * - Nome sem número de sprint reconhecível: fica como está no Jira.
 */
export function formatSprintName(name: string, releaseShort?: string): string {
  const sprint = name.match(/sprint\s*(\d+)/i);
  if (!sprint) return name;
  const rel = name.match(/\bR\s*(\d+)\b/i);
  const release = rel ? `R${rel[1]}` : releaseShort?.match(/^R\d+$/i) ? releaseShort.toUpperCase() : undefined;
  return `Sprint ${Number(sprint[1])}${release ? ` - ${release}` : ""}`;
}

/** Version (release) do Jira, só o que a regra usa. */
export interface ReleaseWindow {
  name: string;
  startDate?: string; // YYYY-MM-DD
  releaseDate?: string; // YYYY-MM-DD
}

/** Sprint iniciada até 3 dias antes da version conta nela (mesma regra do filtro de sprints e do calendário). */
const RELEASE_TOLERANCE_MS = 3 * 86_400_000;

/** Release curta ("R4") em que a sprint cai pela data de início. */
export function releaseForDate(startIso: string | undefined, versions: ReleaseWindow[]): string | undefined {
  if (!startIso) return undefined;
  const start = new Date(startIso).getTime();
  if (!Number.isFinite(start)) return undefined;
  const rel = versions.find((v) => v.startDate && v.releaseDate &&
    start >= new Date(`${v.startDate}T00:00:00-03:00`).getTime() - RELEASE_TOLERANCE_MS &&
    start <= new Date(`${v.releaseDate}T23:59:59-03:00`).getTime());
  return rel ? rel.name.split(" - ")[0] || rel.name : undefined;
}

/** "Sprint N - RN" a partir do nome do Jira; sem release no nome, pela data de início. */
export function displaySprintName(name: string, startIso: string | undefined, versions: ReleaseWindow[]): string {
  return formatSprintName(name, /\bR\s*\d+\b/i.test(name) ? undefined : releaseForDate(startIso, versions));
}
