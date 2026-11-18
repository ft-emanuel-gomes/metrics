import type { PeriodMetrics } from "@/adapters/types";
import SpilloverDots from "./SpilloverDots";
import BugsQuality from "./BugsQuality";
import BugCycleTimeChart from "./BugCycleTimeChart";
import type { BugCycleTimePeriod } from "@/services/bug-cycle-time";

interface BugData {
  period: string;
  bugs: number;
  subBugs: number;
  bugKeys: string[];
  subBugKeys: string[];
}

interface QualitySpilloverCardProps {
  periodMetrics: PeriodMetrics[];
  bugsQuality: BugData[];
  /** Cycle Time de correção de bugs e sub-bugs por período (opcional). */
  bugCycleTimes?: BugCycleTimePeriod[];
  /** Transbordo só existe em squads Sprint (Kanban usa WIP Aging). */
  showSpillover: boolean;
}

/** Um quadrante com Transbordo (acima) e Qualidade (abaixo), separados por uma linha horizontal. */
export default function QualitySpilloverCard({ periodMetrics, bugsQuality, bugCycleTimes, showSpillover }: QualitySpilloverCardProps) {
  const hasBugs = bugsQuality.length > 0;
  if (!showSpillover && !hasBugs) return null;
  return (
    <div className="theme-section flex flex-col">
      {showSpillover && <SpilloverDots periodMetrics={periodMetrics} embedded />}
      {showSpillover && hasBugs && (
        <hr className="my-4 border-0" style={{ height: 1, background: "var(--ds-color-container-divider-section)" }} />
      )}
      {hasBugs && <BugsQuality data={bugsQuality} embedded />}
      {hasBugs && bugCycleTimes && bugCycleTimes.length > 0 && (<>
        <hr className="my-4 border-0" style={{ height: 1, background: "var(--ds-color-container-divider-section)" }} />
        <BugCycleTimeChart data={bugCycleTimes} />
      </>)}
    </div>
  );
}
