/**
 * Agile IA — Análise de fluxo baseada em regras (sem LLM).
 *
 * Analisa os dados reais do Jira e gera recomendações estruturadas
 * para a daily standup da squad.
 *
 * Quando a LLM estiver disponível (proxy liberado), basta trocar
 * a função callAgilista por uma chamada à API.
 */

import type { JiraIssue } from "./jira-search";

// Status que indicam "em handoff" (filas de espera)
const HANDOFF_STATUSES = new Set(["Code Review", "Waiting for Test", "Waiting for Delivery"]);
const ACTIVE_STATUSES = new Set(["In Progress", "Design Review", "Test"]);
const ALL_WIP_STATUSES = new Set(["To Do", "In Progress", "Design Review", "Code Review", "Test", "Waiting for Test", "Waiting for Delivery"]);

/**
 * Gera análise estruturada da daily sem LLM.
 * Busca dados do Jira e aplica regras para gerar recomendações.
 */
export async function callAgilista(
  userMessage: string,
  jiraContext?: string
): Promise<string> {
  // Se não tem contexto de squad, responder genericamente
  if (!jiraContext) {
    return "Selecione uma squad no dropdown acima para que eu possa analisar o fluxo de trabalho e gerar recomendações para a daily.";
  }

  // O contexto já vem formatado de buildJiraContext
  // Vamos buscar os dados estruturados diretamente
  return jiraContext;
}

/**
 * Busca dados do Jira e gera análise estruturada para a daily.
 * GUARDRAIL: Retorna dados completos (incluindo summary) pois não sai do sistema.
 */
export async function buildJiraContext(slug: string): Promise<string> {
  const { getSquadBySlug } = await import("@/config/squads");
  const { fetchWipIssues } = await import("@/services/jira-search");

  const squad = getSquadBySlug(slug);
  if (!squad) return "❌ Squad não encontrada.";

  try {
    const wipIssues = await fetchWipIssues(squad.project);

    if (wipIssues.length === 0) {
      return `✅ **${squad.name}** — Nenhum item em andamento. Board limpo!`;
    }

    return generateDailyAnalysis(squad.name, wipIssues);
  } catch (error) {
    return `❌ Erro ao buscar dados do Jira para ${squad.name}.`;
  }
}

/**
 * Gera a análise estruturada da daily com base nas regras do Agile IA.
 */
function generateDailyAnalysis(squadName: string, issues: JiraIssue[]): string {
  const today = new Date();
  const lines: string[] = [];

  lines.push(`📋 **Análise Daily — ${squadName}**`);
  lines.push(`📅 ${today.toLocaleDateString("pt-BR")} | Total WIP: ${issues.length} itens`);
  lines.push("");

  // Categorizar issues por status
  const byStatus = new Map<string, JiraIssue[]>();
  for (const issue of issues) {
    const list = byStatus.get(issue.status) || [];
    list.push(issue);
    byStatus.set(issue.status, list);
  }

  // 1. Itens em handoff (Code Review, Waiting for Test, Waiting for Delivery)
  const handoffIssues = issues.filter((i) => HANDOFF_STATUSES.has(i.status));
  if (handoffIssues.length > 0) {
    lines.push(`🟡 **Itens em Handoff (${handoffIssues.length})** — aguardando ação de outro membro:`);
    for (const issue of handoffIssues) {
      lines.push(`   • ${issue.key} | ${issue.status} | "${issue.summary}"`);
    }
    lines.push(`   📋 **Ação:** Verificar na daily quem pode desbloquear esses itens.`);
    lines.push("");
  }

  // 2. Itens em To Do (comprometidos mas não iniciados)
  const todoIssues = issues.filter((i) => i.status === "To Do");
  if (todoIssues.length > 0) {
    lines.push(`⏳ **Itens em To Do (${todoIssues.length})** — comprometidos mas não iniciados:`);
    for (const issue of todoIssues.slice(0, 5)) {
      lines.push(`   • ${issue.key} | ${issue.issueType} | "${issue.summary}"`);
    }
    if (todoIssues.length > 5) {
      lines.push(`   ... e mais ${todoIssues.length - 5} itens`);
    }
    lines.push("");
  }

  // 3. Itens ativos (In Progress, Design Review, Test)
  const activeIssues = issues.filter((i) => ACTIVE_STATUSES.has(i.status));
  if (activeIssues.length > 0) {
    lines.push(`🟢 **Itens Ativos (${activeIssues.length})** — em trabalho:`);
    for (const issue of activeIssues) {
      lines.push(`   • ${issue.key} | ${issue.status} | ${issue.issueType} | "${issue.summary}"`);
    }
    lines.push("");
  }

  // 4. Resumo por status
  lines.push("📊 **Distribuição por Status:**");
  for (const [status, statusIssues] of [...byStatus.entries()].sort((a, b) => b[1].length - a[1].length)) {
    lines.push(`   • ${status}: ${statusIssues.length} itens`);
  }
  lines.push("");

  // 5. Recomendações automáticas
  lines.push("💡 **Recomendações para a Daily:**");

  if (handoffIssues.length > activeIssues.length) {
    lines.push("   🔴 Mais itens em fila de espera do que em trabalho ativo. Priorizar desbloqueio.");
  }

  if (todoIssues.length > 5) {
    lines.push("   🟡 Muitos itens em To Do sem iniciar. Avaliar se o comprometimento está adequado.");
  }

  const codeReview = byStatus.get("Code Review") || [];
  if (codeReview.length >= 3) {
    lines.push(`   🟡 ${codeReview.length} itens acumulados em Code Review. Solicitar revisões na daily.`);
  }

  const waitingTest = byStatus.get("Waiting for Test") || [];
  if (waitingTest.length >= 3) {
    lines.push(`   🟡 ${waitingTest.length} itens aguardando teste. Priorizar validação.`);
  }

  const waitingDelivery = byStatus.get("Waiting for Delivery") || [];
  if (waitingDelivery.length >= 2) {
    lines.push(`   🟡 ${waitingDelivery.length} itens prontos para deploy. Agendar publicação.`);
  }

  if (issues.length > 15) {
    lines.push(`   🔴 WIP muito alto (${issues.length} itens). Considerar limitar entrada de novos itens.`);
  } else if (issues.length <= 5) {
    lines.push("   🟢 WIP saudável. Manter o ritmo.");
  }

  if (handoffIssues.length === 0 && activeIssues.length > 0 && issues.length <= 10) {
    lines.push("   🟢 Fluxo saudável — sem gargalos identificados.");
  }

  return lines.join("\n");
}

/**
 * Não é mais necessário com a abordagem sem LLM,
 * mas mantém a interface para compatibilidade.
 */
export async function buildSensitiveDataMap(slug: string): Promise<Map<string, { summary: string; issueType: string }>> {
  return new Map();
}

export function enrichResponseWithSensitiveData(response: string): string {
  return response;
}
