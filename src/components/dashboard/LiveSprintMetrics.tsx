"use client";
import { useCallback, useEffect, useState } from "react";
import type { LiveSprintMetrics as LiveData } from "@/services/live-sprint-metrics";
import { useChartTheme, type ChartTheme } from "@/lib/use-chart-theme";

interface LiveSprintMetricsProps {
  squadSlug: string;
  /** Mesmo filtro de tipos da tela (query ?issueType=...) */
  issueType?: string;
  /** Última sprint fechada, como referência ao lado de cada número */
  reference?: { name: string; cycleTimeP85: number | null; throughput: number; flowEfficiency: number | null };
}

const REFRESH_MS = 5 * 60 * 1000;
const TZ = "America/Sao_Paulo";
// Regra de negócio: meta de eficiência de fluxo = 70%
const EFFICIENCY_GOAL = 70;

function fmtDayMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: TZ });
}

// Cores dos tipos de item (mesmas da Vazão por tipo, alinhadas aos ícones do Jira)
function typeColor(t: ChartTheme, type: string): string {
  const c = t.issueType;
  const map: Record<string, string> = {
    História: c.story, Historia: c.story, Story: c.story, Kaizen: c.kaizen, Task: c.task,
    "Tech Debt": c.techDebt, "Technical Debt": c.techDebt, Design: c.design, Bug: c.bug, Spike: c.spike,
  };
  return map[type] || t.muted;
}

function Card({ title, value, unit, children, waiting }: { title: string; value?: string; unit?: string; children?: React.ReactNode; waiting?: string }) {
  return (
    <div className="theme-section flex min-h-[150px] flex-col">
      <p className="text-[11px] font-bold uppercase tracking-wide t-secondary">{title}</p>
      {waiting ? (
        <div className="flex flex-1 flex-col items-start justify-center gap-1.5">
          <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: "var(--ds-color-feedback-alert-surface)", color: "var(--ds-color-feedback-alert-label)" }}>
            {waiting}
          </span>
        </div>
      ) : (
        <>
          <p className="mt-2 leading-none" style={{ color: "var(--ds-color-content-title)" }}>
            <span className="text-4xl font-medium">{value}</span>
            {unit && <span className="ml-1 text-base" style={{ color: "var(--ds-color-content-caption)" }}>{unit}</span>}
          </p>
          <div className="mt-auto pt-3">{children}</div>
        </>
      )}
    </div>
  );
}

/**
 * Computador de Bordo: Cycle Time, Vazão e Eficiência de Fluxo da sprint VIGENTE, em tempo real.
 * Considera só os cards concluídos desde o início da sprint (mesmas regras do histórico).
 */
