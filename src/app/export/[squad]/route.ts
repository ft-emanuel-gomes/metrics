import { NextRequest, NextResponse } from "next/server";
import { getSquadBySlug } from "@/config/squads";
import { getAuthSession } from "@/services/auth-session";
import { renderDashboardPdf, PdfRenderError, PdfRendererUnavailableError } from "@/services/pdf-renderer";

// PDF gerado sob demanda (dados em tempo real): nunca cachear
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Filtros do dashboard que podem ir para o PDF (o resto da query é ignorado). */
const ALLOWED_FILTERS = ["sprints", "months", "issueType"] as const;

/**
 * GET /export/[squad] — PDF do dashboard da squad (A4 paisagem), igual ao que o usuário vê.
 * Query: sprints | months | issueType (mesmos filtros da tela), theme=light|dark, download=1 (anexo).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ squad: string }> }) {
  const { squad: slug } = await params;
  const squad = getSquadBySlug(slug);
  if (!squad) return NextResponse.json({ error: "SQUAD_NOT_FOUND", message: "Squad não encontrada." }, { status: 404 });

  // Mesmas regras de acesso da página do dashboard
  const session = await getAuthSession();
  const authToken = request.cookies.get("auth-token")?.value;
  if (!session || !authToken) return NextResponse.json({ error: "UNAUTHORIZED", message: "Faça login novamente." }, { status: 401 });
  if (!session.isAdmin && !session.allowedSquads.includes(slug)) {
    return NextResponse.json({ error: "SQUAD_NOT_FOUND", message: "Squad não encontrada." }, { status: 404 });
  }

  const sp = request.nextUrl.searchParams;
  const query = new URLSearchParams();
  for (const key of ALLOWED_FILTERS) {
    const value = sp.get(key);
    if (value) query.set(key, value);
  }
  const theme = sp.get("theme") === "light" ? "light" : "dark";
  const disposition = sp.get("download") === "1" ? "attachment" : "inline";
  const date = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }); // YYYY-MM-DD
  const filename = `metrics-${slug}-${date}.pdf`;

  try {
    const pdf = await renderDashboardPdf({ squadSlug: slug, query, authToken, theme });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof PdfRendererUnavailableError) {
      // O cliente cai na impressão do navegador ("Salvar como PDF") sobre a própria página
      console.error("[export] Gerador de PDF indisponível:", error.message);
      return NextResponse.json({ error: "PDF_RENDERER_UNAVAILABLE", message: "Gerador de PDF indisponível no servidor." }, { status: 503 });
    }
    if (error instanceof PdfRenderError) {
      return NextResponse.json({ error: "PDF_RENDER_FAILED", message: error.message }, { status: error.status });
    }
    console.error("[export] Falha ao gerar PDF:", error);
    return NextResponse.json({ error: "PDF_RENDER_FAILED", message: "Não foi possível gerar o PDF. Tente novamente." }, { status: 500 });
  }
}
