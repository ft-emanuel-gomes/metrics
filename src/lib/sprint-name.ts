/**
 * Nome de sprint no padrão da Monte Bravo: "Sprint N - RN".
 *
 * Regra de negócio: cada squad escreve o nome no Jira de um jeito ("R4 - Sprint 1", "R4 - SPRINT 2",
 * "Sprint 2 - R4"). Na exibição, o padrão é sempre "Sprint N - RN".
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
