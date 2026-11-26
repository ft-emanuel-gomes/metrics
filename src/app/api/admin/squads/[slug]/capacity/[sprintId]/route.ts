import { NextRequest } from "next/server";
import { actorOf, requireAdmin } from "@/services/auth-session";
import { resolveSprintCapacity, saveSprintCapacityAdjustment } from "@/services/capacity-resolver";
import { badRequest, errorResponse, findSprintRef, json, squadOr404 } from "@/services/admin-api";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string; sprintId: string }> };

async function context(params: Ctx["params"]) {
  const { slug, sprintId } = await params;
  const r = squadOr404(slug);
  if ("response" in r) return r;
  if (!/^\d+$/.test(sprintId)) return { response: badRequest("Sprint inválida.") };
  const sprint = await findSprintRef(r.squad, Number(sprintId));
  if (!sprint) return { response: json({ error: "SPRINT_NOT_FOUND", message: "Sprint não encontrada no board da squad." }, 404) };
  return { squad: r.squad, sprint };
}

/** GET — capacidade resolvida (origem, conta e detalhe por integrante). */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    const c = await context(params);
    if ("response" in c) return c.response;
    return json({ capacity: await resolveSprintCapacity(c.squad, c.sprint) });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PUT { businessDays?: number | null, members: [{ accountId, allocationPct, hoursPerDay?: number | null }] }
 * Ajuste da sprint vigente ou da próxima (grava como "ajustada"; a sprint seguinte herda dela).
 */
export async function PUT(request: NextRequest, { params }: Ctx) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.members)) return badRequest("Informe os integrantes (members).");
  try {
    const c = await context(params);
    if ("response" in c) return c.response;
    const capacity = await saveSprintCapacityAdjustment(c.squad, c.sprint, { businessDays: body.businessDays, members: body.members }, actorOf(auth.session));
    return json({ capacity });
  } catch (error) {
    return errorResponse(error);
  }
}
