import axios, { AxiosInstance, AxiosError } from "axios";
import { getJiraConfig, getJiraAuthHeader, type JiraConfig } from "@/config/jira";

/**
 * Semáforo simples para limitar concorrência de requests ao Jira.
 * Máximo de requests simultâneas controlado por maxConcurrent.
 */
class Semaphore {
  private queue: (() => void)[] = [];
  private running = 0;

  constructor(private max: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }
}

/**
 * Cliente HTTP para comunicação com Jira Cloud.
 * Implementa: autenticação, retry com exponential backoff, rate limiting.
 */
class JiraClient {
  private client: AxiosInstance;
  private semaphore: Semaphore;
  private config: JiraConfig;

  constructor() {
    this.config = getJiraConfig();
    this.semaphore = new Semaphore(this.config.maxConcurrent);

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.requestTimeout,
      headers: {
        Authorization: getJiraAuthHeader(this.config),
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json",
      },
    });
  }

  /**
   * GET request com retry e rate limiting
   */
  async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    await this.semaphore.acquire();
    try {
      return await this.requestWithRetry<T>("GET", path, undefined, params);
    } finally {
      this.semaphore.release();
    }
  }

  /**
   * POST request com retry e rate limiting
   */
  async post<T>(path: string, body: unknown): Promise<T> {
    await this.semaphore.acquire();
    try {
      return await this.requestWithRetry<T>("POST", path, body);
    } finally {
      this.semaphore.release();
    }
  }

  private async requestWithRetry<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown,
    params?: Record<string, string | number>
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.config.retryAttempts; attempt++) {
      try {
        const response =
          method === "GET"
            ? await this.client.get<T>(path, { params })
            : await this.client.post<T>(path, body);

        return response.data;
      } catch (error) {
        lastError = error as Error;

        if (error instanceof AxiosError) {
          // Não fazer retry em erros de autenticação ou not found
          if (error.response?.status === 401 || error.response?.status === 403) {
            throw new JiraAuthError();
          }
          if (error.response?.status === 404) {
            throw new JiraNotFoundError(path);
          }

          // Log detalhado de erros 400 (JQL inválida, etc.)
          if (error.response?.status === 400) {
            console.error(
              `[JiraClient] Bad Request (400): ${path}`,
              JSON.stringify(error.response.data)
            );
            throw new Error(
              `Jira Bad Request: ${JSON.stringify(error.response.data?.errorMessages || error.response.data)}`
            );
          }

          // Rate limit: esperar o tempo indicado pelo header
          if (error.response?.status === 429) {
            const retryAfter = parseInt(
              error.response.headers["retry-after"] || "5",
              10
            );
            console.warn(
              `[JiraClient] Rate limit atingido. Aguardando ${retryAfter}s (tentativa ${attempt + 1}/${this.config.retryAttempts})`
            );
            await this.sleep(retryAfter * 1000);
            continue;
          }

          // Erros de servidor: retry com backoff
          if (error.response && error.response.status >= 500) {
            const backoff = Math.pow(2, attempt) * 1000;
            console.warn(
              `[JiraClient] Erro ${error.response.status}. Retry em ${backoff}ms (tentativa ${attempt + 1}/${this.config.retryAttempts})`
            );
            await this.sleep(backoff);
            continue;
          }
        }

        // Timeout: retry com backoff
        if (error instanceof AxiosError && error.code === "ECONNABORTED") {
          const backoff = Math.pow(2, attempt) * 1000;
          console.warn(
            `[JiraClient] Timeout. Retry em ${backoff}ms (tentativa ${attempt + 1}/${this.config.retryAttempts})`
          );
          await this.sleep(backoff);
          continue;
        }

        // Outros erros: não fazer retry
        throw error;
      }
    }

    throw lastError || new Error("Falha após todas as tentativas de retry");
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// --- Erros customizados ---

export class JiraAuthError extends Error {
  constructor() {
    super("Falha na autenticação com Jira. Verifique JIRA_EMAIL e JIRA_API_TOKEN.");
    this.name = "JiraAuthError";
  }
}

export class JiraNotFoundError extends Error {
  constructor(path: string) {
    super(`Recurso não encontrado no Jira: ${path}`);
    this.name = "JiraNotFoundError";
  }
}

// Singleton: uma instância compartilhada por toda a aplicação
let instance: JiraClient | null = null;

export function getJiraClient(): JiraClient {
  if (!instance) {
    instance = new JiraClient();
  }
  return instance;
}

export type { JiraClient };
