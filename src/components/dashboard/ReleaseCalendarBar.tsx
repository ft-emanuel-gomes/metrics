import {
  buildCalendarView,
  formatReleaseLabel,
  getSprintDisplayEnd,
  withProjectedSprints,
  type ReleaseCalendar,
} from "@/lib/release-calendar";
import { formatSprintName } from "@/lib/sprint-name";

interface ReleaseCalendarBarProps {
  calendar: ReleaseCalendar;
}

const TZ = "America/Sao_Paulo";

function fmtDayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ });
}

/**
 * Calendário da Release: uma faixa por sprint (verde = concluída, roxo = em curso, cinza = planejada)
 * com o marcador HOJE. O status segue o ESTADO NO JIRA:
 * - concluída só quando a sprint foi concluída (closed) no Jira;
 * - em curso só quando a sprint foi iniciada (active) no Jira;
 * - sem sprint ativa, o marcador fica ENTRE a última concluída e a próxima, aguardando o start no Jira.
 * Início e fim espelham as datas da sprint no Jira (sprint concluída mostra a data real de conclusão).
 */
export default function ReleaseCalendarBar({ calendar }: ReleaseCalendarBarProps) {
  const now = new Date();
  const sprints = withProjectedSprints(calendar);
  const n = sprints.length;
  if (n === 0) return null;
  const { statuses, currentIdx, fill: currentFill, overdue, waitingIdx, todayPos } = buildCalendarView(sprints, now);

  const statusText = (i: number): { text: string; color: string } => {
    const st = statuses[i];
    const s = sprints[i];
    if (st === "done") return { text: "Concluída", color: "var(--ds-color-content-positive)" };
    if (st === "current") {
      return overdue && i === currentIdx
        ? { text: "Aguardando conclusão", color: "var(--ds-color-content-alert)" }
        : { text: "Em curso", color: "var(--ds-color-content-primary)" };
    }
    if (i === waitingIdx) return { text: "Aguardando start", color: "var(--ds-color-content-alert)" };
    return { text: s.projected ? "Prevista" : "Planejada", color: "var(--ds-color-content-caption)" };
  };

  const apuracao = now.toLocaleDateString("pt-BR", { timeZone: TZ });

  return (
    <section className="theme-section" aria-label="Calendário da release">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide t-secondary">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M3 10h18M8 3v4M16 3v4" strokeLinecap="round" />
          </svg>
          Calendário da Release
        </h3>
        <span className="text-[11px] t-secondary">
          {formatReleaseLabel(calendar.releaseName)} | Data de apuração: {apuracao}
        </span>
      </div>

      <div className="relative pt-5">
        {/* Marcador HOJE */}
        <div className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${todayPos * 100}%` }} aria-label="Hoje">
          <span className="text-[10px] font-bold tracking-wide" style={{ color: "var(--ds-color-content-primary)" }}>
            HOJE
          </span>
        </div>

        <div className="flex gap-[2px]">
          {sprints.map((s, i) => {
            const st = statuses[i];
            const bg = st === "done" ? "var(--ds-color-content-positive)" : "var(--ds-color-container-divider-card)";
            return (
              <div
                key={s.id}
                className="relative h-3 flex-1 overflow-hidden"
                style={{
                  background: bg,
                  borderTopLeftRadius: i === 0 ? 999 : 0,
                  borderBottomLeftRadius: i === 0 ? 999 : 0,
                  borderTopRightRadius: i === n - 1 ? 999 : 0,
                  borderBottomRightRadius: i === n - 1 ? 999 : 0,
                }}
              >
                {st === "current" && (
                  <div className="h-full" style={{ width: `${currentFill * 100}%`, background: "var(--ds-color-content-primary)" }} />
                )}
              </div>
            );
          })}
        </div>

        <span
          className="absolute h-4 w-4 -translate-x-1/2 rounded-full border-2"
          style={{
            left: `${todayPos * 100}%`,
            top: "calc(1.25rem - 2px)",
            background: "var(--ds-color-container-popover-surface)",
            borderColor: waitingIdx >= 0 ? "var(--ds-color-content-alert)" : "var(--ds-color-content-primary)",
          }}
          aria-hidden="true"
        />
      </div>

      <div className="mt-3 flex gap-[2px]">
        {sprints.map((s, i) => {
          const st = statuses[i];
          const label = statusText(i);
          return (
            <div key={s.id} className="min-w-0 flex-1 pr-2 text-[11px]">
              <p className="truncate" style={{ color: "var(--ds-color-content-title)", fontWeight: st === "current" ? 700 : 400 }}>
                {formatSprintName(s.name, calendar.releaseName)}
              </p>
              <p className="t-muted">
                {fmtDayMonth(s.startDate)} – {fmtDayMonth(getSprintDisplayEnd(s))}{" "}
                <span style={{ color: label.color, fontWeight: 600 }}>{label.text}</span>
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
