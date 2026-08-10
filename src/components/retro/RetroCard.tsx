"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { RetroCard, RetroUserPermissions, RetroBoardSettings, ReactionType } from "@/types/retro";

interface RetroCardProps {
  card: RetroCard;
  columnId: string;
  permissions: RetroUserPermissions;
  currentUserId: string;
  settings: RetroBoardSettings;
  isDragging?: boolean;
  onUpdate?: (columnId: string, cardId: string, text: string) => Promise<void>;
  onDelete?: (columnId: string, cardId: string) => Promise<void>;
  onReact?: (columnId: string, cardId: string, reactionType: string) => Promise<void>;
  onVote?: (columnId: string, cardId: string) => Promise<void>;
  onUnmerge?: (columnId: string, cardId: string) => Promise<void>;
}

const REACTIONS: { type: ReactionType; emoji: string }[] = [
  { type: "heart", emoji: "❤️" },
  { type: "thumbsUp", emoji: "👍" },
  { type: "thumbsDown", emoji: "👎" },
];

export default function RetroCardComponent({
  card,
  columnId,
  permissions,
  currentUserId,
  settings,
  isDragging,
  onUpdate,
  onDelete,
  onReact,
  onVote,
  onUnmerge,
}: RetroCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(card.text);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.4 : 1,
  };

  const isOwner = card.authorId === currentUserId;
  const canEdit = permissions.canEditAnyCard || isOwner;
  const canDelete = permissions.canDeleteAnyCard || isOwner;

  async function handleSaveEdit() {
    const text = editText.trim();
    if (text && text !== card.text && onUpdate) {
      await onUpdate(columnId, card.id, text);
    }
    setIsEditing(false);
  }

  const hasVoted = card.votes.includes(currentUserId);
  const voteCount = card.votes.length;

  if (isDragging) {
    return (
      <div className="rounded-lg border border-violet-500/40 bg-gray-800 p-3 shadow-2xl rotate-2 scale-105">
        <p className="text-sm text-white whitespace-pre-wrap">{card.text}</p>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group rounded-lg border border-white/10 bg-gray-800/90 p-3 cursor-grab active:cursor-grabbing hover:border-white/20 transition"
    >
      {/* Card content */}
      {isEditing ? (
        <div>
          <textarea
            autoFocus
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
              if (e.key === "Escape") setIsEditing(false);
            }}
            className="w-full rounded bg-white/10 px-2 py-1.5 text-sm text-white resize-none outline-none focus:ring-1 focus:ring-violet-500"
            rows={3}
          />
          <div className="flex gap-1.5 mt-2">
            <button onClick={handleSaveEdit} className="rounded bg-violet-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-violet-500">
              Salvar
            </button>
            <button onClick={() => setIsEditing(false)} className="rounded bg-white/5 px-2 py-1 text-[10px] text-gray-400 hover:bg-white/10">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-white whitespace-pre-wrap leading-relaxed">
          {card.text}
        </p>
      )}

      {/* Author + actions */}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[9px] text-gray-500 truncate max-w-[120px]">
          {card.authorName}
        </span>

        {/* Edit/Delete (only visible on hover for allowed users) */}
        {!isEditing && (canEdit || canDelete) && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
            {canEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); setIsEditing(true); setEditText(card.text); }}
                className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-white"
                title="Editar"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
            )}
            {canDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete?.(columnId, card.id); }}
                className="p-1 rounded hover:bg-red-500/10 text-gray-500 hover:text-red-400"
                title="Excluir"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
            {card.mergedFrom && card.mergedFrom.length > 0 && permissions.canMergeCards && (
              <button
                onClick={(e) => { e.stopPropagation(); onUnmerge?.(columnId, card.id); }}
                className="p-1 rounded hover:bg-amber-500/10 text-gray-500 hover:text-amber-400"
                title="Desfazer merge"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Reactions + Votes */}
      <div className="mt-2 flex items-center gap-2 flex-wrap">
        {/* Reactions */}
        {permissions.canReact && REACTIONS.map(({ type, emoji }) => {
          const reaction = card.reactions.find((r) => r.type === type);
          const count = reaction?.userIds.length || 0;
          const hasReacted = reaction?.userIds.includes(currentUserId) || false;

          return (
            <button
              key={type}
              onClick={(e) => { e.stopPropagation(); onReact?.(columnId, card.id, type); }}
              className={`flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] transition ${
                hasReacted
                  ? "bg-violet-500/20 text-violet-300"
                  : "bg-white/5 text-gray-500 hover:bg-white/10"
              }`}
            >
              <span>{emoji}</span>
              {count > 0 && <span>{count}</span>}
            </button>
          );
        })}

        {/* Vote button */}
        {settings.votingEnabled && permissions.canVote && (
          <button
            onClick={(e) => { e.stopPropagation(); onVote?.(columnId, card.id); }}
            className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold transition ${
              hasVoted
                ? "bg-emerald-500/20 text-emerald-300"
                : "bg-white/5 text-gray-500 hover:bg-white/10"
            }`}
          >
            <svg className="h-3 w-3" fill={hasVoted ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
            </svg>
            {settings.showVoteCount && voteCount > 0 && <span>{voteCount}</span>}
          </button>
        )}
      </div>
    </div>
  );
}
