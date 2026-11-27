import { NextRequest } from "next/server";
import { requireAdmin } from "@/services/auth-session";
import { getSprintNamer } from "@/services/sprint-display";
import { errorResponse, findOpenSprintRefs, json, squadOr404 } from "@/services/admin-api";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/squads/{slug}/capacity — sprints que aceitam ajuste de capacidade: vigente e próxima.
 * `sprints` em ordem (vigente, próxima); `sprint` = a primeira (compatibilidade).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const r = squadOr404((await params).slug);
  if ("response" in r) return r.response;
  try {
    const [refs, namer] = await Promise.all([findOpenSprintRefs(r.squad), getSprintNamer()]);
    const sprints = refs.map((s) => ({
      id: s.id,
      name: namer(s.name ?? "", s.startDate ?? new Date().toISOString()),
      state: s.state,
      startDate: s.startDate,
      endDate: s.endDate,
    }));
    return json({ sprint: sprints[0] ?? null, sprints });
  } catch (error) {
    return errorResponse(error);
  }
}
