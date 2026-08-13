export type Methodology = "sprint" | "kanban";

export interface SquadConfig {
  code: string;
  project: string;
  name: string;
  slug: string;
  methodology: Methodology;
  boardId: number;
  teamSize: number;
  r2FixVersion: string;
  teamFieldValue: string;
}

/**
 * Configuração de todas as squads de engenharia.
 * boardId e teamSize devem ser preenchidos com valores reais do Jira.
 */
export const SQUADS_CONFIG: Record<string, SquadConfig> = {
  custodia: {
    code: "09",
    project: "CT",
    name: "Squad Custódia",
    slug: "custodia",
    methodology: "sprint",
    boardId: 702, // Downstream - Custódia (scrum)
    teamSize: 6,
    r2FixVersion: "R2 - COMPLIANCE, ONBOARDING E FEE-BASED",
    teamFieldValue: "Squad Custódia",
  },
  consolidacao: {
    code: "16",
    project: "CS",
    name: "Squad Consolidação",
    slug: "consolidacao",
    methodology: "sprint",
    boardId: 1356, // Downstream - Consolidação (scrum)
    teamSize: 6,
    r2FixVersion: "R2 - COMPLIANCE, ONBOARDING E FEE-BASED",
    teamFieldValue: "Squad Consolidação",
  },
  lifecycle: {
    code: "15",
    project: "LC",
    name: "Squad LifeCycle",
    slug: "lifecycle",
    methodology: "sprint",
    boardId: 634, // Downstream - Lifecycle (scrum)
    teamSize: 6,
    r2FixVersion: "R2 - COMPLIANCE, ONBOARDING E FEE-BASED",
    teamFieldValue: "Squad LifeCycle",
  },
  inteligencia: {
    code: "17",
    project: "INT",
    name: "Squad Inteligência",
    slug: "inteligencia",
    methodology: "sprint",
    boardId: 1980, // DownStream - Scrum Inteligência (scrum)
    teamSize: 6,
    r2FixVersion: "R2 - COMPLIANCE, ONBOARDING E FEE-BASED",
    teamFieldValue: "Squad Inteligencia",
  },
  riscos: {
    code: "13",
    project: "RI",
    name: "Squad Riscos",
    slug: "riscos",
    methodology: "sprint",
    boardId: 1902,
    teamSize: 6,
    r2FixVersion: "R2 - COMPLIANCE, ONBOARDING E FEE-BASED",
    teamFieldValue: "Squad Riscos",
  },
  "renda-variavel": {
    code: "12",
    project: "RV",
    name: "Squad Renda Variável",
    slug: "renda-variavel",
    methodology: "sprint",
    boardId: 1218, // Downstream - Renda Variável (scrum)
    teamSize: 6,
    r2FixVersion: "R2 - COMPLIANCE, ONBOARDING E FEE-BASED",
    teamFieldValue: "Squad Renda Variável",
  },
  experiencia: {
    code: "14",
    project: "ED",
    name: "Squad Experiência Digital",
    slug: "experiencia",
    methodology: "sprint",
    boardId: 1974, // Downstream - Scrum Experiência Digital (scrum)
    teamSize: 6,
    r2FixVersion: "R2 - COMPLIANCE, ONBOARDING E FEE-BASED",
    teamFieldValue: "Squad Experiência Digital",
  },
  assessoria: {
    code: "07",
    project: "AS",
    name: "Squad Assessoria",
    slug: "assessoria",
    methodology: "sprint",
    boardId: 1976, // Downstream - Scrum Assessoria (scrum)
    teamSize: 6,
    r2FixVersion: "R2 - COMPLIANCE, ONBOARDING E FEE-BASED",
    teamFieldValue: "Squad Assessoria",
  },
  "renda-fixa": {
    code: "11",
    project: "RF",
    name: "Squad Renda Fixa",
    slug: "renda-fixa",
    methodology: "sprint",
    boardId: 1830,
    teamSize: 6,
    r2FixVersion: "R2 - COMPLIANCE, ONBOARDING E FEE-BASED",
    teamFieldValue: "Squad Renda Fixa e Híbridos",
  },
};

/**
 * Busca squad por slug (usado nas rotas dinâmicas)
 */
export function getSquadBySlug(slug: string): SquadConfig | undefined {
  return SQUADS_CONFIG[slug];
}

/**
 * Lista todas as squads
 */
export function getAllSquads(): SquadConfig[] {
  return Object.values(SQUADS_CONFIG);
}
