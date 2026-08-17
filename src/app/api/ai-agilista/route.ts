import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/services/auth-session";
import { buildJiraContext } from "@/services/ai-agilista";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { squad, message } = body;

    if (!squad && !message) {
      return NextResponse.json({ error: "Parametro squad ou message obrigatorio" }, { status: 400 });
    }

    const slug = squad || "";
    const analysis = await buildJiraContext(slug);

    return NextResponse.json({ response: analysis });
  } catch (error) {
    console.error("[AI Agilista] Erro:", error);
    const msg = error instanceof Error ? error.message : "Erro interno";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
