/**
 * Retro Storage — persiste boards de retrospectiva no S3.
 * Cada board é um arquivo JSON em: retro/{squadSlug}/{boardId}.json
 * Meta de boards por squad: retro/{squadSlug}/meta.json
 */

import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { RetroBoard, RetroBoardSummary, RetroBoardSettings, RetroTimer } from "@/types/retro";

// --- S3 Client (reusa padrão do projeto) ---

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

// --- Helpers ---

function boardKey(squadSlug: string, boardId: string): string {
  return `retro/${squadSlug}/${boardId}.json`;
}

async function putJson(key: string, data: unknown): Promise<void> {
  await getS3().send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    Body: JSON.stringify(data),
    ContentType: "application/json",
  }));
}

async function getJson<T>(key: string): Promise<T | null> {
  try {
    const res = await getS3().send(new GetObjectCommand({
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

// --- Default Board ---

function createDefaultSettings(): RetroBoardSettings {
  return {
    hideCards: false,
    votingEnabled: true,
    showVoteCount: true,
    maxVotesPerUser: 3,
    voteScopePerColumn: false,
  };
}

function createDefaultTimer(): RetroTimer {
  return {
    startedAt: null,
    durationSeconds: 300, // 5 minutos padrão
    pausedAt: null,
  };
}

// --- Public API ---

/**
 * Cria um novo board para a squad.
 */
export async function createBoard(
  squadSlug: string,
  squadName: string,
  createdBy: string,
  boardId: string
): Promise<RetroBoard> {
  const now = new Date().toISOString();

  const board: RetroBoard = {
    id: boardId,
    squadSlug,
    squadName,
    createdAt: now,
    updatedAt: now,
    createdBy,
    settings: createDefaultSettings(),
    timer: createDefaultTimer(),
    columns: [
      { id: `col-${Date.now()}-1`, title: "O que foi bom?", tooltip: "Pontos positivos da sprint", order: 0, cards: [] },
      { id: `col-${Date.now()}-2`, title: "O que pode melhorar?", tooltip: "Oportunidades de melhoria", order: 1, cards: [] },
      { id: `col-${Date.now()}-3`, title: "Ações", tooltip: "Ações concretas para a próxima sprint", order: 2, cards: [] },
    ],
  };

  await putJson(boardKey(squadSlug, boardId), board);
  return board;
}

/**
 * Carrega um board completo do S3.
 */
export async function loadBoard(squadSlug: string, boardId: string): Promise<RetroBoard | null> {
  return getJson<RetroBoard>(boardKey(squadSlug, boardId));
}

/**
 * Salva o board completo no S3 (atualiza updatedAt).
 */
export async function saveBoard(board: RetroBoard): Promise<void> {
  board.updatedAt = new Date().toISOString();
  await putJson(boardKey(board.squadSlug, board.id), board);
}

/**
 * Deleta um board do S3.
 */
export async function deleteBoard(squadSlug: string, boardId: string): Promise<void> {
  await getS3().send(new DeleteObjectCommand({
    Bucket: getBucket(),
    Key: boardKey(squadSlug, boardId),
  }));
}

/**
 * Lista todos os boards de uma squad (retorna summaries).
 */
export async function listBoards(squadSlug: string): Promise<RetroBoardSummary[]> {
  const prefix = `retro/${squadSlug}/`;

  const res = await getS3().send(new ListObjectsV2Command({
    Bucket: getBucket(),
    Prefix: prefix,
  }));

  if (!res.Contents || res.Contents.length === 0) return [];

  const summaries: RetroBoardSummary[] = [];

  for (const obj of res.Contents) {
    if (!obj.Key || !obj.Key.endsWith(".json")) continue;

    const board = await getJson<RetroBoard>(obj.Key);
    if (!board) continue;

    const totalCards = board.columns.reduce((sum, col) => sum + col.cards.length, 0);

    summaries.push({
      id: board.id,
      squadSlug: board.squadSlug,
      squadName: board.squadName,
      updatedAt: board.updatedAt,
      totalCards,
      columnCount: board.columns.length,
      columns: board.columns.map((col) => ({
        title: col.title,
        tooltip: col.tooltip,
        cardCount: col.cards.length,
      })),
    });
  }

  // Ordenar por updatedAt desc (mais recente primeiro)
  summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return summaries;
}

/**
 * Busca o board mais recente (ou único) de uma squad.
 * Usado para acesso direto via /retrospectiva/[squad].
 */
export async function getLatestBoard(squadSlug: string): Promise<RetroBoard | null> {
  const summaries = await listBoards(squadSlug);
  if (summaries.length === 0) return null;
  return loadBoard(squadSlug, summaries[0].id);
}

/**
 * Atualiza apenas as settings do board.
 */
export async function updateBoardSettings(
  squadSlug: string,
  boardId: string,
  settings: Partial<RetroBoardSettings>
): Promise<RetroBoard | null> {
  const board = await loadBoard(squadSlug, boardId);
  if (!board) return null;

  board.settings = { ...board.settings, ...settings };
  await saveBoard(board);
  return board;
}

/**
 * Atualiza o timer do board.
 */
export async function updateBoardTimer(
  squadSlug: string,
  boardId: string,
  timer: Partial<RetroTimer>
): Promise<RetroBoard | null> {
  const board = await loadBoard(squadSlug, boardId);
  if (!board) return null;

  board.timer = { ...board.timer, ...timer };
  await saveBoard(board);
  return board;
}
