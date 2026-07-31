/**
 * Server-side auth session helper.
 * Lê o cookie auth-token e decodifica o JWT para obter permissões do usuário.
 */

import { cookies } from "next/headers";
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
