"use client";

import { useState, useCallback, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import type { RetroBoard as RetroBoardType, RetroCard, RetroColumn as RetroColumnType, RetroUserPermissions } from "@/types/retro";
import RetroColumn from "./RetroColumn";
import RetroCardComponent from "./RetroCard";
import BoardHeader from "./BoardHeader";

interface RetroBoardProps {
  initialBoard: RetroBoardType;
  permissions: RetroUserPermissions;
  currentUserId: string;
  currentUserName: string;
  squadSlug: string;
}

export default function RetroBoard({
  initialBoard,
  permissions,
  currentUserId,
  currentUserName,
  squadSlug,
}: RetroBoardProps) {
  const [board, setBoard] = useState<RetroBoardType>(initialBoard);
  const [activeCard, setActiveCard] = useState<RetroCard | null>(null);
  const [activeColumnId, setActiveColumnId] = useState<string | null>(null);
  const [mergeMode, setMergeMode] = useState(false);
  const [pollPaused, setPollPaused] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // --- API helpers ---

  async function apiCards(action: string, payload: Record<string, unknown>) {
    const res = await fetch(`/api/retro/${squadSlug}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, payload }),
    });
    return res;
  }

  async function apiSaveBoard(updatedBoard: RetroBoardType) {
    await fetch(`/api/retro/${squadSlug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatedBoard),
    });
  }

  // --- Card operations ---

  const handleCreateCard = useCallback(async (columnId: string, text: string) => {
    const res = await apiCards("create", { columnId, text });
    if (res.ok) {
      const newCard: RetroCard = await res.json();
      setBoard((prev) => {
        const columns = prev.columns.map((col) =>
          col.id === columnId ? { ...col, cards: [...col.cards, newCard] } : col
        );
        return { ...prev, columns };
      });
    }
  }, [squadSlug]);

  const handleUpdateCard = useCallback(async (columnId: string, cardId: string, text: string) => {
    const res = await apiCards("update", { columnId, cardId, text });
    if (res.ok) {
      setBoard((prev) => {
        const columns = prev.columns.map((col) =>
          col.id === columnId
            ? { ...col, cards: col.cards.map((c) => (c.id === cardId ? { ...c, text } : c)) }
            : col
        );
        return { ...prev, columns };
      });
    }
  }, [squadSlug]);

  const handleDeleteCard = useCallback(async (columnId: string, cardId: string) => {
    const res = await apiCards("delete", { columnId, cardId });
    if (res.ok) {
      setBoard((prev) => {
        const columns = prev.columns.map((col) =>
          col.id === columnId
            ? { ...col, cards: col.cards.filter((c) => c.id !== cardId) }
            : col
        );
        return { ...prev, columns };
      });
    }
  }, [squadSlug]);

  const handleReact = useCallback(async (columnId: string, cardId: string, reactionType: string) => {
    const res = await apiCards("react", { columnId, cardId, reactionType });
    if (res.ok) {
      const updatedCard: RetroCard = await res.json();
      setBoard((prev) => {
        const columns = prev.columns.map((col) =>
          col.id === columnId
            ? { ...col, cards: col.cards.map((c) => (c.id === cardId ? updatedCard : c)) }
            : col
        );
        return { ...prev, columns };
      });
    }
  }, [squadSlug]);

  const handleVote = useCallback(async (columnId: string, cardId: string) => {
    const res = await apiCards("vote", { columnId, cardId });
    if (res.ok) {
      const updatedCard: RetroCard = await res.json();
      setBoard((prev) => {
        const columns = prev.columns.map((col) =>
          col.id === columnId
            ? { ...col, cards: col.cards.map((c) => (c.id === cardId ? updatedCard : c)) }
            : col
        );
        return { ...prev, columns };
      });
    }
  }, [squadSlug]);

  const handleUnmerge = useCallback(async (columnId: string, cardId: string) => {
    const res = await apiCards("unmerge", { columnId, cardId });
    if (res.ok) {
      // Refresh board after unmerge
      const refreshRes = await fetch(`/api/retro/${squadSlug}`);
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        setBoard(data.board);
      }
    }
  }, [squadSlug]);

  // --- Column operations ---

  const handleAddColumn = useCallback(async (title: string) => {
    const newCol: RetroColumnType = {
      id: `col-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      order: board.columns.length,
      cards: [],
    };
    const updatedBoard = { ...board, columns: [...board.columns, newCol] };
    setBoard(updatedBoard);
    await apiSaveBoard(updatedBoard);
  }, [board, squadSlug]);

  const handleRenameColumn = useCallback(async (columnId: string, title: string) => {
    const updatedBoard = {
      ...board,
      columns: board.columns.map((col) =>
        col.id === columnId ? { ...col, title } : col
      ),
    };
    setBoard(updatedBoard);
    await apiSaveBoard(updatedBoard);
  }, [board, squadSlug]);

  const handleDeleteColumn = useCallback(async (columnId: string) => {
    const updatedBoard = {
      ...board,
      columns: board.columns.filter((col) => col.id !== columnId),
    };
    setBoard(updatedBoard);
    await apiSaveBoard(updatedBoard);
  }, [board, squadSlug]);

  const handleClearColumn = useCallback(async (columnId: string) => {
    const updatedBoard = {
      ...board,
      columns: board.columns.map((col) =>
        col.id === columnId ? { ...col, cards: [] } : col
      ),
    };
    setBoard(updatedBoard);
    await apiSaveBoard(updatedBoard);
  }, [board, squadSlug]);

  // --- Drag and drop ---

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const cardId = active.id as string;

    for (const col of board.columns) {
      const card = col.cards.find((c) => c.id === cardId);
      if (card) {
        setActiveCard(card);
        setActiveColumnId(col.id);
        break;
      }
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find source column
    const sourceCol = board.columns.find((col) =>
      col.cards.some((c) => c.id === activeId)
    );
    if (!sourceCol) return;

    // Find target column (could be card id or column id)
    let targetCol = board.columns.find((col) => col.id === overId);
    if (!targetCol) {
      targetCol = board.columns.find((col) =>
        col.cards.some((c) => c.id === overId)
      );
    }
    if (!targetCol || sourceCol.id === targetCol.id) return;

    // Move card between columns (optimistic UI)
    setBoard((prev) => {
      const sourceCards = sourceCol.cards.filter((c) => c.id !== activeId);
      const movedCard = sourceCol.cards.find((c) => c.id === activeId)!;
      const targetCards = [...targetCol!.cards, movedCard];

      return {
        ...prev,
        columns: prev.columns.map((col) => {
          if (col.id === sourceCol.id) return { ...col, cards: sourceCards };
          if (col.id === targetCol!.id) return { ...col, cards: targetCards };
          return col;
        }),
      };
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveCard(null);
    setActiveColumnId(null);

    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Find current column of the active card
    const currentCol = board.columns.find((col) =>
      col.cards.some((c) => c.id === activeId)
    );
    if (!currentCol) return;

    // Check if dropped on another card in same column
    const overCardIdx = currentCol.cards.findIndex((c) => c.id === overId);
    const activeCardIdx = currentCol.cards.findIndex((c) => c.id === activeId);

    if (overCardIdx >= 0 && activeCardIdx >= 0 && activeId !== overId) {
      // Check if merge should happen (admin + same column + confirm)
      if (permissions.canMergeCards && mergeMode) {
        const targetCard = currentCol.cards[overCardIdx];
        const sourceCard = currentCol.cards[activeCardIdx];
        if (confirm(`Deseja unir os cards?\n\n"${sourceCard.text.slice(0, 50)}..."\ncom\n"${targetCard.text.slice(0, 50)}..."`)) {
          await apiCards("merge", {
            targetCardId: targetCard.id,
            sourceCardId: sourceCard.id,
            columnId: currentCol.id,
          });
          await handleRefresh();
          return;
        }
      }

      // Regular reorder within column
      const reordered = arrayMove(currentCol.cards, activeCardIdx, overCardIdx);
      const updatedBoard = {
        ...board,
        columns: board.columns.map((col) =>
          col.id === currentCol.id ? { ...col, cards: reordered } : col
        ),
      };
      setBoard(updatedBoard);

      // Persist move
      await apiCards("move", {
        cardId: activeId,
        fromColumnId: activeColumnId || currentCol.id,
        toColumnId: currentCol.id,
        newIndex: overCardIdx,
      });
    } else if (activeColumnId && activeColumnId !== currentCol.id) {
      // Cross-column move already handled in dragOver, just persist
      const newIndex = currentCol.cards.findIndex((c) => c.id === activeId);
      await apiCards("move", {
        cardId: activeId,
        fromColumnId: activeColumnId,
        toColumnId: currentCol.id,
        newIndex: newIndex >= 0 ? newIndex : currentCol.cards.length - 1,
      });
    }
  }

  // --- Board refresh (polling every 5s for multi-user sync) ---

  const handleRefresh = useCallback(async () => {
    const res = await fetch(`/api/retro/${squadSlug}`);
    if (res.ok) {
      const data = await res.json();
      setBoard(data.board);
    }
  }, [squadSlug]);

  // Auto-polling for real-time collaboration (paused during local operations)
  useEffect(() => {
    if (pollPaused) return;
    const interval = setInterval(handleRefresh, 5000);
    return () => clearInterval(interval);
  }, [handleRefresh, pollPaused]);

  // --- Settings update ---

  const handleSettingsUpdate = useCallback(async (settings: Partial<RetroBoardType["settings"]>) => {
    setPollPaused(true);
    const res = await fetch(`/api/retro/${squadSlug}/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      setBoard((prev) => ({ ...prev, settings: { ...prev.settings, ...settings } }));
    }
    // Resume polling after a short delay to let S3 propagate
    setTimeout(() => setPollPaused(false), 2000);
  }, [squadSlug]);

  return (
    <main className="min-h-screen flex flex-col">
      {/* Header fixo no topo */}
      <BoardHeader
        board={board}
        permissions={permissions}
        squadSlug={squadSlug}
        onAddColumn={handleAddColumn}
        onSettingsUpdate={handleSettingsUpdate}
        onRefresh={handleRefresh}
        mergeMode={mergeMode}
        onToggleMergeMode={() => setMergeMode(!mergeMode)}
      />

      {/* Board com colunas */}
      <div className="flex-1 overflow-x-auto p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 h-full min-h-[calc(100vh-120px)]">
            {board.columns
              .sort((a, b) => a.order - b.order)
              .map((column) => (
                <RetroColumn
                  key={column.id}
                  column={column}
                  permissions={permissions}
                  currentUserId={currentUserId}
                  settings={board.settings}
                  onCreateCard={handleCreateCard}
                  onUpdateCard={handleUpdateCard}
                  onDeleteCard={handleDeleteCard}
                  onReact={handleReact}
                  onVote={handleVote}
                  onUnmerge={handleUnmerge}
                  onRename={handleRenameColumn}
                  onDelete={handleDeleteColumn}
                  onClear={handleClearColumn}
                />
              ))}
          </div>

          {/* Drag overlay (ghost do card sendo arrastado) */}
          <DragOverlay>
            {activeCard && (
              <RetroCardComponent
                card={activeCard}
                columnId=""
                permissions={permissions}
                currentUserId={currentUserId}
                settings={board.settings}
                isDragging
              />
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </main>
  );
}
