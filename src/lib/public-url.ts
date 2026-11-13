import type { NextRequest } from "next/server";

/**
 * Builds an absolute URL on the PUBLIC origin of the app.
 *
 * Behind CloudFront -> EC2, `request.url` carries the internal origin
 * (http://localhost:3000), so redirects built from it send the browser to an
 * address it cannot reach. The public origin is derived from
 * ATLASSIAN_REDIRECT_URI (already set per environment), falling back to
 * forwarded headers and finally to request.url.
 */
export function publicUrl(path: string, request: NextRequest): URL {
  const configured = process.env.ATLASSIAN_REDIRECT_URI;
  if (configured) {
    try {
      return new URL(path, new URL(configured).origin);
    } catch {
      // ATLASSIAN_REDIRECT_URI inválida — segue para o fallback
    }
  }

  const host = request.headers.get("x-forwarded-host");
  if (host) {
    const proto = request.headers.get("x-forwarded-proto") || "https";
    return new URL(path, `${proto}://${host}`);
  }

  return new URL(path, request.url);
}
