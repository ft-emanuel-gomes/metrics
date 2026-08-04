import { NextRequest, NextResponse } from "next/server";
import { buildJiraContext } from "@/services/ai-agilista";

export const dynamic = "force-dynamic";

/**
 * POST /api/ai-agilista
 * Gera análise de fluxo para a daily baseada em regras (sem LLM).
 * Quando a LLM estiver disponível, basta reativar callAgilista com proxy.
 *
 * Body: { message: string, squad?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { squad } = body;

    if (!squad || typeof squad !== "string") {
      return NextResponse.json({
        response: "Selecione uma squad no dropdown acima para que eu possa analisar o fluxo de trabalho.",
      });
    }

    // Gerar análise estruturada a partir dos dados do Jira
    const analysis = await buildJiraContext(squad);

    return NextResponse.json({ response: analysis });
  } catch (error) {
    console.error("[Agile IA] Erro:", error);
    const message = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