export default function LiveSprintMetrics({ squadSlug, issueType, reference }: LiveSprintMetricsProps) {
  const t = useChartTheme();
  const [data, setData] = useState<LiveData | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "empty" | "error">("loading");

  const load = useCallback(async () => {
    try {
      const qs = issueType ? `?issueType=${encodeURIComponent(issueType)}` : "";
      const res = await fetch(`/api/live-sprint/${squadSlug}${qs}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || "erro");
      if (!json.live) {
        setData(null);
        setState("empty");
        return;
      }
      setData(json.live as LiveData);
      setState("ok");
    } catch {
      setState("error");
    }
  }, [squadSlug, issueType]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const header = (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-[11px] font-bold uppercase tracking-wide t-secondary">
          Sprint vigente{data ? ` — ${data.sprint.name}` : ""}
        </h2>
        {data && (
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
            {fmtDayMonth(data.sprint.startDate)} a {fmtDayMonth(data.sprint.endDate)}
            {data.state === "active" ? ` · cards concluídos até agora` : ""}
          </p>
        )}
      </div>
      <span className="rounded-full px-2.5 py-1 text-[10px] font-semibold" style={{ background: "var(--ds-color-feedback-primary-surface)", color: "var(--ds-color-feedback-primary-label)" }}>
        Tempo real
      </span>
    </div>
  );

  if (state !== "ok" || !data) {
    return (
      <section aria-label="Indicadores da sprint vigente">
        {header}
        <div className="theme-section py-6 text-center text-[12px] t-muted">
          {state === "loading" && "Buscando a sprint vigente no Jira…"}
          {state === "empty" && "Nenhuma sprint ativa ou planejada no Jira."}
          {state === "error" && (
            <>
              Não foi possível buscar os indicadores da sprint.{" "}
              <button onClick={() => { setState("loading"); load(); }} className="underline" style={{ color: "var(--ds-color-content-primary)" }}>
                Tentar de novo
              </button>
            </>
          )}
        </div>
      </section>
    );
  }

  // Mensagens amigáveis: sprint ainda não iniciada no Jira, ou iniciada sem entregas
  const notStarted = data.state === "future" ? `Aguardando start da sprint (prevista para ${fmtDayMonth(data.sprint.startDate)})` : undefined;
  const noDeliveries = data.state === "active" && data.throughput.total === 0 ? "Aguardando as primeiras entregas da sprint" : undefined;
  const waiting = notStarted || noDeliveries;
  const ref = reference;
  const refLine = (text: string) => (
    <p className="text-[11px] t-muted">
      {ref ? `${ref.name} fechou com ${text}` : ""}
    </p>
  );

  const eff = data.flowEfficiency.efficiency;
  const effOk = eff !== null && eff >= EFFICIENCY_GOAL;

  return (
    <section aria-label="Indicadores da sprint vigente">
      {header}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card title="Cycle Time P85" value={data.cycleTime.p85 !== null ? String(data.cycleTime.p85) : "—"} unit="dias" waiting={waiting}>
          <p className="mb-1 text-[11px]" style={{ color: "var(--ds-color-content-body)" }}>
            {data.cycleTime.issueCount} {data.cycleTime.issueCount === 1 ? "card concluído" : "cards concluídos"} na sprint
          </p>
          {ref && refLine(ref.cycleTimeP85 !== null ? `${ref.cycleTimeP85} dias` : "sem dados")}
        </Card>

        <Card title="Vazão" value={String(data.throughput.total)} unit={data.throughput.total === 1 ? "card" : "cards"} waiting={waiting}>
          {data.throughput.byType.length > 0 && (
            <div className="mb-2">
              <div className="flex h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--ds-color-container-divider-card)" }}>
                {data.throughput.byType.map((b) => (
                  <div key={b.type} title={`${b.type}: ${b.count}`} style={{ width: `${(b.count / data.throughput.total) * 100}%`, background: typeColor(t, b.type) }} />
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]" style={{ color: "var(--ds-color-content-body)" }}>
                {data.throughput.byType.map((b) => (
                  <span key={b.type} className="flex items-center gap-1">
                    <i className="inline-block h-2 w-2 rounded-full" style={{ background: typeColor(t, b.type) }} />
                    {b.type} {b.count}
                  </span>
                ))}
              </div>
            </div>
          )}
          {ref && refLine(`${ref.throughput} ${ref.throughput === 1 ? "card" : "cards"}`)}
        </Card>

        <Card title="Eficiência de Fluxo" value={eff !== null ? String(eff) : "—"} unit="%" waiting={waiting}>
          <div className="mb-1 flex items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{
                background: effOk ? "var(--ds-color-feedback-positive-surface)" : "var(--ds-color-feedback-neutral-surface)",
                color: effOk ? "var(--ds-color-feedback-positive-label)" : "var(--ds-color-feedback-neutral-label)",
              }}
            >
              Meta {EFFICIENCY_GOAL}%
            </span>
            {eff !== null && (
              <span className="text-[11px]" style={{ color: "var(--ds-color-content-body)" }}>
                {effOk ? "na meta" : `${EFFICIENCY_GOAL - eff} p.p. abaixo`}
              </span>
            )}
          </div>
          {ref && refLine(ref.flowEfficiency !== null ? `${ref.flowEfficiency}%` : "sem dados")}
        </Card>
      </div>
    </section>
  );
}
