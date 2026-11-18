import type { SquadConfig } from "@/config/squads";
import { getJiraClient } from "./jira-client";
import { fetchActiveSprint, fetchAllSprints } from "./jira-sprints";
import { fetchChangelog, type StatusTransition } from "./jira-changelog";
import type { JiraIssueWithChangelog } from "./jira-search";
import { calculateCycleTimeP85 } from "@/metrics/cycle-time";
import { calculateThroughput, type ThroughputPeriodResult } from "@/metrics/throughput";
import { calculatePeriodFlowEfficiency } from "@/metrics/flow-efficiency";
import { CYCLE_TIME_END_STATUSES } from "@/config/status-mapping";

const BRT_OFFSET_MS = 3 * 3_600_000;

export interface LiveSprintMetrics {
  sprint: { id: number; name: string; startDate: string; endDate: string };
  /** active = sprint vigente; future = a vigente foi concluída e a próxima ainda não começou */
  state: "active" | "future";
  /** Cards concluídos na sprint até agora (vazio quando state = future) */
  cycleTime: { p85: number | null; issueCount: number };
  throughput: ThroughputPeriodResult;
  flowEfficiency: { efficiency: number | null; issueCount: number };
  asOf: string;
}

interface RawIssue {
  key: string;
  fields: { summary: string; issuetype: { name: string }; status: { name: string }; created: string; resolutiondate?: string };
  changelog?: { histories: { created: string; items: { field: string; fromString: string | null; toString: string | null }[] }[] };
}

/** Data/hora no formato do JQL ("yyyy-MM-dd HH:mm"), no fuso de Brasília. */
function jqlDateTime(ms: number): string {
  return new Date(ms - BRT_OFFSET_MS).toISOString().slice(0, 16).replace("T", " ");
}

function lastDoneAt(transitions: StatusTransition[]): number | null {
  for (let i = transitions.length - 1; i >= 0; i--) {
    if (CYCLE_TIME_END_STATUSES.has(transitions[i].toStatus)) return new Date(transitions[i].timestamp).getTime();
  }
  return null;
}

/**
 * Cycle Time, Vazão e Eficiência da sprint VIGENTE, em tempo real (sem cache), com as mesmas regras
 * do histórico aplicadas aos cards concluídos desde o início da sprint até agora:
 * status atual = Concluído e última transição para Concluído depois do início da sprint.
 * Sem sprint ativa: devolve a próxima sprint com state = "future" e indicadores vazios.
 */
export async function fetchLiveSprintMetrics(
  squad: SquadConfig,
  typeFilter?: (issueType: string) => boolean
): Promise<LiveSprintMetrics | null> {
  const empty = {
    cycleTime: { p85: null, issueCount: 0 },
    throughput: { total: 0, byType: [] } as ThroughputPeriodResult,
    flowEfficiency: { efficiency: null, issueCount: 0 },
  };

  const active = await fetchActiveSprint(squad.boardId);
  if (!active) {
    const all = await fetchAllSprints(squad.boardId, { fresh: true });
    const next = all
      .filter((s) => s.state === "future")
      .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0];
    if (!next) return null;
    return {
      sprint: { id: next.id, name: next.name, startDate: next.startDate, endDate: next.endDate },
      state: "future",
      ...empty,
      asOf: new Date().toISOString(),
    };
  }

  const startMs = new Date(active.startDate).getTime();
  const nowMs = Date.now();
  // Mesma JQL da Vazão do histórico (concluídos no período, sem amarrar à sprint de origem), em tempo real
  const jql =
    `project = "${squad.project}" ` +
    `AND status CHANGED TO "Concluído" DURING ("${jqlDateTime(startMs)}", "${jqlDateTime(nowMs + 60_000)}") ` +
    `AND issuetype in (História, Story, Bug, Design, "Technical Debt", Kaizen, Task, Spike) ` +
    `AND status != Cancelado`;

  const client = getJiraClient();
  const raw: RawIssue[] = [];
  let nextPageToken: string | undefined;
  do {
    const body: Record<string, unknown> = { jql, fields: ["summary", "status", "issuetype", "created", "resolutiondate"], expand: "changelog", maxResults: 50 };
    if (nextPageToken) body.nextPageToken = nextPageToken;
    const res = await client.post<{ issues: RawIssue[]; nextPageToken?: string; isLast?: boolean }>("/rest/api/3/search/jql", body);
    raw.push(...res.issues);
    nextPageToken = res.isLast ? undefined : res.nextPageToken;
  } while (nextPageToken);

  const issues: JiraIssueWithChangelog[] = [];
  for (const r of raw) {
    // Status atual = Concluído (cards revertidos ficam fora) e filtro de tipos da tela
    if (!CYCLE_TIME_END_STATUSES.has(r.fields.status.name)) continue;
    if (typeFilter && !typeFilter(r.fields.issuetype.name)) continue;
    const histories = r.changelog?.histories ?? [];
    let transitions: StatusTransition[] = histories.flatMap((h) =>
      h.items
        .filter((i) => i.field === "status" && i.fromString && i.toString)
        .map((i) => ({ timestamp: h.created, fromStatus: i.fromString as string, toStatus: i.toString as string }))
    );
    // Changelog inline pode vir truncado (100 históricos): busca o completo
    if (histories.length >= 100) transitions = await fetchChangelog(r.key);
    transitions.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    // Concluído DEPOIS do início da sprint (o JQL trabalha em minutos; o changelog tem a hora exata)
    const doneAt = lastDoneAt(transitions);
    if (doneAt === null || doneAt < startMs) continue;
    issues.push({
      key: r.key,
      summary: r.fields.summary,
      issueType: r.fields.issuetype.name,
      status: r.fields.status.name,
      created: r.fields.created,
      resolutionDate: r.fields.resolutiondate,
      transitions,
    });
  }

  const ct = calculateCycleTimeP85(issues);
  const eff = calculatePeriodFlowEfficiency(issues.map((i) => ({ key: i.key, transitions: i.transitions, issueType: i.issueType })));
  return {
    sprint: { id: active.id, name: active.name, startDate: active.startDate, endDate: active.endDate },
    state: "active",
    cycleTime: { p85: ct.p85, issueCount: ct.issueCount },
    throughput: calculateThroughput(issues),
    flowEfficiency: { efficiency: eff.issues.length > 0 ? eff.efficiency : null, issueCount: eff.issues.length },
    asOf: new Date().toISOString(),
  };
}
