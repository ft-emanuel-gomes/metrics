/**
 * Auth Service — Autenticação via Jira Cloud.
 *
 * Fluxo:
 * 1. Usuário informa email corporativo
 * 2. Sistema valida se o email existe como usuário ativo no Jira
 * 3. Busca permissões de projeto (roles) do usuário
 * 4. Gera JWT com payload de acesso
 *
 * Permissões derivadas:
 * - Membro de jira-admins-montebravo → acesso total
 * - Role "Administrators" ou "Developers" em um projeto → acesso àquele projeto
 * - Sem role mapeada → acesso negado
 */

import jwt from "jsonwebtoken";
import { getJiraClient } from "./jira-client";
import { SQUADS_CONFIG } from "@/config/squads";

// --- Types ---

export interface AuthUser {
  accountId: string;
  displayName: string;
  email: string;
  isAdmin: boolean;
  /** Project keys que o usuário tem acesso */
  allowedProjects: string[];
  /** Squad slugs que o usuário pode ver */
  allowedSquads: string[];
}

export interface JwtPayload {
  accountId: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  allowedProjects: string[];
  allowedSquads: string[];
  iat?: number;
  exp?: number;
}

// --- Core Functions ---

/**
 * Valida email contra o Jira e retorna o usuário se encontrado e ativo.
 */
export async function validateUserByEmail(email: string): Promise<AuthUser | null> {
  const client = getJiraClient();

  // Buscar usuário pelo email
  const users = await client.get<{ accountId: string; displayName: string; emailAddress?: string; active: boolean; accountType: string }[]>(
    "/rest/api/3/user/search",
    { query: email, maxResults: "10", includeInactive: "false" }
  );

  // Encontrar o usuário: match por email exato OU primeiro resultado ativo do tipo atlassian
  // (API do Jira pode não retornar emailAddress para alguns usuários por privacidade)
  const user = users.find(
    (u) => u.active && u.accountType === "atlassian" &&
      (u.emailAddress?.toLowerCase() === email.toLowerCase() || !u.emailAddress)
  );

  if (!user) return null;

  // Verificar se é admin (membro de jira-admins-montebravo)
  const isAdmin = await checkIsAdmin(user.accountId);

  // Buscar projetos permitidos (verifica roles + expande grupos)
  const allowedProjects = isAdmin
    ? getAllProjectKeys()
    : await fetchUserProjectPermissions(user.accountId);

  // Mapear projetos para slugs de squads
  const allowedSquads = mapProjectsToSquads(allowedProjects, isAdmin);

  return {
    accountId: user.accountId,
    displayName: user.displayName,
    email: user.emailAddress || email,
    isAdmin,
    allowedProjects,
    allowedSquads,
  };
}

/**
 * Gera JWT para o usuário autenticado.
 */
export function generateToken(user: AuthUser): string {
  const secret = process.env.JWT_SECRET || "dev-secret";
  const expiresIn = process.env.JWT_EXPIRES_IN || "8h";

  const payload: Omit<JwtPayload, "iat" | "exp"> = {
    accountId: user.accountId,
    email: user.email,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
    allowedProjects: user.allowedProjects,
    allowedSquads: user.allowedSquads,
  };

  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * Verifica e decodifica um JWT.
 */
export function verifyToken(token: string): JwtPayload | null {
  const secret = process.env.JWT_SECRET || "dev-secret";

  try {
    return jwt.verify(token, secret) as JwtPayload;
  } catch {
    return null;
  }
}

// --- Helpers ---

/**
 * Verifica se o usuário é membro do grupo jira-admins-montebravo.
 */
async function checkIsAdmin(accountId: string): Promise<boolean> {
  const client = getJiraClient();

  try {
    const response = await client.get<{ values: { accountId: string }[]; isLast?: boolean }>(
      "/rest/api/3/group/member",
      { groupname: "jira-admins-montebravo", includeInactiveUsers: "false", maxResults: "200" }
    );

    return response.values.some((m) => m.accountId === accountId);
  } catch {
    // Grupo pode não existir ou sem permissão para listar
    return false;
  }
}

/**
 * Busca os projetos em que o usuário tem role de Administrators ou Developers.
 * Verifica tanto membros diretos quanto membros via grupo.
 */
async function fetchUserProjectPermissions(accountId: string): Promise<string[]> {
  const client = getJiraClient();
  const projectKeys = getAllProjectKeys();
  const allowedProjects: string[] = [];

  // Roles relevantes: Administrators (10002) e Developers (10113)
  const roleIds = [10002, 10113];

  for (const projectKey of projectKeys) {
    let hasAccess = false;

    for (const roleId of roleIds) {
      if (hasAccess) break;

      try {
        const response = await client.get<{ actors: { actorUser?: { accountId: string }; actorGroup?: { name: string }; type: string }[] }>(
          `/rest/api/3/project/${projectKey}/role/${roleId}`
        );

        // Verificar se o usuário está diretamente na role
        if (response.actors.some((a) => a.actorUser?.accountId === accountId)) {
          hasAccess = true;
          break;
        }

        // Verificar via grupos: expandir cada grupo e checar se o usuário é membro
        const groupActors = response.actors.filter((a) => a.type === "atlassian-group-role-actor" && a.actorGroup?.name);
        for (const actor of groupActors) {
          if (hasAccess) break;
          try {
            const groupMembers = await client.get<{ values: { accountId: string }[]; isLast?: boolean }>(
              "/rest/api/3/group/member",
              { groupname: actor.actorGroup!.name, includeInactiveUsers: "false", maxResults: "200" }
            );
            if (groupMembers.values.some((m) => m.accountId === accountId)) {
              hasAccess = true;
            }
          } catch {
            // Grupo não acessível — ignorar
          }
        }
      } catch {
        // Projeto ou role não existe — ignorar
      }
    }

    if (hasAccess) {
      allowedProjects.push(projectKey);
    }
  }

  return allowedProjects;
}

/**
 * Retorna todos os project keys das squads configuradas.
 */
function getAllProjectKeys(): string[] {
  return [...new Set(Object.values(SQUADS_CONFIG).map((s) => s.project))];
}

/**
 * Mapeia project keys para slugs de squad.
 * Um admin tem acesso a todas as squads.
 */
function mapProjectsToSquads(allowedProjects: string[], isAdmin: boolean): string[] {
  if (isAdmin) {
    return Object.values(SQUADS_CONFIG).map((s) => s.slug);
  }

  return Object.values(SQUADS_CONFIG)
    .filter((squad) => allowedProjects.includes(squad.project))
    .map((squad) => squad.slug);
}
