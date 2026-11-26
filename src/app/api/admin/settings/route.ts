import { NextRequest } from "next/server";
import { actorOf, requireAdmin } from "@/services/auth-session";
import { cancelScheduledGlobalHours, getGlobalSettings, scheduleGlobalHours } from "@/services/squad-team";
import { refreshEditableSprintCapacity } from "@/services/capacity-resolver";
import { fetchActiveSprint } from "@/services/jira-sprints";
import { getAllSquads } from "@/config/squads";
import { brtDate, HoursScheduleError, minEffectiveFrom } from "@/metrics/hours-schedule";
import { badRequest, errorResponse, json } from "@/services/admin-api";

export const dynamic = "force-dynamic";

/** Início das sprints vigentes de todas as squads de sprint (a vigência não pode ser anterior). */
async function activeSprintStarts(): Promise<string[]> {
  const squads = getAllSquads().filter((s) => s.methodology === "sprint");
  const actives = await Promise.all(squads.map((s) => fetchActiveSprint(s.boardId).catch(() => null)));
  return actives.filter((a): a is NonNullable<typeof a> => !!a).map((a) => a.startDate);
}

async function payload() {
  const [settings, starts] = await Promise.all([getGlobalSettings(), activeSprintStarts()]);
  return { settings, minEffectiveFrom: minEffectiveFrom(brtDate(new Date()), starts), today: brtDate(new Date()) };
}

/** GET /api/admin/settings — horas por dia vigentes hoje, histórico por vigência e a menor data aceita. */
export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    return json(await payload());
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * PUT /api/admin/settings { hoursPerDay, effectiveFrom: "AAAA-MM-DD" } — agenda as horas por dia globais a partir
 * da data. Cada sprint usa o valor vigente na data de início dela; a data não pode ser anterior à sprint vigente.
 */
export async function PUT(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  if (!body || body.hoursPerDay === undefined) return badRequest("Informe hoursPerDay e effectiveFrom.");
  try {
    const starts = await activeSprintStarts();
    await scheduleGlobalHours(Number(body.hoursPerDay), body.effectiveFrom, actorOf(auth.session), starts);
    // Sprint vigente mantém o valor da data de início dela; a reaplicação só atualiza quem já está na nova vigência
    await Promise.allSettled(getAllSquads().map((s) => refreshEditableSprintCapacity(s)));
    return json(await payload());
  } catch (error) {
    if (error instanceof HoursScheduleError) return badRequest(error.message);
    return errorResponse(error);
  }
}

/** DELETE /api/admin/settings?effectiveFrom=AAAA-MM-DD — cancela um agendamento que ainda não entrou em vigor. */
export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  try {
    const starts = await activeSprintStarts();
    await cancelScheduledGlobalHours(request.nextUrl.searchParams.get("effectiveFrom"), actorOf(auth.session), starts);
    await Promise.allSettled(getAllSquads().map((s) => refreshEditableSprintCapacity(s)));
    return json(await payload());
  } catch (error) {
    if (error instanceof HoursScheduleError) return badRequest(error.message);
    return errorResponse(error);
  }
}
