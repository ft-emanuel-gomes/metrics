import { NextRequest, NextResponse } from "next/server";
import { validateUserByEmail, generateToken } from "@/services/auth-service";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login
 * Autentica usuário pelo email corporativo contra o Jira.
 * Retorna JWT com permissões de acesso.
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

    // Validar formato do email
    const emailLower = email.trim().toLowerCase();
    if (!emailLower.includes("@")) {
      return NextResponse.json(
        { error: "INVALID_EMAIL", message: "Formato de email inválido." },
        { status: 400 }
      );
    }

    // Validar usuário no Jira e buscar permissões
    const user = await validateUserByEmail(emailLower);

    if (!user) {
      return NextResponse.json(
        { error: "USER_NOT_FOUND", message: "Usuário não encontrado ou sem acesso ao sistema." },
        { status: 401 }
      );
    }

    if (user.allowedSquads.length === 0) {
      return NextResponse.json(
        { error: "NO_PERMISSIONS", message: "Usuário não possui permissão em nenhum projeto." },
        { status: 403 }
      );
    }

    // Gerar token JWT
    const token = generateToken(user);

    // Retornar token e dados do usuário
    const response = NextResponse.json({
      success: true,
      token,
      user: {
        displayName: user.displayName,
        email: user.email,
        isAdmin: user.isAdmin,
        allowedSquads: user.allowedSquads,
      },
    });

    // Setar cookie httpOnly para o token
    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 8 * 60 * 60, // 8 horas
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[Auth] Erro no login:", error);

    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json(
      { error: "INTERNAL_ERROR", message },
      { status: 500 }
    );
  }
}
