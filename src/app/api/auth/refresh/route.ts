import { NextRequest, NextResponse } from "next/server";
import { verifyToken, validateUserByEmail, generateToken } from "@/services/auth-service";
import { loadRefreshToken, refreshAtlassianToken, saveRefreshToken } from "@/services/auth-tokens";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/refresh
 * Renovação silenciosa da sessão usando refresh_token armazenado no S3.
 * Chamado pelo middleware quando o JWT expira mas o refresh_token é válido.
 */
export async function POST(request: NextRequest) {
  // Tentar extrair accountId do JWT expirado (ignorando expiração)
  const token = request.cookies.get("auth-token")?.value;

  if (!token) {
    return NextResponse.json({ error: "No token" }, { status: 401 });
  }

  // Decodificar sem verificar expiração para pegar o accountId
  let accountId: string | null = null;
  let email: string | null = null;

  try {
    const jwt = await import("jsonwebtoken");
    const decoded = jwt.default.decode(token) as { accountId?: string; email?: string } | null;
    accountId = decoded?.accountId || null;
    email = decoded?.email || null;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  if (!accountId) {
    return NextResponse.json({ error: "No accountId in token" }, { status: 401 });
  }

  // Buscar refresh_token do S3
  const refreshToken = await loadRefreshToken(accountId);

  if (!refreshToken) {
    return NextResponse.json({ error: "No refresh token stored" }, { status: 401 });
  }

  // Usar refresh_token para obter novo access_token da Atlassian
  const result = await refreshAtlassianToken(refreshToken);

  if (!result) {
    return NextResponse.json({ error: "Refresh failed" }, { status: 401 });
  }

  // Se o refresh_token rotacionou, salvar o novo
  if (result.refreshToken !== refreshToken) {
    await saveRefreshToken(accountId, email || "", result.refreshToken).catch(() => {});
  }

  // Revalidar permissões do usuário (podem ter mudado)
  const user = email ? await validateUserByEmail(email) : null;

  if (!user) {
    return NextResponse.json({ error: "User no longer valid" }, { status: 401 });
  }

  // Gerar novo JWT
  const newToken = generateToken(user);

  const response = NextResponse.json({ success: true });

  response.cookies.set("auth-token", newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60,
    path: "/",
  });

  return response;
}
