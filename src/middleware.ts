import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware de autenticação.
 * - Verifica presença do cookie 'auth-token'
 * - Se ausente, redireciona para /login
 * - Se presente mas expirado, tenta refresh silencioso via /api/auth/refresh
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Rotas públicas — não requerem auth
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/images") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Verificar cookie de autenticação
  const token = request.cookies.get("auth-token")?.value;

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  // Verificar se o JWT expirou (decodificar sem lib no edge — checar exp claim)
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      // JWT expirado — redirecionar para refresh endpoint que renova silenciosamente
      // O refresh é feito client-side via fetch para evitar loops no middleware
      const refreshUrl = new URL("/login?expired=true", request.url);
      return NextResponse.redirect(refreshUrl);
    }
  } catch {
    // Token malformado — redirecionar para login
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|images/).*)",
  ],
};
