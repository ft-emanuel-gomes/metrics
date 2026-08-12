"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { RetroBoardSummary } from "@/types/retro";

interface SquadBoardData {
  squadSlug: string;
  squadName: string;
  boards: RetroBoardSummary[];
}

interface RetroHomeProps {
  squadBoards: SquadBoardData[];
  isAdmin: boolean;
}

export default function RetroHome({ squadBoards, isAdmin }: RetroHomeProps) {
  const router = useRouter();
  const [selectedSquad, setSelectedSquad] = useState<SquadBoardData | null>(null);
  const [creating, setCreating] = useState(false);

  async function handleNewRetro(squadSlug: string) {
    setCreating(true);
    try {
      const res = await fetch("/api/retro/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ squadSlug }),
      });
      if (res.ok) {
        const board = await res.json();
        router.push(`/retrospectiva/${squadSlug}/${board.id}`);
      } else {
        const data = await res.json();
        alert(data.error || "Erro ao criar board");
        setCreating(false);
      }
    } catch {
      alert("Erro de conexao");
      setCreating(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-6">
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Retrospectiva</h1>
            <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              Boards de retrospectiva das squads
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg px-4 py-2 text-xs font-semibold transition"
            style={{ backgroundColor: "var(--bg-card)", color: "var(--text-secondary)", border: "0.5px solid var(--border-primary)" }}
          >
            Voltar
          </Link>
        </div>

        {/* Grid de squads */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {squadBoards.map(({ squadSlug, squadName, boards }) => {
            const latestBoard = boards.length > 0 ? boards[0] : null;

            return (
              <button
                key={squadSlug}
                onClick={() => setSelectedSquad({ squadSlug, squadName, boards })}
                className="group relative flex flex-col rounded-xl p-5 text-left transition min-h-[120px] hover:scale-[1.01]"
                style={{ backgroundColor: "var(--bg-card)", border: "0.5px solid var(--border-primary)" }}
              >
                <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  {squadName}
                </h3>

                <div className="mt-auto pt-3">
                  {latestBoard ? (
                    <>
                      <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
                        <span>{formatRelativeDate(latestBoard.updatedAt)}</span>
                        <span>{latestBoard.totalCards} cards</span>
                      </div>
                      <div className="mt-2 flex gap-1.5">
                        {latestBoard.columns.map((col, idx) => (
                          <div
                            key={idx}
                            className="flex-1 rounded-md px-2 py-1.5 text-center"
                            style={{ backgroundColor: "var(--bg-hover)" }}
                          >
                            <span className="block text-[9px] font-medium truncate" style={{ color: "var(--text-muted)" }}>
                              {col.title}
                            </span>
                            <span className="block text-[10px] font-bold" style={{ color: "var(--text-primary)" }}>
                              {col.cardCount}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                      Nenhum board criado. Clique para iniciar.
                    </p>
                  )}
                </div>

                {/* Arrow */}
                <div className="absolute top-5 right-4" style={{ color: "var(--text-muted)" }}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>

        {squadBoards.length === 0 && (
          <div className="text-center py-20">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Nenhuma squad disponivel.</p>
          </div>
        )}
      </div>

      {/* Modal — Board List */}
      {selectedSquad && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSelectedSquad(null)}>
          <div
            className="w-full max-w-lg rounded-xl p-6 shadow-2xl max-h-[80vh] overflow-y-auto"
            style={{ backgroundColor: "var(--bg-card)", border: "0.5px solid var(--border-primary)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                {selectedSquad.squadName}
              </h3>
              <button
                onClick={() => setSelectedSquad(null)}
                className="text-sm p-1 rounded hover:opacity-70"
                style={{ color: "var(--text-muted)" }}
              >
                &#10005;
              </button>
            </div>

            {/* Nova Retrospectiva */}
            {isAdmin && (
              <button
                onClick={() => handleNewRetro(selectedSquad.squadSlug)}
                disabled={creating}
                className="w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 text-xs font-semibold text-white mb-4 transition disabled:opacity-40"
                style={{ backgroundColor: "var(--accent)" }}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                {creating ? "Criando..." : "Nova Retrospectiva"}
              </button>
            )}

            {/* Lista de boards */}
            <div className="space-y-2">
              {selectedSquad.boards.map((board) => (
                <Link
                  key={board.id}
                  href={`/retrospectiva/${selectedSquad.squadSlug}/${board.id}`}
                  className="flex items-center justify-between rounded-lg p-3.5 transition hover:scale-[1.01]"
                  style={{ backgroundColor: "var(--bg-hover)", border: "0.5px solid var(--border-primary)" }}
                >
                  <div>
                    <span className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                      {formatDate(board.updatedAt)}
                    </span>
                    <div className="flex gap-2 mt-1">
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {board.totalCards} cards
                      </span>
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                        {board.columnCount} colunas
                      </span>
                    </div>
                  </div>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: "var(--text-muted)" }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              ))}

              {selectedSquad.boards.length === 0 && !isAdmin && (
                <p className="text-center py-8 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Nenhuma retrospectiva realizada ainda.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays < 7) return `${diffDays} dias atras`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} semanas atras`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function formatDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
