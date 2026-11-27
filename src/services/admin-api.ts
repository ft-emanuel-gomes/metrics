/**
 * Utilitários das rotas da Central Administrativa: squad válida, sprint de referência e tradução de erros
 * para respostas HTTP (409 conflito, 503 armazenamento indisponível, 400 validação).
 */

import { NextResponse } from "next/server";
import { getSquadBySlug, type SquadConfig } from "@/config/squads";
import { ConfigConflictError, ConfigUnavailableError } from "./config-store";
import { CapacityValidationError, type CapacitySprintRef } from "./capacity-resolver";
import { fetchAllSprints, fetchOpenSprints } from "./jira-sprints";

const NO_STORE = { "Cache-Control": "no-store" };

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: NO_STORE });
}

export function badRequest(message: string): NextResponse {
  return json({ error: "INVALID", message }, 400);
}

/** Squad pelo slug; devolve a resposta 404 quando não existe. */
export function squadOr404(slug: string): { squad: SquadConfig } | { response: NextResponse } {
  const squad = getSquadBySlug(slug);
  return squad ? { squad } : { response: json({ error: "SQUAD_NOT_FOUND", message: "Squad não encontrada." }, 404) };
}

/** Sprint de referência no Jira: a editável (pode não ter datas) ou qualquer sprint do board com datas. */
export async function findSprintRef(squad: SquadConfig, sprintId: number): Promise<CapacitySprintRef | null> {
  // Vigente e próxima direto no Jira (a próxima pode estar em planejamento, sem datas)
  const open = (await findOpenSprintRefs(squad)).find((s) => s.id === sprintId);
  if (open) return open;
  const all = await fetchAllSprints(squad.boardId, { fresh: true }).catch(() => []);
  const s = all.find((x) => x.id === sprintId);
  return s ? { id: s.id, name: s.name, state: s.state, startDate: s.startDate, endDate: s.endDate } : null;
}

/** Vigente e próxima (as duas aceitam ajuste de capacidade), na ordem em que aparecem. */
export async function findOpenSprintRefs(squad: SquadConfig): Promise<CapacitySprintRef[]> {
  const { active, next } = await fetchOpenSprints(squad.boardId).catch(() => ({ active: null, next: null }));
  return [active, next]
    .filter((s): s is NonNullable<typeof s> => !!s)
    .map((s) => ({ id: s.id, name: s.name, state: s.state, startDate: s.startDate, endDate: s.endDate }));
}

/** Converte erros conhecidos em resposta HTTP; o resto vira 500 com a mensagem. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof ConfigConflictError) {
    return json({ error: "CONFLICT", message: "Outro administrador alterou esta configuração. Os dados foram recarregados: revise e salve de novo." }, 409);
  }
  if (error instanceof ConfigUnavailableError) {
    return json({ error: "STORAGE_UNAVAILABLE", message: "Não foi possível salvar agora (armazenamento indisponível). Sua edição foi mantida: tente de novo em instantes." }, 503);
  }
  if (error instanceof CapacityValidationError) return badRequest(error.message);
  if (error instanceof Error && /^(O % de atuação|As horas por dia)/.test(error.message)) return badRequest(error.message);
  console.error("[admin-api]", error);
  return json({ error: "INTERNAL", message: error instanceof Error ? error.message : "Erro inesperado." }, 500);
}
