import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

/**
 * Configuração do S3 client.
 * Em dev local: usa MinIO (S3_ENDPOINT=http://localhost:9000)
 * Em produção AWS: omitir S3_ENDPOINT (usa endpoint padrão da região)
 */
function createS3Client(): S3Client {
  const config: ConstructorParameters<typeof S3Client>[0] = {
    region: process.env.S3_REGION || "us-east-1",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
      secretAccessKey: process.env.S3_SECRET_KEY || "minioadmin",
    },
  };

  // Se S3_ENDPOINT definido, é MinIO local — forçar path-style
  if (process.env.S3_ENDPOINT) {
    config.endpoint = process.env.S3_ENDPOINT;
    config.forcePathStyle = true;
  }

  return new S3Client(config);
}

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = createS3Client();
  }
  return s3Client;
}

function getBucket(): string {
  return process.env.S3_BUCKET || "metrics-data";
}

/**
 * Salva dados JSON de uma squad no S3.
 * Key pattern: squads/{slug}/metrics.json
 */
export async function saveSquadMetrics(slug: string, data: unknown): Promise<void> {
  const client = getS3Client();
  const key = `squads/${slug}/metrics.json`;

  await client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: JSON.stringify(data),
      ContentType: "application/json",
    })
  );
}

/**
 * Lê dados JSON de uma squad do S3.
 * Retorna null se não existir.
 */
export async function loadSquadMetrics(slug: string): Promise<unknown | null> {
  const client = getS3Client();
  const key = `squads/${slug}/metrics.json`;

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: getBucket(),
        Key: key,
      })
    );

    const body = await response.Body?.transformToString();
    if (!body) return null;

    return JSON.parse(body);
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err.name === "NoSuchKey" || err.name === "NotFound") {
      return null;
    }
    throw error;
  }
}

/**
 * Salva metadados do último sync (timestamp, status).
 * Key: sync/last-sync.json
 */
export async function saveSyncMeta(meta: {
  timestamp: string;
  squads: string[];
  durationMs: number;
}): Promise<void> {
  const client = getS3Client();

  await client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: "sync/last-sync.json",
      Body: JSON.stringify(meta),
      ContentType: "application/json",
    })
  );
}

/**
 * Lê metadados do último sync.
 */
export async function loadSyncMeta(): Promise<{
  timestamp: string;
  squads: string[];
  durationMs: number;
} | null> {
  const client = getS3Client();

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: getBucket(),
        Key: "sync/last-sync.json",
      })
    );

    const body = await response.Body?.transformToString();
    if (!body) return null;

    return JSON.parse(body);
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err.name === "NoSuchKey" || err.name === "NotFound") {
      return null;
    }
    throw error;
  }
}

/**
 * Lista todas as squads que têm dados no S3.
 */
export async function listStoredSquads(): Promise<string[]> {
  const client = getS3Client();

  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: getBucket(),
      Prefix: "squads/",
      Delimiter: "/",
    })
  );

  return (response.CommonPrefixes || [])
    .map((p) => p.Prefix?.replace("squads/", "").replace("/", "") || "")
    .filter(Boolean);
}
