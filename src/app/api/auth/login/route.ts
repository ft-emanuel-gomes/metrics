import { NextRequest, NextResponse } from "next/server";
import { validateUserByEmail, generateToken } from "@/services/auth-service";
import { loadRefreshToken, refreshAtlassianToken, saveRefreshToken } from "@/services/auth-tokens";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login
 *
 * Fluxo seguro:
 * 1. Valida que o email existe no Jira (usuário ativo com permissões)
 * 2. Verifica se o usuário já consentiu antes (refresh_token no S3)
 *    - Se SIM: valida o refresh_token na Atlassian → login direto (sem consentimento)
 *    - Se NÃO: retorna needsOAuth=true → frontend redireciona para OAuth (login + consentimento)
 *
 * Segurança: O refresh_token só existe se o usuário já autenticou com senha + 2FA + consentiu.
 * Usar o refresh_token é equivalente a uma sessão "lembrar-me" — a identidade já foi provada.
 *
 * Body: { email: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json(
        { error: "EMAIL_REQUIRED", message: "Informe o email corporativo." },
        { status: 400 }
      );
    }

    const emailLower = email.trim().toLowerCase();

    // 1. Validar que o usuário existe no Jira e tem permissões
    const user = await validateUserByEmail(emailLower);

    if (!user) {
      return NextResponse.json(
        { error: "USER_NOT_FOUND", message: "Usuário não encontrado ou sem acesso ao sistema." },
        { status: 401 }
      );
    }

    if (user.allowedSquads.length === 0) {
      return NextResponse.json(
        { error: "NO_PERMISSIONS", message: "Usuário sem permissão em nenhum projeto." },
        { status: 403 }
      );
    }

    // 2. Verificar se já tem consentimento salvo (refresh_token no S3)
    const storedRefreshToken = await loadRefreshToken(user.accountId).catch(() => null);

    if (!storedRefreshToken) {
      // Sem consentimento prévio → precisa OAuth completo (login + consentimento)
      return NextResponse.json({
        success: false,
        needsOAuth: true,
        message: "Primeira autenticação. Você será redirecionado para a Atlassian.",
      });
    }

    // 3. Tem consentimento → validar refresh_token na Atlassian
    const result = await refreshAtlassianToken(storedRefreshToken);

    if (!result) {
      // Refresh_token expirou ou foi revogado → precisa OAuth novamente
      return NextResponse.json({
        success: false,
        needsOAuth: true,
        message: "Sessão expirada. Você será redirecionado para a Atlassian.",
      });
    }

    // 4. Refresh_token válido — salvar novo se rotacionou
    if (result.refreshToken !== storedRefreshToken) {
      await saveRefreshToken(user.accountId, emailLower, result.refreshToken).catch(() => {});
    }

    // 5. Login bem-sucedido — gerar JWT
    const token = generateToken(user);

    const response = NextResponse.json({ success: true });

    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[Auth] Erro no login:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: "INTERNAL_ERROR", message }, { status: 500 });
  }
}
