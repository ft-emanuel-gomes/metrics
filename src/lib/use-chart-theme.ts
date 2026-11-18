"use client";

import { useEffect, useState } from "react";

/** Resolved DS colors for ApexCharts (which cannot consume CSS vars directly). */
export interface ChartTheme {
  mode: "light" | "dark";
  title: string;
  body: string;
  muted: string;
  grid: string;
  positive: string;
  alert: string;
  negative: string;
  primary: string;
  /** DS chart series palette (--ds-color-chart-1..5) */
  series: string[];
  /** Text color to place over a filled bar/slice */
  onFill: string;
  /** Superfície de tooltip/popover */
  surface: string;
  /** Cores dos tipos de item (alinhadas aos icones do Jira) */
  issueType: {
    story: string;
    kaizen: string;
    task: string;
    techDebt: string;
    design: string;
    bug: string;
    spike: string;
    subBug: string;
    subTask: string;
  };
}

const FALLBACK: ChartTheme = {
  mode: "dark",
  title: "#f5f5f5",
  body: "#c9c9d1",
  muted: "#8b8b97",
  grid: "rgba(255,255,255,0.08)",
  positive: "#34d399",
  alert: "#fbbf24",
  negative: "#f87171",
  primary: "#8b7cf6",
  series: ["#8b7cf6", "#fbbf24", "#34d399", "#60a5fa", "#f87171"],
  onFill: "#ffffff",
  surface: "#363636",
  issueType: { story: "#3ba306", kaizen: "#70c34b", task: "#60a5fa", techDebt: "#68afff", design: "#038bf2", bug: "#f87171", spike: "#f2812b", subBug: "#ffb0a5", subTask: "#a1caff" },
};

function readTheme(): ChartTheme {
  const root = document.documentElement;
  const cs = getComputedStyle(root);
  const v = (name: string, fb: string) => cs.getPropertyValue(name).trim() || fb;
  const mode = root.getAttribute("data-theme") === "light" ? "light" : "dark";
  return {
    mode,
    title: v("--ds-color-content-title", FALLBACK.title),
    body: v("--ds-color-content-body", FALLBACK.body),
    muted: v("--ds-color-content-subdued", FALLBACK.muted),
    surface: v("--ds-color-container-popover-surface", FALLBACK.surface),
    grid: v("--ds-color-container-divider-card", FALLBACK.grid),
    positive: v("--ds-color-content-positive", FALLBACK.positive),
    alert: v("--ds-color-content-alert", FALLBACK.alert),
    negative: v("--ds-color-content-negative", FALLBACK.negative),
    primary: v("--ds-color-content-primary", FALLBACK.primary),
    series: [1, 2, 3, 4, 5].map((i) => v(`--ds-color-chart-${i}`, FALLBACK.series[i - 1])),
    onFill: "#ffffff",
    issueType: {
      story: v("--ds-color-content-positive", FALLBACK.issueType.story),
      kaizen: v("--ds-color-brand-green-8", FALLBACK.issueType.kaizen),
      task: v("--ds-color-chart-4", FALLBACK.issueType.task),
      techDebt: v("--ds-color-brand-blue-8", FALLBACK.issueType.techDebt),
      design: v("--ds-color-brand-blue-7", FALLBACK.issueType.design),
      bug: v("--ds-color-content-negative", FALLBACK.issueType.bug),
      spike: v("--ds-color-chart-orange", FALLBACK.issueType.spike),
      // Sub-bug: tom de vermelho distinto do Bug (claro no tema claro, escuro no tema escuro, para manter contraste
      // com o rotulo branco); Sub-task: azul mais claro que a Task
      subBug: v(mode === "light" ? "--ds-color-brand-red-8" : "--ds-color-brand-red-6", FALLBACK.issueType.subBug),
      subTask: v("--ds-color-brand-blue-9", FALLBACK.issueType.subTask),
    },
  };
}

/** Reads DS tokens at runtime and re-reads when <html data-theme> changes. */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(FALLBACK);

  useEffect(() => {
    const update = () => setTheme(readTheme());
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  return theme;
}
