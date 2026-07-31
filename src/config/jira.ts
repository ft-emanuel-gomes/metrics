/**
 * Configuração de conexão com o Jira Cloud.
 * Valores lidos de variáveis de ambiente.
 */
export interface JiraConfig {
  baseUrl: string;
  email: string;
  apiToken: string;
  maxConcurrent: number;
  requestTimeout: number;
  retryAttempts: number;
}

export function getJiraConfig(): JiraConfig {
  const baseUrl = process.env.JIRA_BASE_URL;
  const email = process.env.JIRA_EMAIL;
  const apiToken = process.env.JIRA_API_TOKEN;

  if (!baseUrl || !email || !apiToken) {
    throw new Error(
      "Variáveis de ambiente JIRA_BASE_URL, JIRA_EMAIL e JIRA_API_TOKEN são obrigatórias."
    );
  }

  return {
    baseUrl: baseUrl.replace(/\/$/, ""), // Remove trailing slash
    email,
    apiToken,
    maxConcurrent: 5,
    requestTimeout: 30_000, // 30 segundos
    retryAttempts: 3,
  };
}

/**
 * Gera o header Authorization para Basic Auth do Jira
 */
export function getJiraAuthHeader(config: JiraConfig): string {
  const credentials = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
  return `Basic ${credentials}`;
}

/**
 * TTLs de cache em segundos (lidos de env com fallback)
 */
export const CACHE_TTLS = {
  changelog: parseInt(process.env.CACHE_TTL_CHANGELOG || "21600", 10),  // 6 horas
  sprints: parseInt(process.env.CACHE_TTL_SPRINTS || "21600", 10),      // 6 horas
  r2: parseInt(process.env.CACHE_TTL_R2 || "21600", 10),                // 6 horas
  issues: parseInt(process.env.CACHE_TTL_ISSUES || "21600", 10),        // 6 horas
  boards: parseInt(process.env.CACHE_TTL_BOARDS || "86400", 10),        // 24 horas
};
