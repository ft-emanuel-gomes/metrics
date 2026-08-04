/**
 * OAuth Token Storage — salva/carrega refresh tokens no S3 por usuário.
 * Key pattern: auth/{accountId}/tokens.json
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

interface StoredTokens {
  accountId: string;
  email: string;
  refreshToken: string;
  savedAt: string;
}

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

/**
 * Salva o refresh token de um usuário no S3.
 */
export async function saveRefreshToken(accountId: string, email: string, refreshToken: string): Promise<void> {
  const data: StoredTokens = {
    accountId,
    email,
    refreshToken,
    savedAt: new Date().toISOString(),
  };

  await getClient().send(new PutObjectCommand({
    Bucket: getBucket(),
    Key: `auth/${accountId}/tokens.json`,
    Body: JSON.stringify(data),
    ContentType: "application/json",
  }));
}

/**
 * Carrega o refresh token de um usuário do S3.
 * Retorna null se não existir.
 */
export async function loadRefreshToken(accountId: string): Promise<string | null> {
  try {
    const res = await getClient().send(new GetObjectCommand({
      Bucket: getBucket(),
      Key: `auth/${accountId}/tokens.json`,
    }));

    const body = await res.Body?.transformToString();
    if (!body) return null;

    const data: StoredTokens = JSON.parse(body);
    return data.refreshToken;
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err.name === "NoSuchKey" || err.name === "NotFound") return null;
    throw error;
  }
}

/**
 * Usa o refresh token para obter um novo access token da Atlassian.
 * Retorna o novo access_token e refresh_token (se rotacionado).
 */
export async function refreshAtlassianToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
} | null> {
  const clientId = process.env.ATLASSIAN_CLIENT_ID;
  const clientSecret = process.env.ATLASSIAN_CLIENT_SECRET;

  if (!clientId || !clientSecret) return null;

  try {
    const response = await fetch("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken, // Atlassian pode retornar novo refresh_token
    };
  } catch {
    return null;
  }
}
