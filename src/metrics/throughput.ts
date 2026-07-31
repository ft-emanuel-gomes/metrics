import { JiraIssue } from "@/services/jira-search";

/**
 * Resultado de vazão por tipo de issue.
 */
export interface ThroughputByType {
  type: string;
  count: number;
  percentage: number;
  issueKeys: string[];
}

/**
 * Resultado de vazão para um período.
 */
export interface ThroughputPeriodResult {
  total: number;
  byType: ThroughputByType[];
}

/**
 * Calcula a vazão (throughput) de um conjunto de issues concluídas.
 * Agrupa por tipo de issue e calcula percentuais.
 *
 * Regras:
 * - Issues já devem estar filtradas (status atual = Concluído, sem Cancelados)
 * - Agrupa por issueType
 * - Calcula % de cada tipo sobre o total
 */
export function calculateThroughput(issues: JiraIssue[]): ThroughputPeriodResult {
  if (issues.length === 0) {
    return { total: 0, byType: [] };
  }

  // Agrupar por tipo
  const typeMap = new Map<string, string[]>();

  for (const issue of issues) {
    const type = normalizeIssueType(issue.issueType);
    const keys = typeMap.get(type) || [];
    keys.push(issue.key);
    typeMap.set(type, keys);
  }

  const total = issues.length;

  // Converter para array ordenado por contagem (descendente)
  const byType: ThroughputByType[] = Array.from(typeMap.entries())
    .map(([type, keys]) => ({
      type,
      count: keys.length,
      percentage: Math.round((keys.length / total) * 100),
      issueKeys: keys,
    }))
    .sort((a, b) => b.count - a.count);

  return { total, byType };
}

/**
 * Normaliza nomes de tipos de issue para agrupamento consistente.
 * "Story" e "História" viram "História", etc.
 */
function normalizeIssueType(type: string): string {
  const mapping: Record<string, string> = {
    Story: "História",
    História: "História",
    Bug: "Bug",
    Design: "Design",
    "Technical Debt": "Tech Debt",
    "Dívida Técnica": "Tech Debt",
  };

  return mapping[type] || type;
}
