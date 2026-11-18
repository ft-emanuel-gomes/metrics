"use client";

import { useState } from "react";
import type { PeriodMetrics } from "@/adapters/types";
import { useChartTheme, type ChartTheme } from "@/lib/use-chart-theme";
import MbDonut from "./MbDonut";


interface ThroughputDonutsProps {
  periodMetrics: PeriodMetrics[];
}

// Cores por tipo de item seguem os icones do Jira (Story verde, Task/Tech Debt/Design azul, Bug vermelho, Kaizen verde, Spike laranja)
function typeColor(t: ChartTheme, type: string): string {
  const c = t.issueType;
  switch (type) {
    case "Historia":
    case "História":
    case "Story":
      return c.story;
    case "Kaizen":
      return c.kaizen;
    case "Task":
      return c.task;
    case "Tech Debt":
    case "Technical Debt":
      return c.techDebt;
    case "Design":
      return c.design;
    case "Bug":
      return c.bug;
    case "Spike":
      return c.spike;
    case "Sub-bug":
      return c.subBug;
    case "Sub-task":
    case "Subtarefa":
      return c.subTask;
    default:
      return t.muted;
  }
}

interface PopoverData {
  type: string;
  count: number;
  issueKeys: string[];
  period: string;
}

export default function ThroughputDonuts({ periodMetrics }: ThroughputDonutsProps) {
  const t = useChartTheme();
  const [popover, setPopover] = useState<PopoverData | null>(null);

  const allTypes = new Set<string>();
  periodMetrics.forEach((pm) => pm.throughput.byType.forEach((bt) => allTypes.add(bt.type)));

  return (
    <div className="theme-section relative flex flex-col">
      <h3 className="text-[11px] font-bold uppercase tracking-wide t-secondary mb-3">
        Vazão por sprint — por tipo
      </h3>
      <div className="flex flex-1 flex-col items-center justify-center">
      <div className="flex items-start justify-center gap-8">
        {periodMetrics.map((pm) => (
          <div key={pm.period.shortName} className="text-center">
            <MbDonut
              size={128}
              ariaLabel={`Vazão ${pm.period.shortName}: ${pm.throughput.total} itens`}
              segments={pm.throughput.byType.map((bt) => ({ key: bt.type, label: bt.type, value: bt.count, color: typeColor(t, bt.type) }))}
              onSegmentClick={(seg) => {
                const td = pm.throughput.byType.find((bt) => bt.type === seg.key);
                if (td) setPopover({ type: td.type, count: td.count, issueKeys: td.issueKeys, period: pm.period.shortName });
              }}
              center={
                <>
                  <span className="text-2xl font-medium leading-none" style={{ color: "var(--ds-color-content-title)" }}>{pm.throughput.total}</span>
                  <span className="mt-1 text-[10px]" style={{ color: "var(--ds-color-content-caption)" }}>itens</span>
                </>
              }
            />
            <p className="mt-1 text-[10px] t-muted">{pm.period.shortName}</p>
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="mt-4 flex flex-wrap justify-center gap-4 text-[10px] t-secondary">
        {Array.from(allTypes).map((type) => (
          <span key={type} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: typeColor(t, type) }} />
            {type}
          </span>
        ))}
      </div>
      </div>
      {/* Popover — aparece ao CLICAR no segmento */}
      {popover && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setPopover(null)}>
          <div className="rounded-xl p-4 max-w-xs w-full max-h-80 overflow-y-auto shadow-2xl" style={{ backgroundColor: "var(--bg-card)", border: "0.5px solid var(--border-primary)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                {popover.type}: {popover.count}
              </h4>
              <button onClick={() => setPopover(null)} className="t-muted hover:opacity-70 text-sm">&#10005;</button>
            </div>
            <p className="text-[9px] t-muted mb-2">{popover.period}</p>
            <div className="space-y-1">
              {popover.issueKeys.map((key) => (
                <a
                  key={key}
                  href={`https://montebravo.atlassian.net/browse/${key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-[11px] t-accent hover:underline py-0.5"
                >
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
