import { NextRequest, NextResponse } from "next/server";
import { publicUrl } from "@/lib/public-url";
import { validateUserByEmail, generateToken } from "@/services/auth-service";
import { saveRefreshToken } from "@/services/auth-tokens";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/callback
 * Callback do OAuth Atlassian. Recebe authorization_code, troca por access_token,
 * busca dados do usuário, valida permissões e cria sessão.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");
  const state = request.nextUrl.searchParams.get("state");

  if (error) {
    // Usuário cancelou ou erro no OAuth
    return NextResponse.redirect(publicUrl("/login?error=oauth_denied", request));
  }

  if (!code) {
    return NextResponse.redirect(publicUrl("/login?error=no_code", request));
  }

  // Validação anti-CSRF: o state do callback deve bater com o cookie gravado no /authorize
  const expectedState = request.cookies.get("oauth-state")?.value;
  if (!expectedState || !state || state !== expectedState) {
    return NextResponse.redirect(publicUrl("/login?error=state_mismatch", request));
  }

  const clientId = process.env.ATLASSIAN_CLIENT_ID;
  const clientSecret = process.env.ATLASSIAN_CLIENT_SECRET;
  const redirectUri = process.env.ATLASSIAN_REDIRECT_URI || "http://localhost:3000/api/auth/callback";

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(publicUrl("/login?error=config", request));
  }

  try {
    // 1. Trocar authorization_code por access_token
    const tokenResponse = await fetch("https://auth.atlassian.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      console.error("[OAuth] Token exchange failed:", await tokenResponse.text());
      return NextResponse.redirect(publicUrl("/login?error=token_exchange", request));
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // 2. Buscar dados do usuário autenticado
    const meResponse = await fetch("https://api.atlassian.com/me", {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });

    if (!meResponse.ok) {
      return NextResponse.redirect(publicUrl("/login?error=user_fetch", request));
    }

    const meData = await meResponse.json();
    const email = meData.email;

    if (!email) {
      return NextResponse.redirect(publicUrl("/login?error=no_email", request));
    }

    // 3. Validar permissões do usuário no Jira
    const user = await validateUserByEmail(email);

    if (!user) {
      return NextResponse.redirect(publicUrl("/login?error=no_permissions", request));
    }

    if (user.allowedSquads.length === 0) {
      return NextResponse.redirect(publicUrl("/login?error=no_squads", request));
    }

    // 4. Salvar refresh_token no S3 (para renovação silenciosa futura)
    if (tokenData.refresh_token) {
      await saveRefreshToken(user.accountId, email, tokenData.refresh_token).catch(() => {});
    }

    // 5. Gerar JWT interno e criar sessão
    const token = generateToken(user);

    const response = NextResponse.redirect(publicUrl("/", request));

    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 dias
      path: "/",
    });

    // state já consumido — remover o cookie
    response.cookies.set("oauth-state", "", { maxAge: 0, path: "/" });

    return response;
  } catch (error) {
    console.error("[OAuth] Callback error:", error);
    return NextResponse.redirect(publicUrl("/login?error=internal", request));
  }
}
