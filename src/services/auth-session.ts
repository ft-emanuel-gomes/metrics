/**
 * Server-side auth session helper.
 * Lê o cookie auth-token e decodifica o JWT para obter permissões do usuário.
 */

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { verifyToken, type JwtPayload } from "./auth-service";

/**
 * Obtém a sessão do usuário autenticado a partir dos cookies.
 * Retorna null se não autenticado ou token inválido.
 */
export async function getAuthSession(): Promise<JwtPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;

  if (!token) return null;

  return verifyToken(token);
}

/**
 * Exige administrador nas rotas da Central Administrativa.
 * Sem sessão → 401; sessão sem isAdmin → 403. Uso:
 *   const auth = await requireAdmin(); if (!auth.ok) return auth.response;
 */
export async function requireAdmin(): Promise<
  { ok: true; session: JwtPayload } | { ok: false; response: NextResponse }
> {
  const session = await getAuthSession();
  if (!session) {
    return { ok: false, response: NextResponse.json({ error: "UNAUTHORIZED", message: "Faça login para continuar." }, { status: 401 }) };
  }
  if (!session.isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "FORBIDDEN", message: "Apenas administradores." }, { status: 403 }) };
  }
  return { ok: true, session };
}

/** Quem gravou (auditoria): e-mail do administrador. */
export function actorOf(session: JwtPayload): string {
  return session.email || session.accountId;
}
