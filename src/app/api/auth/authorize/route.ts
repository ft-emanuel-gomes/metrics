import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/authorize
 * Redireciona o usuário para a tela de login da Atlassian (OAuth 2.0 3LO).
 */
export async function GET() {
  const clientId = process.env.ATLASSIAN_CLIENT_ID;
  const redirectUri = process.env.ATLASSIAN_REDIRECT_URI || "http://localhost:3000/api/auth/callback";

  if (!clientId) {
    return NextResponse.json({ error: "OAuth not configured" }, { status: 500 });
  }

  const scopes = ["read:me", "read:jira-user", "read:jira-work", "offline_access"].join(" ");
  const state = crypto.randomUUID(); // CSRF protection

  const authUrl = new URL("https://auth.atlassian.com/authorize");
  authUrl.searchParams.set("audience", "api.atlassian.com");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("prompt", "login"); // SEMPRE pedir senha — segurança

  return NextResponse.redirect(authUrl.toString());
}
