/**
 * GET /api/retro/boards — Lista boards das squads permitidas ao usuário.
 * POST /api/retro/boards — Cria novo board para uma squad.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/services/auth-session";
import { listBoards, createBoard } from "@/services/retro-storage";
import { canAccessBoard } from "@/services/retro-permissions";
import { getAllSquads } from "@/config/squads";
import type { RetroBoardSummary } from "@/types/retro";

export async function GET() {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const allSquads = getAllSquads();
  const results: RetroBoardSummary[] = [];

  for (const squad of allSquads) {
    if (!canAccessBoard(session.isAdmin, session.allowedSquads, squad.slug)) continue;

    const boards = await listBoards(squad.slug);
    results.push(...boards);
  }

  return NextResponse.json(results);
}

export async function POST(request: NextRequest) {
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  if (!session.isAdmin) {
    return NextResponse.json({ error: "Apenas Administrators podem criar boards" }, { status: 403 });
  }

  const body = await request.json();
  const { squadSlug } = body;

  if (!squadSlug) {
    return NextResponse.json({ error: "squadSlug obrigatório" }, { status: 400 });
  }

  const allSquads = getAllSquads();
  const squad = allSquads.find((s) => s.slug === squadSlug);
  if (!squad) {
    return NextResponse.json({ error: "Squad não encontrada" }, { status: 404 });
  }

  const boardId = `board-${Date.now()}`;
  const board = await createBoard(squadSlug, squad.name, session.accountId || "unknown", boardId);

  return NextResponse.json(board, { status: 201 });
}
