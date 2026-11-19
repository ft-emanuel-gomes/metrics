import { fetchProjectVersions } from "./jira-versions";
import { displaySprintName, type ReleaseWindow } from "@/lib/sprint-name";

/**
 * Função que converte o nome da sprint do Jira no padrão "Sprint N - RN" (regra em src/lib/sprint-name.ts).
 * Busca as releases uma vez (cache do app). Falha no Jira: segue sem release pelas datas (só a do nome).
 */
export async function getSprintNamer(): Promise<(name: string, startIso?: string) => string> {
  const versions: ReleaseWindow[] = await fetchProjectVersions("EP").catch(() => []);
  return (name, startIso) => displaySprintName(name, startIso, versions);
}
