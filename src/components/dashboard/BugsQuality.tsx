"use client";
import { useState } from "react";
import MetricTooltip from "@/components/ui/MetricTooltip";
import { useChartTheme } from "@/lib/use-chart-theme";
import MbDonut from "./MbDonut";

interface BugData {
  period: string;
  bugs: number;
  subBugs: number;
  bugKeys: string[];
  subBugKeys: string[];
}

interface BugsQualityProps {
  data: BugData[];
  /** Dentro de outro card (sem moldura própria). */
  embedded?: boolean;
}

interface PopoverData {
  type: string;
  keys: string[];
  period: string;
}

/**
 * Qualidade: defeitos concluídos por sprint em rosca (mesmo modelo da Vazão), com as cores de Bug e Sub-bug.
 * O centro mostra o total da sprint; clicar num segmento lista os cards com link para o Jira.
 */
export default function BugsQuality({ data, embedded = false }: BugsQualityProps) {
  const t = useChartTheme();
  const [popover, setPopover] = useState<PopoverData | null>(null);
  const totalBugs = data.reduce((s, d) => s + d.bugs + d.subBugs, 0);

  return (
    <div className={embedded ? "relative" : "theme-section relative"}>
      <h3 className="text-[11px] font-bold uppercase tracking-wide t-secondary mb-3">
        Qualidade — bugs e sub-bugs concluídos
        <MetricTooltip text="Bug: Correção de falha identificada em algo já entregue em produção. Sub-Bug: Correção de falha de algum comportamento inesperado em QA." />
      </h3>

      <div className="flex flex-col items-center">
        <div className="flex items-start justify-center gap-8">
          {data.map((d) => (
            <div key={d.period} className="text-center">
              <MbDonut
                size={120}
                ariaLabel={`Defeitos ${d.period}: ${d.bugs} bugs e ${d.subBugs} sub-bugs`}
                segments={[
                  { key: "bug", label: "Bug", value: d.bugs, color: t.issueType.bug },
                  { key: "subBug", label: "Sub-bug", value: d.subBugs, color: t.issueType.subBug },
                ]}
                onSegmentClick={(seg) => {
                  const keys = seg.key === "bug" ? d.bugKeys : d.subBugKeys;
                  if (keys.length > 0) setPopover({ type: seg.label, keys, period: d.period });
                }}
                center={
                  <>
                    <span className="text-2xl font-medium leading-none" style={{ color: "var(--ds-color-content-title)" }}>{d.bugs + d.subBugs}</span>
                    <span className="mt-1 text-[10px]" style={{ color: "var(--ds-color-content-caption)" }}>defeitos</span>
                  </>
                }
              />
              <p className="mt-1 text-[10px] t-muted">{d.period}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-4 text-[10px] t-secondary">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: t.issueType.bug }} />Bug</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: t.issueType.subBug }} />Sub-bug</span>
        </div>
      </div>

      <p className="mt-3 text-[11px] t-muted">Total: {totalBugs} defeitos concluídos nas sprints selecionadas</p>

      {popover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPopover(null)}>
          <div className="rounded-xl p-4 max-w-xs w-full max-h-80 overflow-y-auto shadow-2xl" style={{ backgroundColor: "var(--bg-card)", border: "0.5px solid var(--border-primary)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                {popover.type}: {popover.keys.length}
              </h4>
              <button onClick={() => setPopover(null)} className="t-muted hover:opacity-70 text-sm">&#10005;</button>
            </div>
            <p className="text-[9px] t-muted mb-2">{popover.period}</p>
            <div className="space-y-1">
              {popover.keys.map((key) => (
                <a key={key} href={`https://montebravo.atlassian.net/browse/${key}`} target="_blank" rel="noopener noreferrer" className="block text-[11px] t-accent hover:underline py-0.5">
                  {key}
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
