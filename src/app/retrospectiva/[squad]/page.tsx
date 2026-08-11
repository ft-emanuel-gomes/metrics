import { redirect, notFound } from "next/navigation";
import { getAuthSession } from "@/services/auth-session";
import { getSquadBySlug } from "@/config/squads";
import { listBoards, createBoard } from "@/services/retro-storage";
import { canAccessBoard } from "@/services/retro-permissions";
import Link from "next/link";
import NewRetroButton from "@/components/retro/NewRetroButton";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ squad: string }>;
}

export default async function RetroSquadPage({ params }: PageProps) {
  const { squad: squadSlug } = await params;
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const squad = getSquadBySlug(squadSlug);
  if (!squad) notFound();

  if (!canAccessBoard(session.isAdmin, session.allowedSquads, squadSlug)) {
    notFound();
  }

  const boards = await listBoards(squadSlug);

  return (
    <main className="min-h-screen px-6 py-6">
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">{squad.name}</h1>
            <p className="text-sm text-gray-400 mt-1">Boards de retrospectiva</p>
          </div>
          <div className="flex items-center gap-3">
            {session.isAdmin && (
              <NewRetroButton squadSlug={squadSlug} squadName={squad.name} />
            )}
            <Link
              href="/retrospectiva"
              className="rounded-lg bg-white/5 px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-white/10 transition"
            >
              Voltar
            </Link>
          </div>
        </div>

        {/* Lista de boards */}
        <div className="space-y-3">
          {boards.map((board) => (
            <Link
              key={board.id}
              href={`/retrospectiva/${squadSlug}/${board.id}`}
              className="group flex items-center justify-between rounded-xl border border-white/10 bg-white/5 p-5 hover:border-violet-500/40 hover:bg-violet-500/5 transition"
            >
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-white group-hover:text-violet-300 transition">
                    {formatDate(board.updatedAt)}
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-gray-400">
                    {board.totalCards} cards
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-gray-400">
                    {board.columnCount} colunas
                  </span>
                </div>

                {/* Preview das colunas */}
                <div className="mt-2 flex gap-2">
                  {board.columns.map((col, idx) => (
                    <span key={idx} className="text-[9px] text-gray-500">
                      {col.title} ({col.cardCount})
                    </span>
                  ))}
                </div>
              </div>

              {/* Arrow */}
              <div className="text-gray-600 group-hover:text-violet-400 transition">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}

          {boards.length === 0 && (
            <div className="text-center py-16">
              <p className="text-sm text-gray-500 mb-4">Nenhuma retrospectiva realizada ainda.</p>
              {session.isAdmin && (
                <p className="text-[11px] text-gray-600">
                  Clique em &quot;Nova Retrospectiva&quot; para iniciar.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
