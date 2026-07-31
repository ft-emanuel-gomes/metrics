import { NextRequest, NextResponse } from "next/server";
import { getSquadBySlug } from "@/config/squads";
import { fetchSprintDashboard } from "@/adapters/sprint-adapter";
import { fetchKanbanDashboard } from "@/adapters/kanban-adapter";
import { getSprintCapacity } from "@/services/capacity-store";
import type { DashboardData, PeriodMetrics } from "@/adapters/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ squad: string }> }
) {
  const { squad: slug } = await params;
  const squad = getSquadBySlug(slug);
  if (!squad) return NextResponse.json({ error: "Squad não encontrada" }, { status: 404 });

  const sprints = request.nextUrl.searchParams.get("sprints");
  const issueType = request.nextUrl.searchParams.get("issueType");
  const sprintIds = sprints ? sprints.split(",").map(Number).filter(Boolean) : undefined;
  const issueTypes = issueType ? issueType.split(",").filter(Boolean) : undefined;

  try {
    const data: DashboardData = squad.methodology === "sprint"
      ? await fetchSprintDashboard(squad, sprintIds, issueTypes)
      : await fetchKanbanDashboard(squad, undefined, undefined, issueTypes);

    const html = generateReport(data, slug);

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    return NextResponse.json({ error: "Erro", message: error instanceof Error ? error.message : "" }, { status: 500 });
  }
}

