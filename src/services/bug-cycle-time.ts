import type { BugQualityData } from "@/adapters/types";
import { fetchChangelogsBatch } from "./jira-changelog";
import { calculateIssueCycleTime } from "@/metrics/cycle-time";
import { calculateP85 } from "@/metrics/percentile";

export interface BugCycleTimeStat {
  /** Quantidade de defeitos concluídos no período */
  count: number;
  /** Quantos tiveram Cycle Time calculável (changelog com início e conclusão) */
  measured: number;
  p85: number | null;
  /** Tempos (dias) de cada defeito medido, em ordem crescente (transparência do P85) */
  days: number[];
}

export interface BugCycleTimePeriod {
  period: string;
  bug: BugCycleTimeStat;
  subBug: BugCycleTimeStat;
  /** Bugs e sub-bugs juntos */
  all: BugCycleTimeStat;
}

function stat(keys: string[], changelogs: Map<string, { timestamp: string; fromStatus: string; toStatus: string }[]>): BugCycleTimeStat {
  const days: number[] = [];
  for (const key of keys) {
    // Regra do projeto: Cycle Time só por changelog real (1ª entrada em início -> última conclusão), dias corridos
    const ct = calculateIssueCycleTime(key, changelogs.get(key) || []);
    // O mínimo de 1 dia (concluído em horas = 1 dia) já vem de calculateIssueCycleTime, igual às demais issues
    if (ct) days.push(ct.days);
  }
  days.sort((a, b) => a - b);
  return { count: keys.length, measured: days.length, p85: calculateP85(days), days };
}

/**
 * Cycle Time de resolução de Bugs e Sub-bugs por período: quanto tempo levamos para corrigir
 * (P85, a mesma regra do Cycle Time das demais issues). Usa changelogs reais (cache de 1h).
 */
export async function fetchBugCycleTimes(bugsQuality: BugQualityData[]): Promise<BugCycleTimePeriod[]> {
  const keys = Array.from(new Set(bugsQuality.flatMap((b) => [...b.bugKeys, ...b.subBugKeys])));
  if (keys.length === 0) return [];
  const changelogs = await fetchChangelogsBatch(keys);
  return bugsQuality.map((b) => ({
    period: b.period,
    bug: stat(b.bugKeys, changelogs),
    subBug: stat(b.subBugKeys, changelogs),
    all: stat([...b.bugKeys, ...b.subBugKeys], changelogs),
  }));
}
