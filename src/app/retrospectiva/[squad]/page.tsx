import { redirect, notFound } from "next/navigation";
import { getAuthSession } from "@/services/auth-session";
import { getSquadBySlug } from "@/config/squads";
import { getLatestBoard, createBoard } from "@/services/retro-storage";
import { canAccessBoard, getRetroRole, getRetroPermissions } from "@/services/retro-permissions";
import RetroBoard from "@/components/retro/RetroBoard";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ squad: string }>;
}

export default async function RetroBoardPage({ params }: PageProps) {
  const { squad: squadSlug } = await params;
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const squad = getSquadBySlug(squadSlug);
  if (!squad) notFound();

  if (!canAccessBoard(session.isAdmin, session.allowedSquads, squadSlug)) {
    notFound();
  }

  // Carregar ou criar board
  let board = await getLatestBoard(squadSlug);
  if (!board && session.isAdmin) {
    const boardId = `board-${Date.now()}`;
    board = await createBoard(squadSlug, squad.name, session.accountId || "unknown", boardId);
  }

  if (!board) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="rounded-lg border border-white/10 bg-white/5 p-8 text-center max-w-md">
          <h2 className="text-lg font-semibold text-white mb-2">Board não disponível</h2>
          <p className="text-sm text-gray-400">
            Peça ao Agilista responsável para criar o board desta squad.
          </p>
        </div>
      </main>
    );
  }

  const role = getRetroRole(session.isAdmin);
  const permissions = getRetroPermissions(role);
  const currentUserId = session.accountId || session.email;
  const currentUserName = session.displayName || session.email;

  return (
    <RetroBoard
      initialBoard={board}
      permissions={permissions}
      currentUserId={currentUserId}
      currentUserName={currentUserName}
      squadSlug={squadSlug}
    />
  );
}