function generateReport(data: DashboardData, squadSlug: string): string {
  const { squad, periods, kpis, periodMetrics, r2Progress, percentiles, forecast, evolution, insights, bugsQuality } = data;
  const today = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const periodText = periods.length > 0 ? `${fmtDate(periods[0].startDate)} a ${fmtDate(periods[periods.length - 1].endDate)}` : "";

  // Usar teamSize dinâmico (da sprint mais recente salva via Capacidade)
  const lastSprintId = periods.length > 0 && periods[periods.length - 1].id
    ? periods[periods.length - 1].id as number
    : 0;
  const displayTeamSize = lastSprintId
    ? getSprintCapacity(squadSlug, lastSprintId, squad.teamSize)
    : squad.teamSize;

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>${squad.name} - ${today}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter','Segoe UI',system-ui,sans-serif;color:#e2e8f0;background:#0f1117;padding:20px 24px;font-size:10px;line-height:1.4}
@page{size:A4 portrait;margin:8mm}
@media print{body{padding:0}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.no-print{display:none!important}}

.header-bar{height:2px;background:linear-gradient(90deg,#6366f1,#8b5cf6,#a78bfa);border-radius:2px;margin-bottom:10px}
.header{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
.logo{font-size:18px;font-weight:700;color:#fff;letter-spacing:-0.5px}
.header-right{text-align:right;font-size:9px;color:#94a3b8}
h1{font-size:16px;font-weight:800;color:#fff;margin-bottom:2px}
.badge{display:inline-block;background:rgba(99,102,241,.15);color:#a78bfa;padding:3px 10px;border-radius:14px;font-size:9px;font-weight:700;margin-bottom:12px}

.kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:10px}
.kpi-card{background:rgba(30,33,50,.7);border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:8px 6px;text-align:center;position:relative;overflow:hidden}
.kpi-card::after{content:'';position:absolute;top:0;left:0;right:0;height:3px;border-radius:10px 10px 0 0}
.kpi-card.good::after{background:linear-gradient(90deg,#10b981,#34d399)}
.kpi-card.warn::after{background:linear-gradient(90deg,#f59e0b,#fbbf24)}
.kpi-card.danger::after{background:linear-gradient(90deg,#ef4444,#f87171)}
.kpi-card.info::after{background:linear-gradient(90deg,#6366f1,#818cf8)}
.kpi-card.purple::after{background:linear-gradient(90deg,#8b5cf6,#a78bfa)}
.kpi-label{font-size:7px;text-transform:uppercase;letter-spacing:.4px;color:#94a3b8;font-weight:600;margin-bottom:4px}
.kpi-value{font-size:16px;font-weight:900;color:#fff;line-height:1}
.kpi-delta{font-size:7px;margin-top:2px;color:#94a3b8}

.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
.card{background:rgba(30,33,50,.7);border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:10px}
.card-title{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#94a3b8;margin-bottom:6px}

.ct-bars{display:flex;align-items:flex-end;justify-content:center;gap:16px;height:80px;margin:auto}
.ct-bar{width:36px;border-radius:6px 6px 3px 3px;display:flex;align-items:flex-end;justify-content:center;padding-bottom:6px;font-size:12px;font-weight:900;color:#fff}
.ct-label{font-size:8px;color:#94a3b8;text-align:center;margin-top:3px}

.eff-row{display:flex;align-items:center;gap:6px;margin-bottom:6px}
.eff-label{font-size:8px;color:#94a3b8;width:20px;text-align:right;flex-shrink:0}
.eff-track{flex:1;height:16px;background:rgba(255,255,255,.05);border-radius:4px;overflow:visible;position:relative}
.eff-fill{height:100%;border-radius:4px;display:flex;align-items:center;padding-left:6px;font-size:9px;font-weight:700;color:#fff}
.eff-meta{position:absolute;top:-12px;left:70%;font-size:7px;color:#34d399;font-weight:700}
.eff-line{position:absolute;top:0;bottom:0;left:70%;border-left:1.5px dashed #34d399}

.bar-track{height:14px;display:flex;border-radius:4px;overflow:hidden;width:100%;margin:3px 0}
.bar-seg{display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;color:#fff}
.bar-seg.done{background:#10b981}
.bar-seg.prog{background:#6366f1}
.bar-seg.pend{background:rgba(255,255,255,.15);color:#94a3b8}

.donut{width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto}
.donut-center{width:38px;height:38px;border-radius:50%;background:#1e2132;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:900;color:#fff}
.donut-label{font-size:8px;color:#94a3b8;text-align:center;margin-top:3px}

table{width:100%;border-collapse:collapse;font-size:9px;margin-top:6px}
th{background:rgba(99,102,241,.1);color:#a78bfa;padding:4px 6px;text-align:left;font-weight:600;border-bottom:1px solid rgba(255,255,255,.1)}
td{padding:4px 6px;border-bottom:1px solid rgba(255,255,255,.04);color:#e2e8f0}
.trend-up{color:#34d399;font-weight:600}
.trend-down{color:#f87171;font-weight:600}
.trend-flat{color:#fbbf24;font-weight:600}

.forecast-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.fc-card{border:1px solid rgba(255,255,255,.06);border-radius:8px;padding:10px;text-align:center;background:rgba(30,33,50,.7)}
.fc-type{font-size:8px;text-transform:uppercase;color:#94a3b8}
.fc-value{font-size:18px;font-weight:900;color:#fff;margin:3px 0}
.fc-unit{font-size:8px;color:#64748b}

.insights-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px}
.insight{padding:6px;border-radius:6px;border-left:3px solid;background:rgba(30,33,50,.7)}
.insight.green{border-color:#34d399}.insight.yellow{border-color:#fbbf24}.insight.red{border-color:#f87171}.insight.blue{border-color:#818cf8}
.insight-title{font-size:9px;font-weight:700;color:#fff;margin-bottom:2px}
.insight-text{font-size:8px;color:#94a3b8;line-height:1.3}

.footer{margin-top:10px;padding-top:6px;border-top:1px solid rgba(255,255,255,.1);font-size:7px;color:#64748b;text-align:center}
.print-btn{position:fixed;top:16px;right:16px;background:#6366f1;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer}
</style></head><body>
<button class="print-btn no-print" onclick="window.print()">Salvar PDF (Ctrl+P)</button>

<div class="header-bar"></div>
<div class="header">
  <div><div class="logo">montebravo</div></div>
  <div class="header-right"><strong>${squad.name}</strong><br>Período: ${periodText}</div>
</div>

<h1>${squad.name}</h1>
<div class="badge">${periods.map(p => p.shortName).join(" vs ")} · ${displayTeamSize} PESSOAS</div>

<!-- KPIs -->
<div class="kpi-row">
  ${kpiCard(kpis.cycleTime)}${kpiCard(kpis.throughput)}${kpiCard(kpis.flowEfficiency)}${kpiCard(kpis.spilloverOrWip)}${kpiCard(kpis.occupation)}
</div>

<div class="grid-2">
  <!-- Cycle Time -->
  <div class="card" style="display:flex;flex-direction:column;align-items:center;justify-content:center">
    <div class="card-title" style="align-self:flex-start">Cycle Time — Evolução (P85)</div>
    <div class="ct-bars">
      ${periodMetrics.map((pm, i) => {
        const maxCT = Math.max(...periodMetrics.map(p => p.cycleTime.p85 ?? 1));
        const h = Math.max(20, Math.round(((pm.cycleTime.p85 ?? 0) / maxCT) * 70));
        const colors = ["#6366f1","#8b5cf6","#a78bfa"];
        return `<div><div class="ct-bar" style="height:${h}px;background:${colors[i % 3]}">${pm.cycleTime.p85 ?? 0}</div><div class="ct-label">${pm.period.shortName}</div></div>`;
      }).join("")}
    </div>
  </div>

  <!-- Progresso Release -->
  <div class="card">
    <div class="card-title">Progresso ${r2Progress.releaseName}</div>
    <div style="margin-bottom:6px"><span style="font-size:8px;color:#a78bfa;font-weight:600">Épicos (${r2Progress.epics.total})</span>
      <div class="bar-track">${barSegs(r2Progress.epics)}</div>
    </div>
    <div style="margin-bottom:6px"><span style="font-size:8px;color:#a78bfa;font-weight:600">Features (${r2Progress.features.total})</span>
      <div class="bar-track">${barSegs(r2Progress.features)}</div>
    </div>
    <div><span style="font-size:8px;color:#a78bfa;font-weight:600">Total (${r2Progress.epics.total + r2Progress.features.total})</span>
      <div class="bar-track">${barSegs({ total: r2Progress.epics.total + r2Progress.features.total, done: r2Progress.epics.done + r2Progress.features.done, inProgress: r2Progress.epics.inProgress + r2Progress.features.inProgress, pending: r2Progress.epics.pending + r2Progress.features.pending })}</div>
    </div>
    <div style="font-size:7px;color:#64748b;margin-top:4px">Deadline: ${fmtDate(r2Progress.deadline)}</div>
  </div>
</div>

<div class="grid-2">
  <!-- Vazão -->
  <div class="card">
    <div class="card-title">Vazão — Por Tipo</div>
    <div style="display:flex;justify-content:center;gap:16px">
      ${periodMetrics.map(pm => {
        const total = pm.throughput.total;
        return `<div style="text-align:center"><div class="donut" style="background:conic-gradient(${donutGradient(pm)})"><div class="donut-center">${total}</div></div><div class="donut-label">${pm.period.shortName}</div></div>`;
      }).join("")}
    </div>
    <div style="display:flex;justify-content:center;gap:10px;margin-top:8px;font-size:8px;color:#94a3b8">
      ${Array.from(new Set(periodMetrics.flatMap(pm => pm.throughput.byType.map(t => t.type)))).map(type => {
        const colors: Record<string, string> = { "História": "#34d399", "Bug": "#f87171", "Design": "#818cf8", "Tech Debt": "#fbbf24", "Task": "#a78bfa", "Kaizen": "#38bdf8", "Spike": "#fb923c" };
        return `<span style="display:flex;align-items:center;gap:3px"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${colors[type] || '#94a3b8'}"></span>${type}</span>`;
      }).join("")}
    </div>
  </div>

  <!-- Eficiência de Fluxo -->
  <div class="card">
    <div class="card-title">Eficiência de Fluxo</div>
    <div style="position:relative;padding-top:14px">
      <div class="eff-meta" style="position:absolute;top:0;left:70%">META 70%</div>
      ${periodMetrics.map((pm, i) => {
        const colors = ["#b4c6e0","#6a8fb5","#3b6a8c"];
        return `<div class="eff-row"><div class="eff-label">${pm.period.shortName}</div><div class="eff-track"><div class="eff-line"></div><div class="eff-fill" style="width:${pm.flowEfficiency.efficiency}%;background:${colors[i % 3]}">${pm.flowEfficiency.efficiency}%</div></div></div>`;
      }).join("")}
    </div>
  </div>
</div>

<!-- Transbordo + Qualidade lado a lado -->
<div class="grid-2">
${squad.methodology === "sprint" ? `
  <div class="card">
    <div class="card-title">Transbordo — Sprint Report</div>
    ${periodMetrics.map(pm => {
      const sp = pm.spillover;
      if (!sp) return "";
      return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span style="width:18px;text-align:right;font-size:7px;color:#94a3b8">${pm.period.shortName}</span>
        <div style="display:flex;gap:1px;flex:1;flex-wrap:wrap">
          ${Array.from({length: sp.completed}).map(() => `<span style="width:6px;height:6px;border-radius:50%;background:#34d399;display:inline-block"></span>`).join("")}
          ${Array.from({length: sp.spilled}).map(() => `<span style="width:6px;height:6px;border-radius:50%;background:#f87171;display:inline-block"></span>`).join("")}
        </div>
        <span style="font-size:7px;color:#94a3b8;white-space:nowrap">${sp.percentage}% (${sp.spilled}/${sp.committed})</span>
      </div>`;
    }).join("")}
  </div>` : `<div class="card"><div class="card-title">WIP Aging</div></div>`}

${bugsQuality && bugsQuality.length > 0 ? `
  <div class="card">
    <div class="card-title">Qualidade — Bugs e Sub-bugs</div>
    <table>
      <thead><tr><th>Sprint</th><th>Bug</th><th>Sub-bug</th><th>Total</th></tr></thead>
      <tbody>
        ${bugsQuality.map(b => `<tr><td>${b.period}</td><td style="color:#f87171;font-weight:700">${b.bugs}</td><td style="color:#fb923c;font-weight:700">${b.subBugs}</td><td><strong>${b.bugs + b.subBugs}</strong></td></tr>`).join("")}
      </tbody>
    </table>
    <div style="font-size:7px;color:#64748b;margin-top:3px;text-align:center">Total: ${bugsQuality.reduce((s, b) => s + b.bugs + b.subBugs, 0)} defeitos</div>
  </div>` : `<div class="card"></div>`}
</div>

<!-- Evolução -->
<div class="card" style="margin-bottom:8px">
  <div class="card-title">Evolução das Métricas</div>
  <table><thead><tr><th>Métrica</th>${periods.map(p => `<th>${p.shortName}</th>`).join("")}<th>Tendência</th></tr></thead>
  <tbody>${evolution.map(r => `<tr><td>${r.metric}</td>${r.values.map(v => `<td>${v}</td>`).join("")}<td class="trend-${r.trendColor}">${r.trend}</td></tr>`).join("")}</tbody></table>
</div>

<div class="grid-2">
  <!-- Percentis -->
  <div class="card">
    <div class="card-title">Confiança de Entrega</div>
    <table><thead><tr><th>Percentil</th><th>Dias</th><th>Interpretação</th></tr></thead>
    <tbody>
      <tr><td>P50</td><td><strong>${percentiles.p50 ?? "N/A"}</strong></td><td>50% em até ${percentiles.p50 ?? "?"} dias</td></tr>
      <tr><td>P85</td><td><strong>${percentiles.p85 ?? "N/A"}</strong></td><td>85% em até ${percentiles.p85 ?? "?"} dias</td></tr>
      <tr><td>P95</td><td><strong>${percentiles.p95 ?? "N/A"}</strong></td><td>95% em até ${percentiles.p95 ?? "?"} dias</td></tr>
    </tbody></table>
  </div>

  <!-- Forecast -->
  <div class="card">
    <div class="card-title">Forecast — P85</div>
    <div class="forecast-grid">
      <div class="fc-card"><div class="fc-type">Épico</div><div class="fc-value">${forecast.epic.p85Days ?? "N/A"}</div><div class="fc-unit">dias</div></div>
      <div class="fc-card"><div class="fc-type">Feature</div><div class="fc-value">${forecast.feature.p85Days ?? "N/A"}</div><div class="fc-unit">dias</div></div>
      <div class="fc-card"><div class="fc-type">História</div><div class="fc-value">${forecast.story.p85Days ?? "N/A"}</div><div class="fc-unit">dias</div></div>
    </div>
  </div>
</div>

<!-- Insights -->
<div class="card-title" style="margin-top:8px">Insights</div>
<div class="insights-grid">
  ${insights.map(i => `<div class="insight ${i.severity}"><div class="insight-title">${i.title}</div><div class="insight-text">${i.text}</div></div>`).join("")}
</div>

<div class="footer">Monte Bravo - Métricas Ágeis</div>
</body></html>`;
}

function kpiCard(kpi: { label: string; value: string; status: string; delta: string }): string {
  return `<div class="kpi-card ${kpi.status}"><div class="kpi-label">${kpi.label}</div><div class="kpi-value">${kpi.value}</div><div class="kpi-delta">${kpi.delta}</div></div>`;
}

function barSegs(item: { total: number; done: number; inProgress: number; pending: number }): string {
  if (item.total === 0) return "";
  const d = Math.round(item.done / item.total * 100);
  const p = Math.round(item.inProgress / item.total * 100);
  const pe = 100 - d - p;
  let html = "";
  if (d > 0) html += `<div class="bar-seg done" style="width:${d}%">${d}%</div>`;
  if (p > 0) html += `<div class="bar-seg prog" style="width:${p}%">${p}%</div>`;
  if (pe > 0) html += `<div class="bar-seg pend" style="width:${pe}%">${pe}%</div>`;
  return html;
}

function donutGradient(pm: PeriodMetrics): string {
  const colors: Record<string, string> = { "História": "#34d399", "Bug": "#f87171", "Design": "#818cf8", "Tech Debt": "#fbbf24", "Task": "#a78bfa", "Kaizen": "#38bdf8", "Spike": "#fb923c" };
  const types = pm.throughput.byType;
  if (types.length === 0) return "#333 0% 100%";
  let pct = 0;
  return types.map(t => {
    const start = pct;
    pct += t.percentage;
    return `${colors[t.type] || "#94a3b8"} ${start}% ${pct}%`;
  }).join(", ");
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;
}
