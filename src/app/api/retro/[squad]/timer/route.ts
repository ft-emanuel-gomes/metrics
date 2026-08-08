/**
 * GET /api/retro/[squad]/timer — Estado atual do timer.
 * PUT /api/retro/[squad]/timer — Controlar timer (start, pause, reset, set).
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/services/auth-session";
import { getLatestBoard, saveBoard } from "@/services/retro-storage";
import { canAccessBoard } from "@/services/retro-permissions";
import type { TimerPayload } from "@/types/retro";

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

  return NextResponse.json(board.timer);
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { squad: squadSlug } = await params;
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  if (!session.isAdmin) {
    return NextResponse.json({ error: "Apenas Administrators podem controlar o timer" }, { status: 403 });
  }

  const body: TimerPayload = await request.json();
  const board = await getLatestBoard(squadSlug);
  if (!board) {
    return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
  }

  switch (body.action) {
    case "start": {
      board.timer.startedAt = new Date().toISOString();
      board.timer.pausedAt = null;
      board.timer.remainingOnPause = undefined;
      break;
    }

    case "pause": {
      if (!board.timer.startedAt) {
        return NextResponse.json({ error: "Timer não está rodando" }, { status: 400 });
      }
      const elapsed = (Date.now() - new Date(board.timer.startedAt).getTime()) / 1000;
      const remaining = Math.max(0, board.timer.durationSeconds - elapsed);
      board.timer.pausedAt = new Date().toISOString();
      board.timer.remainingOnPause = Math.ceil(remaining);
      break;
    }

    case "reset": {
      board.timer.startedAt = null;
      board.timer.pausedAt = null;
      board.timer.remainingOnPause = undefined;
      break;
    }

    case "set": {
      if (body.durationSeconds && body.durationSeconds > 0) {
        board.timer.durationSeconds = body.durationSeconds;
        // Reset timer ao mudar duração
        board.timer.startedAt = null;
        board.timer.pausedAt = null;
        board.timer.remainingOnPause = undefined;
      }
      break;
    }

    default:
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }

  await saveBoard(board);
  return NextResponse.json(board.timer);
}
