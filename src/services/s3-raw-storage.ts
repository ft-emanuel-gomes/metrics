/**
 * S3 Raw Data Storage — salva dados brutos por sprint/mês para recalcular métricas com filtros.
 *
 * Schema no S3:
 *   raw/{slug}/sprints.json          — lista de sprints disponíveis
 *   raw/{slug}/period/{id}.json      — dados brutos do período (issues, estimates, spillover, bugs)
 *   raw/{slug}/wip.json              — WIP Aging (realtime)
 *   raw/{slug}/r2.json               — Épicos e Features R2
 *   raw/{slug}/meta.json             — metadados (última sync, release info)
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import type { SprintData } from "@/services/jira-sprints";
import type { JiraIssueWithChangelog, SubtaskWithEstimate, JiraIssue } from "@/services/jira-search";
import type { StatusTransition } from "@/services/jira-changelog";

// --- Types ---

/** Dados brutos de um período (sprint ou mês) — tudo que precisa para recalcular métricas */
export interface RawPeriodData {
  period: {
    type: "sprint" | "kanban";
    id?: number;
    label: string;
    shortName: string;
    startDate: string;
    endDate: string;
  };
  /** Issues concluídas com changelogs (para CT, Vazão, Eficiência) */
  completedIssues: JiraIssueWithChangelog[];
  /** Standard Issues com estimates (para Ocupação) */
  standardEstimates: SubtaskWithEstimate[];
  /** Issues transbordadas — só sprint (para Transbordo) */
  spilledIssues?: JiraIssue[];
  /** Bugs e Sub-bugs concluídos (para Qualidade) */
  bugs: JiraIssue[];
  subBugs: JiraIssue[];
}

/** WIP Aging raw — issues atualmente no fluxo com changelogs */
export interface RawWipData {
  issues: {
    key: string;
    summary: string;
    status: string;
    transitions: StatusTransition[];
  }[];
  fetchedAt: string;
}

/** R2 Progress raw — épicos e features com changelogs */
export interface RawR2Data {
  epics: JiraIssue[];
  features: JiraIssue[];
  r2WithChangelogs: {
    key: string;
    issueType: string;
    status: string;
    transitions: StatusTransition[];
  }[];
  releaseName: string;
  releaseDeadline: string;
}

/** Metadados da squad sincronizada */
export interface RawSquadMeta {
  slug: string;
  syncedAt: string;
  sprintIds: number[];
  monthKeys: string[];
  teamSize: number;
}

// --- S3 Client (reusa mesmo padrão do s3-storage.ts) ---

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

let client: S3Client | null = null;
function getClient(): S3Client {
  if (!client) client = createS3Client();
  return client;
}
function getBucket(): string {
  return process.env.S3_BUCKET || "metrics-data";
}

// --- Save Functions ---

async function putJson(key: string, data: unknown): Promise<void> {
  await getClient().send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: JSON.stringify(data),
    ContentType: "application/json",
  }));
}

async function getJson<T>(key: string): Promise<T | null> {
  try {
    const res = await getClient().send(new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
    }));
    const body = await res.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body) as T;
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err.name === "NoSuchKey" || err.name === "NotFound") return null;
    throw error;
  }
}

// --- Public API ---

/** Salva dados brutos de um período */
export async function saveRawPeriod(slug: string, periodId: string, data: RawPeriodData): Promise<void> {
  await putJson(`raw/${slug}/period/${periodId}.json`, data);
}

/** Carrega dados brutos de um período */
export async function loadRawPeriod(slug: string, periodId: string): Promise<RawPeriodData | null> {
  return getJson<RawPeriodData>(`raw/${slug}/period/${periodId}.json`);
}

/** Salva lista de sprints disponíveis */
export async function saveRawSprints(slug: string, sprints: SprintData[]): Promise<void> {
  await putJson(`raw/${slug}/sprints.json`, sprints);
}

/** Carrega lista de sprints disponíveis */
export async function loadRawSprints(slug: string): Promise<SprintData[] | null> {
  return getJson<SprintData[]>(`raw/${slug}/sprints.json`);
}

/** Salva WIP Aging raw */
export async function saveRawWip(slug: string, data: RawWipData): Promise<void> {
  await putJson(`raw/${slug}/wip.json`, data);
}

/** Carrega WIP Aging raw */
export async function loadRawWip(slug: string): Promise<RawWipData | null> {
  return getJson<RawWipData>(`raw/${slug}/wip.json`);
}

/** Salva R2 Progress raw */
export async function saveRawR2(slug: string, data: RawR2Data): Promise<void> {
  await putJson(`raw/${slug}/r2.json`, data);
}

/** Carrega R2 Progress raw */
export async function loadRawR2(slug: string): Promise<RawR2Data | null> {
  return getJson<RawR2Data>(`raw/${slug}/r2.json`);
}

/** Salva metadados */
export async function saveRawMeta(slug: string, meta: RawSquadMeta): Promise<void> {
  await putJson(`raw/${slug}/meta.json`, meta);
}

/** Carrega metadados */
export async function loadRawMeta(slug: string): Promise<RawSquadMeta | null> {
  return getJson<RawSquadMeta>(`raw/${slug}/meta.json`);
}
