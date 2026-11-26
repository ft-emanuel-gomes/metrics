import { NextRequest } from "next/server";
import { actorOf, requireAdmin } from "@/services/auth-session";
import { getGlobalSettings, saveGlobalSettings } from "@/services/squad-team";
import { refreshEditableSprintCapacity } from "@/services/capacity-resolver";
import { getAllSquads } from "@/config/squads";
import { badRequest, errorResponse, json } from "@/services/admin-api";

export const dynamic = "force-dynamic";

/** GET /api/admin/settings — horas por dia padrão (global). */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    return json({ settings: await getGlobalSettings() });
  } catch (error) {
    return errorResponse(error);
  }
}

/** PUT /api/admin/settings { hoursPerDayDefault } — vale para as sprints editáveis sem valor próprio. */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  if (!body || body.hoursPerDayDefault === undefined) return badRequest("Informe hoursPerDayDefault.");
  try {
    const settings = await saveGlobalSettings(body.hoursPerDayDefault, actorOf(auth.session));
    // Reaplica nas sprints editáveis (concluídas não mudam)
    await Promise.allSettled(getAllSquads().map((s) => refreshEditableSprintCapacity(s)));
    return json({ settings });
  } catch (error) {
    return errorResponse(error);
  }
}
