import { NextRequest, NextResponse } from "next/server";
import { publicUrl } from "@/lib/public-url";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/authorize
 *
 * Inicia o fluxo OAuth 2.0 (3LO) da Atlassian.
 * Monta a URL de autorização e redireciona o usuário para login + consentimento.
 * Após o consentimento, a Atlassian redireciona de volta para ATLASSIAN_REDIRECT_URI
 * (ver /api/auth/callback), que troca o `code` por tokens e cria a sessão.
 *
 * Scopes:
 * - read:me                → necessário para GET https://api.atlassian.com/me (identidade)
 *                            (somente scopes cadastrados no app OAuth do developer console
 *                             podem ser pedidos; read:account NÃO está cadastrado)
 * - offline_access         → necessário para receber refresh_token (login silencioso futuro)
 */
export async function GET(request: NextRequest) {
  const clientId = process.env.ATLASSIAN_CLIENT_ID;
  const redirectUri =
    process.env.ATLASSIAN_REDIRECT_URI || "http://localhost:3000/api/auth/callback";

  if (!clientId) {
    return NextResponse.redirect(publicUrl("/login?error=config", request));
  }

  // state anti-CSRF: valor aleatório, enviado à Atlassian e guardado em cookie
  const state = randomBytes(16).toString("hex");

  const scopes = ["read:me", "offline_access"];

  const authUrl = new URL("https://auth.atlassian.com/authorize");
  authUrl.searchParams.set("audience", "api.atlassian.com");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("prompt", "consent");

  const response = NextResponse.redirect(authUrl.toString());

  // Guarda o state para validação no callback
  response.cookies.set("oauth-state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60, // 10 minutos
    path: "/",
  });

  return response;
}
