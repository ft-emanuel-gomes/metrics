import { redirect, notFound } from "next/navigation";
import { getAuthSession } from "@/services/auth-session";
import { getSquadBySlug } from "@/config/squads";
import { loadBoard } from "@/services/retro-storage";
import { canAccessBoard, getRetroRole, getRetroPermissions } from "@/services/retro-permissions";
import RetroBoard from "@/components/retro/RetroBoard";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ squad: string; boardId: string }>;
}

export default async function RetroBoardViewPage({ params }: PageProps) {
  const { squad: squadSlug, boardId } = await params;
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const squad = getSquadBySlug(squadSlug);
  if (!squad) notFound();

  if (!canAccessBoard(session.isAdmin, session.allowedSquads, squadSlug)) {
    notFound();
  }

  const board = await loadBoard(squadSlug, boardId);
  if (!board) {
    notFound();
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
