/**
 * Config Store — leitura e gravação de configuração administrativa (JSON) no S3.
 *
 * - Um arquivo por entidade (ex.: config/team/{slug}.json), para reduzir colisão entre administradores.
 * - Gravação condicional por ETag (If-Match / If-None-Match): se outro administrador gravou antes, lança
 *   ConfigConflictError (a rota responde 409). Se o armazenamento não suportar a condição, grava assim mesmo
 *   e registra um aviso (vale a última gravação).
 * - Cache em memória no globalThis (cada rota do Next pode carregar uma cópia deste módulo), TTL de 60s,
 *   invalidado na própria gravação.
 * - Toda gravação registra updatedAt e updatedBy (auditoria).
 */

import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

/** Campos de auditoria gravados em todo arquivo de configuração. */
export interface Audited {
  updatedAt: string;
  updatedBy: string;
}

export class ConfigConflictError extends Error {
  constructor(public readonly key: string) {
    super(`A configuração "${key}" foi alterada por outra pessoa. Recarregue e tente de novo.`);
    this.name = "ConfigConflictError";
  }
}

export class ConfigUnavailableError extends Error {
  constructor(public readonly key: string, cause?: unknown) {
    super(`Não foi possível acessar a configuração "${key}" no armazenamento.`);
    this.name = "ConfigUnavailableError";
    if (cause) (this as { cause?: unknown }).cause = cause;
  }
}

/** Armazenamento por trás do config-store (S3 em produção; substituível nos testes). */
export interface ConfigBackend {
  get(key: string): Promise<{ body: string; etag?: string } | null>;
  /** ifMatch = só grava se o ETag atual for este; ifNoneMatch = só grava se o arquivo NÃO existir. */
  put(key: string, body: string, cond: { ifMatch?: string; ifNoneMatch?: boolean }): Promise<{ etag?: string }>;
  delete?(key: string): Promise<void>;
}

// --- Backend S3 ---

function createS3Backend(): ConfigBackend {
  let client: S3Client | null = null;
  const getClient = () => {
    if (!client) {
      const config: ConstructorParameters<typeof S3Client>[0] = {
        region: process.env.S3_REGION || "us-east-1",
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
          secretAccessKey: process.env.S3_SECRET_KEY || "minioadmin",
        },
      };
      if (process.env.S3_ENDPOINT) {
        config.endpoint = process.env.S3_ENDPOINT;
        config.forcePathStyle = true;
      }
      client = new S3Client(config);
    }
    return client;
  };
  const bucket = () => process.env.S3_BUCKET || "metrics-data";

  return {
    async get(key) {
      try {
        const res = await getClient().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
        const body = await res.Body?.transformToString();
        return body ? { body, etag: res.ETag } : null;
      } catch (error: unknown) {
        const err = error as { name?: string };
        if (err.name === "NoSuchKey" || err.name === "NotFound") return null;
        throw error;
      }
    },
    async put(key, body, cond) {
      const send = (withCond: boolean) =>
        getClient().send(
          new PutObjectCommand({
            Bucket: bucket(),
            Key: key,
            Body: body,
            ContentType: "application/json",
            ...(withCond && cond.ifMatch ? { IfMatch: cond.ifMatch } : {}),
            ...(withCond && cond.ifNoneMatch ? { IfNoneMatch: "*" } : {}),
          })
        );
      try {
        const res = await send(true);
        return { etag: res.ETag };
      } catch (error: unknown) {
        const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
        const status = err.$metadata?.httpStatusCode;
        if (status === 412 || err.name === "PreconditionFailed" || status === 409 || err.name === "ConditionalRequestConflict") {
          throw new ConfigConflictError(key);
        }
        // Armazenamento sem suporte a gravação condicional: grava sem a condição (vale a última gravação)
        if (status === 501 || err.name === "NotImplemented") {
          console.warn(`[config-store] Gravação condicional não suportada; gravando "${key}" sem verificação de conflito.`);
          const res = await send(false);
          return { etag: res.ETag };
        }
        throw error;
      }
    },
    async delete(key) {
      await getClient().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
    },
  };
}

// --- Estado global (cache + backend) ---

