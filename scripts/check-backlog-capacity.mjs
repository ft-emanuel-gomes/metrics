/**
 * Confere, pelas APIs (nada chumbado), se o Backlog estimado usa a capacidade da próxima sprint com as horas
 * por dia vigentes na data de início dela.
 *
 * Uso (servidor rodando, .env carregado):
 *   node --env-file=.env scripts/check-backlog-capacity.mjs [--base=http://localhost:3000] [--simulate=8@2026-12-01]
 *
 * --simulate agenda as horas globais, confere e cancela o agendamento (só com S3_ENDPOINT em localhost).
 */
import { createHmac } from "node:crypto";

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
const BASE = arg("base") ?? "http://localhost:3000";
const SQUADS = ["custodia", "consolidacao", "lifecycle", "inteligencia", "renda-variavel", "experiencia", "assessoria"];

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const signJwt = (payload, secret) => {
  const head = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ ...payload, exp: Math.floor(Date.now() / 1000) + 600 })}`;
  return `${head}.${createHmac("sha256", secret).update(head).digest("base64url")}`;
};
if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET ausente (use --env-file=.env)");
const cookie = `auth-token=${signJwt({ isAdmin: true, email: "check@local", name: "check" }, process.env.JWT_SECRET)}`;
const call = async (path, init = {}) => {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { cookie, "content-type": "application/json", ...init.headers } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${JSON.stringify(body)}`);
  return body;
};

/** Horas em vigor numa data (YYYY-MM-DD): a última versão com effectiveFrom <= data. */
const hoursAt = (versions, date) =>
  [...versions].filter((v) => v.effectiveFrom <= date).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)).at(-1)?.hoursPerDay;
const brtDate = (iso) => new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10);

const simulate = arg("simulate");
let scheduledFrom;
if (simulate) {
  if (!/localhost|127\.0\.0\.1/.test(process.env.S3_ENDPOINT ?? "")) throw new Error("--simulate só roda com S3_ENDPOINT local");
  const [h, from] = simulate.split("@");
  await call("/api/admin/settings", { method: "PUT", body: JSON.stringify({ hoursPerDay: Number(h), effectiveFrom: from }) });
  scheduledFrom = from;
}

let failures = 0;
try {
  const { settings } = await call("/api/admin/settings");
  for (const slug of SQUADS) {
    const { backlog } = await call(`/api/sprint-capacity/${slug}?mode=backlog`);
    if (!backlog) { console.log(`- ${slug}: sem próxima sprint`); continue; }
    const { capacity: c, nextSprint: n } = backlog;
    const expectedHours = n.startDate ? hoursAt(settings.hoursVersions, brtDate(n.startDate)) : undefined;
    const expectedCap = Math.round(c.fte * c.hoursPerDay * c.businessDays * 10) / 10;
    const okCap = Math.abs(expectedCap - c.availableHours) <= 0.2;
    // Squad com horas próprias (override) pode divergir das globais: só informa
    const okHours = expectedHours === undefined || expectedHours === c.hoursPerDay;
    if (!okCap) failures++;
    console.log(
      `${okCap ? "OK " : "ERRO"} ${slug}: ${n.name} (início ${n.startDate ? brtDate(n.startDate) : "?"}) ` +
        `${c.availableHours}h = ${c.fte} pessoas-eq × ${c.hoursPerDay}h × ${c.businessDays}d [${c.source}] ` +
        `| horas globais na data: ${expectedHours ?? "?"}h${okHours ? "" : " (difere: override da squad?)"}`
    );
  }
} finally {
  if (scheduledFrom) await call(`/api/admin/settings?effectiveFrom=${scheduledFrom}`, { method: "DELETE" }).then(() => console.log("agendamento simulado cancelado"));
}
process.exit(failures ? 1 : 0);
