/**
 * Retro Permissions — controle de permissões do board de retrospectiva.
 *
 * Regras:
 * - Administrators (jira-admins-montebravo): acesso completo
 * - Developers (role no projeto): podem criar cards, reagir, votar.
 *   NÃO podem: gerenciar colunas, timer, settings, deletar cards de outros, merge.
 */

import type { RetroRole, RetroUserPermissions } from "@/types/retro";

/**
 * Determina o role do usuário no contexto da retrospectiva.
 * isAdmin vem da sessão (membro de jira-admins-montebravo).
 */
export function getRetroRole(isAdmin: boolean): RetroRole {
  return isAdmin ? "admin" : "developer";
}

/**
 * Retorna as permissões completas baseado no role.
 */
export function getRetroPermissions(role: RetroRole): RetroUserPermissions {
  if (role === "admin") {
    return {
      role: "admin",
      canManageColumns: true,
      canManageTimer: true,
      canManageSettings: true,
      canMergeCards: true,
      canDeleteAnyCard: true,
      canEditAnyCard: true,
      canCreateCards: true,
      canReact: true,
      canVote: true,
    };
  }

  // Developer
  return {
    role: "developer",
    canManageColumns: false,
    canManageTimer: false,
    canManageSettings: false,
    canMergeCards: false,
    canDeleteAnyCard: false,
    canEditAnyCard: false,
    canCreateCards: true,
    canReact: true,
    canVote: true,
  };
}

/**
 * Verifica se o usuário pode editar/excluir um card específico.
 * Admins podem tudo. Developers só cards próprios.
 */
export function canModifyCard(
  role: RetroRole,
  cardAuthorId: string,
  currentUserId: string
): boolean {
  if (role === "admin") return true;
  return cardAuthorId === currentUserId;
}

/**
 * Verifica se o usuário pode ver o botão Retrospectiva na home.
 * Mesma regra do Agile IA: apenas Administrators.
 */
export function canSeeRetroButton(isAdmin: boolean): boolean {
  return isAdmin;
}

/**
 * Verifica se o usuário pode acessar um board (via link compartilhado).
 * Qualquer usuário autenticado com acesso à squad (Admin ou Developer) pode entrar.
 */
export function canAccessBoard(
  isAdmin: boolean,
  userSquads: string[],
  boardSquadSlug: string
): boolean {
  if (isAdmin) return true;
  return userSquads.includes(boardSquadSlug);
}
