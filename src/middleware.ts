import { NextRequest, NextResponse } from "next/server";

/**
 * Middleware de autenticação — protege todas as rotas exceto /login e /api/auth.
 * Verifica presença do cookie 'auth-token' e redireciona para /login se ausente.
 *
 * Nota: a validação real do JWT é feita server-side nas pages/routes.
 * O middleware apenas verifica existência do cookie (leve, sem crypto no edge).
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
    // Redirecionar para login
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Proteger todas as rotas exceto assets estáticos
    "/((?!_next/static|_next/image|favicon.ico|images/).*)",
  ],
};
