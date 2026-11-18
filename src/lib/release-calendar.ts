import { RELEASE_PLANS } from "@/config/release-plans";

/**
 * Calendário da Release: tipos e helpers puros (sem dependência de servidor),
 * usados pelo sync (gravação), pelo dashboard (renderização) e pelo export.
 */

/** Sprint do board que cai dentro da janela da release ativa. */
export interface ReleaseSprint {
  id: number;
  name: string;
  startDate: string; // ISO 8601
  endDate: string; // ISO 8601
  /** Estado da sprint no Jira (fonte da verdade do status). Ausente em dados gravados antes desta regra. */
  state?: "closed" | "active" | "future";
  /** Quando a sprint foi concluída no Jira (só sprints closed). */
  completeDate?: string;
}

/** Dados do calendário gravados pelo sync (S3 raw r2.json). */
export interface ReleaseCalendar {
  releaseName: string; // ex.: "R4"
  releaseStartDate?: string; // YYYY-MM-DD (startDate da version no Jira)
  releaseEndDate: string; // YYYY-MM-DD (releaseDate da version no Jira)
  sprints: ReleaseSprint[];
}

export type ReleaseSprintStatus = "done" | "current" | "future";

/**
 * Status da sprint no calendário. Regra de negócio: a fonte da verdade é o ESTADO NO JIRA.
 * - closed (concluída no Jira)  -> "done"   (só assim a sprint conta como concluída)
 * - active (iniciada no Jira)   -> "current"
 * - future / prevista (sem sprint no Jira) -> "future", mesmo que a data planejada já tenha chegado
 * Dado legado (gravado antes do estado do Jira existir) cai nas datas, até o próximo Update.
 */
export function getReleaseSprintStatus(sprint: CalendarSprint, now: Date = new Date()): ReleaseSprintStatus {
  if (sprint.state === "closed") return "done";
  if (sprint.state === "active") return "current";
  if (sprint.state === "future" || sprint.projected) return "future";
  const t = now.getTime();
  if (t > new Date(sprint.endDate).getTime()) return "done";
  if (t >= new Date(sprint.startDate).getTime()) return "current";
  return "future";
}

/** Fim exibido: sprint concluída mostra a data real de conclusão no Jira; as demais, o fim cadastrado no Jira. */
export function getSprintDisplayEnd(sprint: ReleaseSprint): string {
  return sprint.state === "closed" && sprint.completeDate ? sprint.completeDate : sprint.endDate;
}

/** Leitura pronta do calendário (compartilhada pela tela e pelo PDF). */
export interface CalendarView {
  statuses: ReleaseSprintStatus[];
  /** Índice da sprint ativa no Jira; -1 se nenhuma. */
  currentIdx: number;
  /** Progresso (0..1) dentro da sprint ativa. */
  fill: number;
  /** Sprint ativa que passou do prazo e ainda não foi concluída no Jira. */
  overdue: boolean;
  /** Próxima sprint cuja data de início já chegou, mas que não foi iniciada no Jira (-1 se não houver). */
  waitingIdx: number;
  /** Posição do marcador HOJE (0..1). Sem sprint ativa, fica ENTRE a última concluída e a próxima. */
  todayPos: number;
}

export function buildCalendarView(sprints: CalendarSprint[], now: Date = new Date()): CalendarView {
  const n = sprints.length;
  const statuses = sprints.map((s) => getReleaseSprintStatus(s, now));
  const currentIdx = statuses.lastIndexOf("current");
  if (currentIdx >= 0) {
    const s = sprints[currentIdx];
    const start = new Date(s.startDate).getTime();
    const end = new Date(s.endDate).getTime();
    const raw = (now.getTime() - start) / Math.max(end - start, 1);
    return { statuses, currentIdx, fill: Math.min(1, Math.max(0, raw)), overdue: now.getTime() > end, waitingIdx: -1, todayPos: (currentIdx + Math.min(1, Math.max(0, raw))) / n };
  }
  const lastDone = statuses.lastIndexOf("done");
  const nextIdx = lastDone + 1;
  const waitingIdx = nextIdx < n && now.getTime() >= new Date(sprints[nextIdx].startDate).getTime() ? nextIdx : -1;
  return { statuses, currentIdx: -1, fill: 0, overdue: false, waitingIdx, todayPos: (lastDone + 1) / n };
}
/** Rótulo de exibição: "R4" vira "Release 4"; outros nomes ficam como estão. */
export function formatReleaseLabel(releaseName: string): string {
  const m = releaseName.match(/^R(\d+)$/i);
  return m ? `Release ${m[1]}` : releaseName;
}

