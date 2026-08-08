/**
 * GET /api/retro/[squad]/settings — Configurações atuais do board.
 * PUT /api/retro/[squad]/settings — Atualizar configurações (somente Admin).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/services/auth-session";
import { getLatestBoard, saveBoard } from "@/services/retro-storage";
import { canAccessBoard } from "@/services/retro-permissions";
import type { RetroBoardSettings } from "@/types/retro";

interface RouteParams {
  params: Promise<{ squad: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { squad: squadSlug } = await params;
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  if (!canAccessBoard(session.isAdmin, session.allowedSquads, squadSlug)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const board = await getLatestBoard(squadSlug);
  if (!board) {
    return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
  }

  return NextResponse.json(board.settings);
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { squad: squadSlug } = await params;
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  if (!session.isAdmin) {
    return NextResponse.json({ error: "Apenas Administrators podem alterar configurações" }, { status: 403 });
  }

  const body: Partial<RetroBoardSettings> = await request.json();
  const board = await getLatestBoard(squadSlug);
  if (!board) {
    return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
  }

  // Validar campos
  if (body.maxVotesPerUser !== undefined && (body.maxVotesPerUser < 1 || body.maxVotesPerUser > 50)) {
    return NextResponse.json({ error: "maxVotesPerUser deve ser entre 1 e 50" }, { status: 400 });
  }

  board.settings = { ...board.settings, ...body };
  await saveBoard(board);

  return NextResponse.json(board.settings);
}
