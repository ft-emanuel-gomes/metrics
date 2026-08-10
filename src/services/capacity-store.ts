/**
 * Capacity Store — persiste configuração de capacidade (pessoas + dias úteis) no S3.
 * Fallback: se S3 falhar, tenta arquivo local data/capacity.json.
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";

const LOCAL_FILE = path.join(process.cwd(), "data", "capacity.json");

export interface CapacityEntry {
  teamSize: number;
  businessDays?: number;
}

interface CapacitySquadData {
  [sprintId: string]: CapacityEntry | number; // number = formato legado (só teamSize)
}

interface CapacityAllData {
  [squad: string]: CapacitySquadData;
}

// --- S3 Client ---

function createS3Client(): S3Client {
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
  return new S3Client(config);
}

let s3Client: S3Client | null = null;
function getS3(): S3Client {
  if (!s3Client) s3Client = createS3Client();
  return s3Client;
}
function getBucket(): string {
  return process.env.S3_BUCKET || "metrics-data";
}

const S3_KEY = "config/capacity.json";

// --- In-memory cache para evitar S3 calls constantes ---
let memoryCache: CapacityAllData | null = null;
let memoryCacheTs = 0;
const CACHE_TTL = 60_000; // 1 minuto

// --- S3 operations ---

async function loadFromS3(): Promise<CapacityAllData> {
  try {
    const res = await getS3().send(new GetObjectCommand({
      Bucket: getBucket(),
      Key: S3_KEY,
    }));
    const body = await res.Body?.transformToString();
    if (!body) return {};
    return JSON.parse(body) as CapacityAllData;
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err.name === "NoSuchKey" || err.name === "NotFound") return {};
    // Falha no S3 — tentar arquivo local como fallback
    return loadFromLocal();
  }
}

async function saveToS3(data: CapacityAllData): Promise<void> {
  await getS3().send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: S3_KEY,
    Body: JSON.stringify(data, null, 2),
    ContentType: "application/json",
  }));
  // Também salvar local como backup
  saveToLocal(data);
}

// --- Local file fallback ---

function loadFromLocal(): CapacityAllData {
  try {
    if (!fs.existsSync(LOCAL_FILE)) return {};
    const raw = fs.readFileSync(LOCAL_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function saveToLocal(data: CapacityAllData): void {
  try {
    const dir = path.dirname(LOCAL_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // Silently fail — S3 is the source of truth
  }
}

// --- Public API ---

/**
 * Carrega toda a config de capacidade (com cache de 1 min).
 */
async function loadAll(): Promise<CapacityAllData> {
  const now = Date.now();
  if (memoryCache && (now - memoryCacheTs) < CACHE_TTL) {
    return memoryCache;
  }
  memoryCache = await loadFromS3();
  memoryCacheTs = now;
  return memoryCache;
}

/**
 * Carrega capacidades de uma squad específica.
 * Retorna formato normalizado: { sprintId: { teamSize, businessDays } }
 */
export async function loadCapacityConfig(squad: string): Promise<Record<string, CapacityEntry>> {
  const all = await loadAll();
  const squadData = all[squad] || {};
  const normalized: Record<string, CapacityEntry> = {};

  for (const [key, val] of Object.entries(squadData)) {
    if (typeof val === "number") {
      normalized[key] = { teamSize: val };
    } else {
      normalized[key] = val;
    }
  }
  return normalized;
}

/**
 * Salva capacidade para uma sprint específica de uma squad.
 */
export async function saveCapacityConfig(
  squad: string,
  sprintId: string,
  entry: CapacityEntry
): Promise<void> {
  const all = await loadAll();
  if (!all[squad]) all[squad] = {};
  all[squad][sprintId] = entry;
  await saveToS3(all);
  // Invalidar cache
  memoryCache = all;
  memoryCacheTs = Date.now();
}

/**
 * Lê a capacidade (pessoas) salva para uma sprint específica de uma squad.
 * Retorna o valor salvo ou o fallback (teamSize da config).
 * Compatível com formato antigo (number) e novo ({ teamSize, businessDays }).
 */
export function getSprintCapacity(
  squadSlug: string,
  sprintId: number,
  fallback: number
): number {
  // Leitura síncrona — usa cache em memória ou arquivo local como fallback
  if (memoryCache) {
    const entry = memoryCache[squadSlug]?.[String(sprintId)];
    if (entry) return typeof entry === "number" ? entry : entry.teamSize;
  }

  // Fallback: ler arquivo local (síncrono)
  try {
    if (!fs.existsSync(LOCAL_FILE)) return fallback;
    const raw = fs.readFileSync(LOCAL_FILE, "utf-8");
    const data: CapacityAllData = JSON.parse(raw);
    const entry = data[squadSlug]?.[String(sprintId)];
    if (entry) return typeof entry === "number" ? entry : entry.teamSize;
    return fallback;
  } catch {
    return fallback;
  }
}

/**
 * Lê os dias úteis configurados para uma sprint específica.
 * Retorna undefined se não configurado (usa cálculo automático).
 */
export function getSprintBusinessDays(
  squadSlug: string,
  sprintId: number
): number | undefined {
  // Leitura síncrona — usa cache em memória ou arquivo local como fallback
  if (memoryCache) {
    const entry = memoryCache[squadSlug]?.[String(sprintId)];
    if (entry && typeof entry !== "number") return entry.businessDays;
    return undefined;
  }

  try {
    if (!fs.existsSync(LOCAL_FILE)) return undefined;
    const raw = fs.readFileSync(LOCAL_FILE, "utf-8");
    const data: CapacityAllData = JSON.parse(raw);
    const entry = data[squadSlug]?.[String(sprintId)];
    if (entry && typeof entry !== "number") return entry.businessDays;
    return undefined;
  } catch {
    return undefined;
  }
}
