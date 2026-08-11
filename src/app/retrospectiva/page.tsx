import { redirect } from "next/navigation";
import { getAuthSession } from "@/services/auth-session";
import { getAllSquads } from "@/config/squads";
import { listBoards } from "@/services/retro-storage";
import { canAccessBoard } from "@/services/retro-permissions";
import Link from "next/link";
import type { RetroBoardSummary } from "@/types/retro";

export const dynamic = "force-dynamic";

export default async function RetrospectiveHome() {
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const allSquads = getAllSquads();
  const squadBoards: { squadSlug: string; squadName: string; board: RetroBoardSummary | null }[] = [];

  for (const squad of allSquads) {
    if (!canAccessBoard(session.isAdmin, session.allowedSquads, squad.slug)) continue;

    const boards = await listBoards(squad.slug);
    squadBoards.push({
      squadSlug: squad.slug,
      squadName: squad.name,
      board: boards.length > 0 ? boards[0] : null,
    });
  }

  return (
    <main className="min-h-screen px-6 py-6">
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Retrospectiva</h1>
            <p className="text-sm text-gray-400 mt-1">
              Boards de retrospectiva das squads
            </p>
          </div>
          <Link
            href="/"
            className="rounded-lg bg-white/5 px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-white/10 transition"
          >
            Voltar
          </Link>
        </div>

        {/* Grid de squads */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {squadBoards.map(({ squadSlug, squadName, board }) => (
            <Link
              key={squadSlug}
              href={`/retrospectiva/${squadSlug}`}
              className="group relative flex flex-col rounded-xl border border-white/10 bg-white/5 p-5 hover:border-violet-500/40 hover:bg-violet-500/5 transition min-h-[120px]"
            >
              {/* Squad name */}
              <h3 className="text-sm font-bold text-white group-hover:text-violet-300 transition">
                {squadName}
              </h3>

              {/* Board info */}
              <div className="mt-auto pt-3">
              {board ? (
                <>
                  <div className="flex items-center gap-3 text-[10px] text-gray-400">
                    <span className="flex items-center gap-1">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
                        <circle cx="12" cy="12" r="10" strokeLinecap="round" />
                      </svg>
                      {formatRelativeDate(board.updatedAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                      {board.totalCards} cards
                    </span>
                  </div>

                  {/* Colunas preview com tooltip */}
                  <div className="mt-2 flex gap-1.5">
                    {board.columns.map((col, idx) => (
                      <div
                        key={idx}
                        className="group/col relative flex-1 rounded-md bg-white/5 px-2 py-1.5 text-center"
                      >
                        <span className="block text-[9px] font-medium text-gray-400 truncate">
                          {col.title}
                        </span>
                        <span className="block text-[10px] font-bold text-white mt-0.5">
                          {col.cardCount}
                        </span>

                        {/* Tooltip */}
                        {col.tooltip && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/col:block z-10">
                            <div className="rounded-md bg-gray-800 border border-white/10 px-3 py-2 text-[10px] text-gray-300 whitespace-nowrap shadow-lg">
                              {col.tooltip}
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-[10px] text-gray-500">
                  Nenhum board criado ainda. Clique para criar.
                </p>
              )}
              </div>

              {/* Arrow icon */}
              <div className="absolute top-5 right-4 text-gray-600 group-hover:text-violet-400 transition">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>

        {squadBoards.length === 0 && (
          <div className="text-center py-20">
            <p className="text-sm text-gray-500">Nenhuma squad disponível.</p>
          </div>
        )}
      </div>
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
  if (diffDays < 7) return `${diffDays} dias atrás`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} semanas atrás`;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