/**
 * Seleciona as sprints da release: as que começam entre (início da release - 3 dias)
 * e o fim da release, ordenadas por data de início. A tolerância de 3 dias cobre
 * sprints iniciadas pouco antes da data cadastrada da version.
 */
export function pickReleaseSprints(
  all: ReleaseSprint[],
  releaseStartDate: string | undefined,
  releaseEndDate: string
): ReleaseSprint[] {
  const end = new Date(`${releaseEndDate}T23:59:59`).getTime();
  const start = releaseStartDate
    ? new Date(`${releaseStartDate}T00:00:00`).getTime() - 3 * 86_400_000
    : Number.NEGATIVE_INFINITY;
  return all
    .filter((s) => {
      const st = new Date(s.startDate).getTime();
      return st >= start && st <= end;
    })
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
}

/** Sprint exibida no calendário: real (do Jira) ou prevista (calendário oficial / projeção). */
export interface CalendarSprint extends ReleaseSprint {
  projected?: boolean;
}

const DAY = 86_400_000;
const BRT = "-03:00";

/** Indica se há calendário oficial cadastrado para a release (src/config/release-plans.ts). */
export function hasReleasePlan(releaseName: string): boolean {
  return (RELEASE_PLANS[releaseName]?.length ?? 0) > 0;
}

/**
 * Sprints do calendário da release:
 * - Com calendário oficial (RELEASE_PLANS): cada sprint real do Jira substitui a prevista
 *   na mesma posição (1ª real -> Sprint 1...). As demais ficam como "Prevista".
 * - Sem calendário oficial: projeta pela cadência da última sprint real (mín. 7 dias).
 */
export function withProjectedSprints(calendar: ReleaseCalendar): CalendarSprint[] {
  const real: CalendarSprint[] = [...calendar.sprints];
  const plan = RELEASE_PLANS[calendar.releaseName];

  if (plan && plan.length > 0) {
    const planned: CalendarSprint[] = plan.map((p, i) => {
      const next = plan[i + 1];
      // Se a próxima começa no mesmo dia do fim desta, a troca acontece no início do dia
      const endTime = next && next.start === p.end ? "T00:00:00" : "T23:59:59";
      return {
        id: -(i + 1),
        name: p.name,
        startDate: `${p.start}T00:00:00${BRT}`,
        endDate: `${p.end}${endTime}${BRT}`,
        projected: true,
      };
    });
    const merged = planned.map((p, i) => real[i] ?? p);
    // Sprints reais além do calendário oficial (ex.: sprint extra) também aparecem
    return real.length > planned.length ? [...merged, ...real.slice(planned.length)] : merged;
  }

  if (real.length === 0) return real;

  const last = real[real.length - 1];
  const lastStart = new Date(last.startDate).getTime();
  const lastEnd = new Date(last.endDate).getTime();
  const cadenceDays = Math.max(7, Math.round((lastEnd - lastStart) / DAY) + 1);
  const releaseEnd = new Date(`${calendar.releaseEndDate}T23:59:59${BRT}`).getTime();

  const out = [...real];
  let nextStart = lastEnd + DAY;
  let n = real.length + 1;
  // Limite de segurança: no máximo 12 previstas
  while (nextStart <= releaseEnd && out.length - real.length < 12) {
    const end = Math.min(nextStart + (cadenceDays - 1) * DAY, releaseEnd);
    out.push({
      id: -n,
      name: `Sprint ${n}`,
      startDate: new Date(nextStart).toISOString(),
      endDate: new Date(end).toISOString(),
      projected: true,
    });
    nextStart = end + DAY;
    n++;
  }
  return out;
}