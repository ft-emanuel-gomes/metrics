/**
 * POST /api/retro/[squad]/cards — Criar card, reagir, votar, mover, merge, deletar.
 * Todas as operações de card passam por aqui com action no body.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/services/auth-session";
import { getLatestBoard, saveBoard } from "@/services/retro-storage";
import { canAccessBoard, getRetroRole, canModifyCard } from "@/services/retro-permissions";
import type {
  RetroCard,
  CreateCardPayload,
  UpdateCardPayload,
  DeleteCardPayload,
  MoveCardPayload,
  MergeCardsPayload,
  UnmergePayload,
  ReactPayload,
  VotePayload,
  ReactionType,
} from "@/types/retro";

interface RouteParams {
  params: Promise<{ squad: string }>;
}

type CardAction =
  | { action: "create"; payload: CreateCardPayload }
  | { action: "update"; payload: UpdateCardPayload }
  | { action: "delete"; payload: DeleteCardPayload }
  | { action: "move"; payload: MoveCardPayload }
  | { action: "merge"; payload: MergeCardsPayload }
  | { action: "unmerge"; payload: UnmergePayload }
  | { action: "react"; payload: ReactPayload }
  | { action: "vote"; payload: VotePayload };

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { squad: squadSlug } = await params;
  const session = await getAuthSession();
  if (!session) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  if (!canAccessBoard(session.isAdmin, session.allowedSquads, squadSlug)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body: CardAction = await request.json();
  const role = getRetroRole(session.isAdmin);
  const userId = session.accountId || session.email;
  const userName = session.displayName || session.email;

  const board = await getLatestBoard(squadSlug);
  if (!board) {
    return NextResponse.json({ error: "Board não encontrado" }, { status: 404 });
  }

  switch (body.action) {
    case "create": {
      const { columnId, text } = body.payload;
      const column = board.columns.find((c) => c.id === columnId);
      if (!column) return NextResponse.json({ error: "Coluna não encontrada" }, { status: 404 });

      const newCard: RetroCard = {
        id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        authorId: userId,
        authorName: userName,
        createdAt: new Date().toISOString(),
        reactions: [],
        votes: [],
      };

      column.cards.push(newCard);
      await saveBoard(board);
      return NextResponse.json(newCard, { status: 201 });
    }

    case "update": {
      const { cardId, columnId, text } = body.payload;
      const column = board.columns.find((c) => c.id === columnId);
      if (!column) return NextResponse.json({ error: "Coluna não encontrada" }, { status: 404 });

      const card = column.cards.find((c) => c.id === cardId);
      if (!card) return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });

      if (!canModifyCard(role, card.authorId, userId)) {
        return NextResponse.json({ error: "Sem permissão para editar este card" }, { status: 403 });
      }

      if (text !== undefined) card.text = text;
      await saveBoard(board);
      return NextResponse.json(card);
    }

    case "delete": {
      const { cardId, columnId } = body.payload;
      const column = board.columns.find((c) => c.id === columnId);
      if (!column) return NextResponse.json({ error: "Coluna não encontrada" }, { status: 404 });

      const cardIdx = column.cards.findIndex((c) => c.id === cardId);
      if (cardIdx === -1) return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });

      const card = column.cards[cardIdx];
      if (!canModifyCard(role, card.authorId, userId)) {
        return NextResponse.json({ error: "Sem permissão para excluir este card" }, { status: 403 });
      }

      column.cards.splice(cardIdx, 1);
      await saveBoard(board);
      return NextResponse.json({ success: true });
    }

    case "move": {
      const { cardId, fromColumnId, toColumnId, newIndex } = body.payload;
      const fromCol = board.columns.find((c) => c.id === fromColumnId);
      const toCol = board.columns.find((c) => c.id === toColumnId);
      if (!fromCol || !toCol) return NextResponse.json({ error: "Coluna não encontrada" }, { status: 404 });

      const cardIdx = fromCol.cards.findIndex((c) => c.id === cardId);
      if (cardIdx === -1) return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });

      const [card] = fromCol.cards.splice(cardIdx, 1);
      toCol.cards.splice(newIndex, 0, card);
      await saveBoard(board);
      return NextResponse.json({ success: true });
    }

    case "merge": {
      if (role !== "admin") {
        return NextResponse.json({ error: "Apenas Administrators podem fazer merge" }, { status: 403 });
      }

      const { targetCardId, sourceCardId, columnId } = body.payload;
      const column = board.columns.find((c) => c.id === columnId);
      if (!column) return NextResponse.json({ error: "Coluna não encontrada" }, { status: 404 });

      const targetCard = column.cards.find((c) => c.id === targetCardId);
      const sourceIdx = column.cards.findIndex((c) => c.id === sourceCardId);
      if (!targetCard || sourceIdx === -1) {
        return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });
      }

      const sourceCard = column.cards[sourceIdx];

      // Merge: combinar textos com quebra de linha
      targetCard.text = `${targetCard.text}\n---\n${sourceCard.text}`;
      // Registrar merge com autoria para unmerge futuro
      targetCard.mergedFrom = [...(targetCard.mergedFrom || []), JSON.stringify({ id: sourceCard.id, authorId: sourceCard.authorId, authorName: sourceCard.authorName })];
      // Combinar reações e votos
      for (const sourceReaction of sourceCard.reactions) {
        const existing = targetCard.reactions.find((r) => r.type === sourceReaction.type);
        if (existing) {
          const uniqueUsers = new Set([...existing.userIds, ...sourceReaction.userIds]);
          existing.userIds = [...uniqueUsers];
        } else {
          targetCard.reactions.push({ ...sourceReaction });
        }
      }
      const uniqueVotes = new Set([...targetCard.votes, ...sourceCard.votes]);
      targetCard.votes = [...uniqueVotes];

      // Remover source card
      column.cards.splice(sourceIdx, 1);
      await saveBoard(board);
      return NextResponse.json(targetCard);
    }

    case "react": {
      const { cardId, columnId, reactionType } = body.payload;
      const column = board.columns.find((c) => c.id === columnId);
      if (!column) return NextResponse.json({ error: "Coluna não encontrada" }, { status: 404 });

      const card = column.cards.find((c) => c.id === cardId);
      if (!card) return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });

      const validTypes: ReactionType[] = ["heart", "thumbsUp", "thumbsDown"];
      if (!validTypes.includes(reactionType)) {
        return NextResponse.json({ error: "Tipo de reação inválido" }, { status: 400 });
      }

      let reaction = card.reactions.find((r) => r.type === reactionType);
      if (!reaction) {
        reaction = { type: reactionType, userIds: [] };
        card.reactions.push(reaction);
      }

      // Toggle: se já reagiu, remove; se não, adiciona
      const idx = reaction.userIds.indexOf(userId);
      if (idx >= 0) {
        reaction.userIds.splice(idx, 1);
      } else {
        reaction.userIds.push(userId);
      }

      await saveBoard(board);
      return NextResponse.json(card);
    }

    case "vote": {
      const { cardId, columnId } = body.payload;
      if (!board.settings.votingEnabled) {
        return NextResponse.json({ error: "Votação desabilitada" }, { status: 400 });
      }

      const column = board.columns.find((c) => c.id === columnId);
      if (!column) return NextResponse.json({ error: "Coluna não encontrada" }, { status: 404 });

      const card = column.cards.find((c) => c.id === cardId);
      if (!card) return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });

      // Verificar se já votou (toggle)
      const voteIdx = card.votes.indexOf(userId);
      if (voteIdx >= 0) {
        // Remover voto
        card.votes.splice(voteIdx, 1);
        await saveBoard(board);
        return NextResponse.json(card);
      }

      // Verificar limite de votos
      const maxVotes = board.settings.maxVotesPerUser;
      if (maxVotes > 0) {
        let userVoteCount = 0;

        if (board.settings.voteScopePerColumn) {
          // Contar votos apenas nesta coluna
          userVoteCount = column.cards.reduce(
            (count, c) => count + (c.votes.includes(userId) ? 1 : 0), 0
          );
        } else {
          // Contar votos em todo o board
          userVoteCount = board.columns.reduce(
            (total, col) => total + col.cards.reduce(
              (count, c) => count + (c.votes.includes(userId) ? 1 : 0), 0
            ), 0
          );
        }

        if (userVoteCount >= maxVotes) {
          const scope = board.settings.voteScopePerColumn ? "nesta coluna" : "neste board";
          return NextResponse.json({
            error: `Limite de ${maxVotes} votos ${scope} atingido`
          }, { status: 400 });
        }
      }

      card.votes.push(userId);
      await saveBoard(board);
      return NextResponse.json(card);
    }

    case "unmerge": {
      if (role !== "admin") {
        return NextResponse.json({ error: "Apenas Administrators podem desfazer merge" }, { status: 403 });
      }

      const { cardId, columnId } = body.payload;
      const column = board.columns.find((c) => c.id === columnId);
      if (!column) return NextResponse.json({ error: "Coluna não encontrada" }, { status: 404 });

      const card = column.cards.find((c) => c.id === cardId);
      if (!card) return NextResponse.json({ error: "Card não encontrado" }, { status: 404 });

      if (!card.mergedFrom || card.mergedFrom.length === 0) {
        return NextResponse.json({ error: "Este card não é resultado de merge" }, { status: 400 });
      }

      // Separar textos pelo delimitador de merge
      const parts = card.text.split("\n---\n");
      if (parts.length < 2) {
        return NextResponse.json({ error: "Não foi possível separar os textos" }, { status: 400 });
      }

      // Manter o primeiro texto no card original, criar novos cards para os demais
      card.text = parts[0];
      const mergedAuthors = card.mergedFrom || [];
      card.mergedFrom = undefined;

      // Criar cards separados para os textos restantes (preservar autoria se disponivel)
      for (let i = 1; i < parts.length; i++) {
        let authorId = card.authorId;
        let authorName = card.authorName;

        // Tentar recuperar autoria original do merge metadata
        if (mergedAuthors[i - 1]) {
          try {
            const meta = JSON.parse(mergedAuthors[i - 1]);
            if (meta.authorId) authorId = meta.authorId;
            if (meta.authorName) authorName = meta.authorName;
          } catch { /* formato antigo (apenas ID) — usar autoria do card pai */ }
        }

        const newCard: RetroCard = {
          id: `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text: parts[i],
          authorId,
          authorName,
          createdAt: new Date().toISOString(),
          reactions: [],
          votes: [],
        };
        column.cards.push(newCard);
      }

      await saveBoard(board);
      return NextResponse.json({ success: true, cardsCount: parts.length });
    }

    default:
      return NextResponse.json({ error: "Ação inválida" }, { status: 400 });
  }
}
