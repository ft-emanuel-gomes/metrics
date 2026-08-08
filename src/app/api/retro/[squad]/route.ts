/**
 * GET /api/retro/[squad] — Carrega o board mais recente da squad (ou cria um se não existir).
 * PUT /api/retro/[squad] — Salva o board completo (usado para operações de coluna, reorder, etc).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/services/auth-session";
import { getLatestBoard, createBoard, saveBoard } from "@/services/retro-storage";
import { canAccessBoard, getRetroRole, getRetroPermissions } from "@/services/retro-permissions";
import { getSquadBySlug } from "@/config/squads";
import type { RetroBoard } from "@/types/retro";

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
    return NextResponse.json({ error: "Sem permissão para esta squad" }, { status: 403 });
  }

  const squad = getSquadBySlug(squadSlug);
  if (!squad) {
    return NextResponse.json({ error: "Squad não encontrada" }, { status: 404 });
  }

  let board = await getLatestBoard(squadSlug);

  // Se não existe board, criar um padrão automaticamente (para Admins)
  if (!board && session.isAdmin) {
    const boardId = `board-${Date.now()}`;
    board = await createBoard(squadSlug, squad.name, session.accountId || "unknown", boardId);
  }

  if (!board) {
    return NextResponse.json({ error: "Nenhum board encontrado. Peça ao Agilista para criar." }, { status: 404 });
  }

  // Incluir permissões do usuário na resposta
  const role = getRetroRole(session.isAdmin);
  const permissions = getRetroPermissions(role);

  return NextResponse.json({
    board,
    permissions,
    currentUserId: session.accountId || session.email,
  });
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { squad: squadSlug } = await params;
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  if (!canAccessBoard(session.isAdmin, session.allowedSquads, squadSlug)) {
    return NextResponse.json({ error: "Sem permissão para esta squad" }, { status: 403 });
  }

  // Apenas admins podem atualizar o board completo (colunas, reorder, etc)
  if (!session.isAdmin) {
    return NextResponse.json({ error: "Apenas Administrators podem gerenciar o board" }, { status: 403 });
  }

  const body: RetroBoard = await request.json();

  // Validar que o board pertence à squad
  if (body.squadSlug !== squadSlug) {
    return NextResponse.json({ error: "Board não pertence a esta squad" }, { status: 400 });
  }

  await saveBoard(body);
  return NextResponse.json({ success: true });
}
