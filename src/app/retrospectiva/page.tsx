import { redirect } from "next/navigation";
import { getAuthSession } from "@/services/auth-session";
import { getAllSquads } from "@/config/squads";
import { listBoards } from "@/services/retro-storage";
import { canAccessBoard } from "@/services/retro-permissions";
import type { RetroBoardSummary } from "@/types/retro";
import RetroHome from "@/components/retro/RetroHome";

export const dynamic = "force-dynamic";

export default async function RetrospectiveHomePage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const allSquads = getAllSquads();
  const squadBoards: { squadSlug: string; squadName: string; boards: RetroBoardSummary[] }[] = [];

  for (const squad of allSquads) {
    if (!canAccessBoard(session.isAdmin, session.allowedSquads, squad.slug)) continue;

    const boards = await listBoards(squad.slug);
    squadBoards.push({
      squadSlug: squad.slug,
      squadName: squad.name,
      boards,
    });
  }

  return (
    <RetroHome
      squadBoards={squadBoards}
      isAdmin={session.isAdmin}
    />
  );
}
