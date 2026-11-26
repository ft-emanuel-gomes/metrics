import { NextRequest } from "next/server";
import { requireAdmin } from "@/services/auth-session";
import { searchJiraUsers } from "@/services/jira-users";
import { json } from "@/services/admin-api";

export const dynamic = "force-dynamic";

/** GET /api/admin/jira-users?query=nome — busca pessoas do Jira pelo nome (mínimo de 2 caracteres). */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const query = (request.nextUrl.searchParams.get("query") ?? "").slice(0, 80);
  if (query.trim().length < 2) return json({ users: [] });
  try {
    return json({ users: await searchJiraUsers(query) });
  } catch (error) {
    return json({ error: "JIRA_UNAVAILABLE", message: "Não foi possível buscar no Jira agora.", detail: error instanceof Error ? error.message : undefined }, 502);
  }
}