interface CacheEntry {
  data: unknown;
  etag?: string;
  ts: number;
}
const g = globalThis as typeof globalThis & {
  __configStore?: { backend: ConfigBackend | null; cache: Map<string, CacheEntry> };
};
const state = (g.__configStore ??= { backend: null, cache: new Map() });
const CACHE_TTL_MS = 60_000;

function backend(): ConfigBackend {
  if (!state.backend) state.backend = createS3Backend();
  return state.backend;
}

/** Troca o armazenamento (testes) e limpa o cache. Passe null para voltar ao S3. */
export function setConfigBackend(b: ConfigBackend | null): void {
  state.backend = b;
  state.cache.clear();
}

/** Limpa o cache (todas as chaves ou uma). */
export function clearConfigCache(key?: string): void {
  if (key) state.cache.delete(key);
  else state.cache.clear();
}

// --- API pública ---

/**
 * Lê um JSON de configuração. Devolve `data: null` se o arquivo não existir.
 * Usa o cache de 60s; `fresh: true` ignora o cache (antes de gravar, por exemplo).
 * Se o armazenamento falhar e houver cache (mesmo vencido), devolve o cache; senão lança ConfigUnavailableError.
 */
export async function readConfig<T>(key: string, opts: { fresh?: boolean } = {}): Promise<{ data: T | null; etag?: string }> {
  const cached = state.cache.get(key);
  if (!opts.fresh && cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { data: cached.data as T | null, etag: cached.etag };
  }
  try {
    const res = await backend().get(key);
    const data = res ? (JSON.parse(res.body) as T) : null;
    state.cache.set(key, { data, etag: res?.etag, ts: Date.now() });
    return { data, etag: res?.etag };
  } catch (error) {
    if (cached) return { data: cached.data as T | null, etag: cached.etag };
    throw new ConfigUnavailableError(key, error);
  }
}

/**
 * Grava um JSON de configuração com auditoria (updatedAt/updatedBy).
 * - `ifMatch`: ETag lido antes; se o arquivo mudou, lança ConfigConflictError.
 * - `ifNoneMatch`: só cria se o arquivo ainda não existir.
 */
export async function writeConfig<T extends object>(
  key: string,
  data: T,
  opts: { actor: string; ifMatch?: string; ifNoneMatch?: boolean }
): Promise<T & Audited> {
  const stamped = { ...data, updatedAt: new Date().toISOString(), updatedBy: opts.actor } as T & Audited;
  let res: { etag?: string };
  try {
    res = await backend().put(key, JSON.stringify(stamped, null, 2), { ifMatch: opts.ifMatch, ifNoneMatch: opts.ifNoneMatch });
  } catch (error) {
    if (error instanceof ConfigConflictError) {
      state.cache.delete(key);
      throw error;
    }
    throw new ConfigUnavailableError(key, error);
  }
  state.cache.set(key, { data: stamped, etag: res.etag, ts: Date.now() });
  return stamped;
}

/**
 * Lê, altera e grava com verificação de conflito, tentando de novo (até 3 vezes) se outra gravação
 * aconteceu no meio. O `mutate` recebe o valor atual (ou null) e devolve o novo, ou `undefined` para não gravar.
 */
export async function updateConfig<T extends object>(
  key: string,
  mutate: (current: T | null) => T | undefined,
  opts: { actor: string }
): Promise<(T & Audited) | T | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, etag } = await readConfig<T>(key, { fresh: true });
    const next = mutate(data);
    if (next === undefined) return data;
    try {
      return await writeConfig(key, next, { actor: opts.actor, ifMatch: etag, ifNoneMatch: !etag && data === null });
    } catch (error) {
      if (error instanceof ConfigConflictError && attempt < 2) continue;
      throw error;
    }
  }
  throw new ConfigConflictError(key);
}

/** Apaga um arquivo de configuração (usado só para desfazer uma materialização automática). */
export async function deleteConfig(key: string): Promise<void> {
  const b = backend();
  if (!b.delete) throw new ConfigUnavailableError(key);
  try {
    await b.delete(key);
  } catch (error) {
    throw new ConfigUnavailableError(key, error);
  }
  state.cache.set(key, { data: null, ts: Date.now() });
}
