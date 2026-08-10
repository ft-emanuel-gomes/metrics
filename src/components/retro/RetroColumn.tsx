"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { RetroColumn as RetroColumnType, RetroUserPermissions, RetroBoardSettings } from "@/types/retro";
import RetroCardComponent from "./RetroCard";

interface RetroColumnProps {
  column: RetroColumnType;
  permissions: RetroUserPermissions;
  currentUserId: string;
  settings: RetroBoardSettings;
  onCreateCard: (columnId: string, text: string) => Promise<void>;
  onUpdateCard: (columnId: string, cardId: string, text: string) => Promise<void>;
  onDeleteCard: (columnId: string, cardId: string) => Promise<void>;
  onReact: (columnId: string, cardId: string, reactionType: string) => Promise<void>;
  onVote: (columnId: string, cardId: string) => Promise<void>;
  onUnmerge: (columnId: string, cardId: string) => Promise<void>;
  onRename: (columnId: string, title: string) => Promise<void>;
  onDelete: (columnId: string) => Promise<void>;
}

export default function RetroColumn({
  column,
  permissions,
  currentUserId,
  settings,
  onCreateCard,
  onUpdateCard,
  onDeleteCard,
  onReact,
  onVote,
  onUnmerge,
  onRename,
  onDelete,
}: RetroColumnProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newCardText, setNewCardText] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameText, setRenameText] = useState(column.title);
  const [showMenu, setShowMenu] = useState(false);

  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  const cardIds = column.cards.map((c) => c.id);

  // Filtrar cards se hideCards ativo (cada um vê só os seus)
  const visibleCards = settings.hideCards
    ? column.cards.filter((c) => c.authorId === currentUserId)
    : column.cards;

  async function handleSubmitCard() {
    const text = newCardText.trim();
    if (!text) return;
    await onCreateCard(column.id, text);
    setNewCardText("");
    setIsAdding(false);
  }

  async function handleRename() {
    const title = renameText.trim();
    if (title && title !== column.title) {
      await onRename(column.id, title);
    }
    setIsRenaming(false);
  }

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-72 min-w-[288px] rounded-xl border bg-gray-900/80 transition ${
        isOver ? "border-violet-500/50 bg-violet-500/5" : "border-white/10"
      }`}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        {isRenaming && permissions.canManageColumns ? (
          <input
            autoFocus
            value={renameText}
            onChange={(e) => setRenameText(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setIsRenaming(false); }}
            className="flex-1 rounded bg-white/10 px-2 py-1 text-sm text-white outline-none focus:ring-1 focus:ring-violet-500"
          />
        ) : (
          <h3
            className={`text-sm font-bold text-white truncate ${permissions.canManageColumns ? "cursor-pointer hover:text-violet-300" : ""}`}
            onClick={() => permissions.canManageColumns && setIsRenaming(true)}
            title={column.tooltip || column.title}
          >
            {column.title}
          </h3>
        )}

        <div className="flex items-center gap-1 ml-2">
          <span className="text-[10px] text-gray-500 font-mono">
            {visibleCards.length}
          </span>

          {permissions.canManageColumns && (
            <div className="relative">
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white transition"
              >
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>

              {showMenu && (
                <div className="absolute right-0 top-full mt-1 z-20 rounded-lg border border-white/10 bg-gray-800 py-1 shadow-xl min-w-[140px]">
                  <button
                    onClick={() => { setIsRenaming(true); setShowMenu(false); }}
                    className="w-full px-3 py-1.5 text-left text-[11px] text-gray-300 hover:bg-white/10"
                  >
                    Renomear
                  </button>
                  <button
                    onClick={() => { onDelete(column.id); setShowMenu(false); }}
                    className="w-full px-3 py-1.5 text-left text-[11px] text-red-400 hover:bg-red-500/10"
                  >
                    Excluir coluna
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {visibleCards.map((card) => (
            <RetroCardComponent
              key={card.id}
              card={card}
              columnId={column.id}
              permissions={permissions}
              currentUserId={currentUserId}
              settings={settings}
              onUpdate={onUpdateCard}
              onDelete={onDeleteCard}
              onReact={onReact}
              onVote={onVote}
              onUnmerge={onUnmerge}
            />
          ))}
        </SortableContext>

        {/* Placeholder quando coluna vazia */}
        {visibleCards.length === 0 && !isAdding && (
          <div className="flex items-center justify-center py-8 text-[10px] text-gray-600">
            Nenhum card ainda
          </div>
        )}
      </div>

      {/* Add card area */}
      <div className="px-3 pb-3">
        {isAdding ? (
          <div className="space-y-2">
            <textarea
              autoFocus
              value={newCardText}
              onChange={(e) => setNewCardText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmitCard(); }
                if (e.key === "Escape") { setIsAdding(false); setNewCardText(""); }
              }}
              placeholder="Digite seu card..."
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder-gray-500 resize-none outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/30"
              rows={3}
            />
            <div className="flex gap-2">
              <button
                onClick={handleSubmitCard}
                disabled={!newCardText.trim()}
                className="rounded-md bg-violet-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-violet-500 disabled:opacity-40 transition"
              >
                Adicionar
              </button>
              <button
                onClick={() => { setIsAdding(false); setNewCardText(""); }}
                className="rounded-md bg-white/5 px-3 py-1.5 text-[11px] text-gray-400 hover:bg-white/10 transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          permissions.canCreateCards && (
            <button
              onClick={() => setIsAdding(true)}
              className="w-full rounded-lg border border-dashed border-white/10 py-2 text-[11px] text-gray-500 hover:border-violet-500/30 hover:text-violet-400 transition"
            >
              + Novo card
            </button>
          )
        )}
      </div>
    </div>
  );
}
