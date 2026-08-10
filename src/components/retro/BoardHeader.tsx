"use client";

import { useState } from "react";
import Link from "next/link";
import type { RetroBoard, RetroUserPermissions, RetroBoardSettings, RetroTimer } from "@/types/retro";
import TimerDisplay from "./TimerDisplay";
import TimerControl from "./TimerControl";
import AddMenu from "./AddMenu";
import BoardSettingsModal from "./BoardSettingsModal";
import ShareModal from "./ShareModal";

interface BoardHeaderProps {
  board: RetroBoard;
  permissions: RetroUserPermissions;
  squadSlug: string;
  onAddColumn: (title: string) => Promise<void>;
  onSettingsUpdate: (settings: Partial<RetroBoardSettings>) => Promise<void>;
  onRefresh: () => Promise<void>;
  mergeMode: boolean;
  onToggleMergeMode: () => void;
}

export default function BoardHeader({
  board,
  permissions,
  squadSlug,
  onAddColumn,
  onSettingsUpdate,
  onRefresh,
  mergeMode,
  onToggleMergeMode,
}: BoardHeaderProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [showTimerControl, setShowTimerControl] = useState(false);
  const [timer, setTimer] = useState<RetroTimer>(board.timer);

  function handleTimerUpdate(updatedTimer: RetroTimer) {
    setTimer(updatedTimer);
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/10 bg-gray-900/95 backdrop-blur-sm px-4 py-3">
        <div className="flex items-center justify-between">
          {/* Left: Squad name + voltar */}
          <div className="flex items-center gap-3">
            <Link
              href="/retrospectiva"
              className="rounded-md p-1.5 text-gray-500 hover:bg-white/10 hover:text-white transition"
              title="Voltar"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-sm font-bold text-white">{board.squadName}</h1>
          </div>

          {/* Center: Timer */}
          <div className="flex items-center gap-2">
            <TimerDisplay timer={timer} />
            {permissions.canManageTimer && showTimerControl && (
              <TimerControl
                timer={timer}
                squadSlug={squadSlug}
                onTimerUpdate={handleTimerUpdate}
              />
            )}
          </div>

          {/* Right: Action buttons */}
          <div className="flex items-center gap-2">
            {/* Adicionar (admin only) */}
            {permissions.canManageColumns && (
              <AddMenu
                onAddColumn={onAddColumn}
                onOpenTimer={() => setShowTimerControl(!showTimerControl)}
              />
            )}

            {/* Merge Mode (admin only) */}
            {permissions.canMergeCards && (
              <button
                onClick={onToggleMergeMode}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  mergeMode
                    ? "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40"
                    : "bg-white/5 text-gray-400 hover:bg-white/10"
                }`}
                title={mergeMode ? "Desativar modo merge" : "Ativar modo merge (arraste card sobre outro para unir)"}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                </svg>
                Merge
              </button>
            )}

            {/* Compartilhar */}
            <button
              onClick={() => setShowShare(true)}
              className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-white/10 transition"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Compartilhar
            </button>

            {/* Config (admin only) */}
            {permissions.canManageSettings && (
              <button
                onClick={() => setShowSettings(true)}
                className="rounded-lg bg-white/5 p-2 text-gray-400 hover:bg-white/10 hover:text-white transition"
                title="Configurações"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            )}

            {/* Refresh */}
            <button
              onClick={onRefresh}
              className="rounded-lg bg-white/5 p-2 text-gray-400 hover:bg-white/10 hover:text-white transition"
              title="Atualizar board"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* Modals */}
      {showSettings && (
        <BoardSettingsModal
          settings={board.settings}
          onSave={onSettingsUpdate}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showShare && (
        <ShareModal
          squadSlug={squadSlug}
          onClose={() => setShowShare(false)}
        />
      )}
    </>
  );
}
