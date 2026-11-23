import { CYCLE_TIME_END_STATUSES } from "@/config/status-mapping";
import { resolveOccupationEstimates } from "./occupation";

/**
 * Resumo executivo da sprint vigente, organizado pelas FEATURES (pai dos standard issues).
 *
 * Regras de negócio:
 * - Escopo = standard issues na sprint agora (filtro de tipos da tela); a subtask segue o tipo do card pai.
 * - Concluído = status atual Concluído. Concluído ANTES da janela da sprint (fechamento da anterior) é trabalho
 *   da sprint anterior: fica fora de totais e percentuais (mesma regra do Burndown).
 * - Duas visões de horas, lado a lado para transparência:
 *   · Subtasks: Original Estimate das subtasks (Sub-task e Sub-bug), mesma base do Burndown em horas
 *     (concluído antes da janela da sprint fica fora).
 *   · Alocadas (cards + subtasks): regra da Ocupação: por card, o MAIOR entre a estimativa do card e a soma das
 *     subtasks (nunca soma os dois); todos os itens da sprint agora. Bate com as "Horas alocadas" da Capacidade.
 * - Bloqueio = card ainda NÃO concluído marcado como impedimento no Jira (bandeira "Flagged" = Impediment).
 *   Links entre issues ("bloqueia", "é bloqueado por", pré-requisito) NÃO contam como bloqueio.
 *   O bloqueio é do card, mas a Feature dele fica bloqueada.
 * - Estado da Feature (nesta ordem): Concluída (status Concluído) > Bloqueada (algum card com bloqueio ativo)
 *   > Em andamento (algum card já iniciado ou concluído) > Por começar.
 */

export type FeatureState = "concluida" | "bloqueada" | "em-andamento" | "nao-iniciada";

/** Card (standard issue) da sprint, já lido do Jira. */
export interface ExecCardInput {
  key: string;
  summary: string;
  status: string;
  /** Feature pai (null = sem Feature) */
  featureKey: string | null;
  featureTitle?: string;
  featureStatus?: string;
  /** Marcado como impedimento no Jira (Flagged) */
  flagged: boolean;
  /** Original Estimate do card em horas (0 = sem estimativa) */
  estimateHours: number;
  /** Momento da conclusão (última transição para Concluído); null = não concluído */
  doneAtMs: number | null;
}

export interface ExecSubInput {
  key: string;
  parentKey: string | null;
  /** Original Estimate em horas (0 = sem estimativa) */
  hours: number;
  doneAtMs: number | null;
}

export interface ExecFeature {
  key: string;
  title: string;
  /** Status da Feature no Jira */
  status: string;
  state: FeatureState;
  cards: { total: number; done: number };
  /** Horas das subtasks da Feature (base do Burndown em horas) */
  subtaskHours: { total: number; done: number; pct: number };
  /** Horas alocadas da Feature (cards + subtasks, regra do maior; base da Capacidade) */
  allocatedHours: { total: number; done: number; pct: number };
  /** Cards da Feature com bloqueio ativo */
  blockedCardKeys: string[];
  /** Texto curto do motivo do bloqueio (vazio se não bloqueada) */
  blockNote: string;
}

export interface SprintExecutiveResult {
  sprint: { id: number; name: string; startDate: string; endDate: string };
  asOf: string;
  totals: {
    features: { total: number; concluded: number; blocked: number; inProgress: number; notStarted: number };
    cards: { total: number; done: number; pct: number; blocked: number; /** Cards bloqueados sem Feature como pai (chaves) */ blockedWithoutFeature: string[] };
    /** Horas das subtasks (Sub-task e Sub-bug), mesma base do Burndown em horas */
    subtaskHours: { total: number; done: number; pct: number; unestimatedSubtasks: number };
    /** Horas alocadas (cards + subtasks), mesma base das "Horas alocadas" da Capacidade da Sprint */
    allocatedHours: { total: number; done: number; pct: number };
    /** Cards já concluídos antes da sprint (fora das contagens de cards) */
    priorWork: { cards: number };
  };
  features: ExecFeature[];
}

/** Status em que o card ainda não começou (fila/refinamento) */
const NOT_STARTED = new Set([
  "To Do", "A Fazer", "Pendente", "Backlog", "Selected for Development",
  "Business Definition", "Refinamento de Negócio", "Refinamento Técnico",
]);

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);
const cardWord = (n: number) => (n === 1 ? "1 card" : `${n} cards`);

/** Bloqueado = ainda não concluído e com impedimento marcado no Jira. */
function isBlockedCard(card: ExecCardInput): boolean {
  return card.doneAtMs === null && card.flagged;
}

/** "ED-2045 com impedimento marcado no Jira" / "ED-2045 e ED-2046 com impedimento…" / "4 cards (ED-1, ED-2, ED-3 e mais 1) com…" */
function buildBlockNote(blocked: ExecCardInput[]): string {
  const keys = blocked.map((c) => c.key);
  const list =
    keys.length === 1 ? keys[0]
    : keys.length <= 3 ? `${keys.slice(0, -1).join(", ")} e ${keys[keys.length - 1]}`
    : `${cardWord(keys.length)} (${keys.slice(0, 3).join(", ")} e mais ${keys.length - 3})`;
  return `${list} com impedimento marcado no Jira`;
}

/**
 * Horas alocadas e concluídas de um conjunto de cards e subtasks, pela regra da Ocupação
 * (resolveOccupationEstimates: por card, o maior entre a estimativa dele e a soma das subtasks).
 * Concluído = alocado − restante, sendo restante a mesma regra aplicada só aos itens não concluídos
 * (mesma conta da Capacidade da Sprint).
 */
function allocationHours(cards: ExecCardInput[], subs: ExecSubInput[]): { total: number; done: number } {
  const sec = (h: number) => Math.round(h * 3600);
  const std = (onlyOpen: boolean) => cards.map((c) => ({ key: c.key, originalEstimateSeconds: onlyOpen && c.doneAtMs !== null ? 0 : sec(c.estimateHours) }));
  const sb = (onlyOpen: boolean) => subs.map((s) => ({ key: s.key, parentKey: s.parentKey ?? undefined, originalEstimateSeconds: onlyOpen && s.doneAtMs !== null ? 0 : sec(s.hours) }));
  const total = resolveOccupationEstimates(std(false), sb(false)) / 3600;
  const remaining = resolveOccupationEstimates(std(true), sb(true)) / 3600;
  return { total, done: Math.max(0, total - remaining) };
}

export function buildSprintExecutive(input: {
  sprint: SprintExecutiveResult["sprint"];
  cards: ExecCardInput[];
  subs: ExecSubInput[];
  windowStartMs: number;
  now?: Date;
}): SprintExecutiveResult {
  const { sprint, windowStartMs } = input;
  const isPrior = (d: number | null) => d !== null && d < windowStartMs;

  // Trabalho concluído antes da janela da sprint fica fora
  const cards = input.cards.filter((c) => !isPrior(c.doneAtMs));
  const subs = input.subs.filter((s) => !isPrior(s.doneAtMs));
  const priorCards = input.cards.length - cards.length;

  // Horas das subtasks por Feature (base do Burndown em horas), pelo card pai da subtask
  const cardByKey = new Map(cards.map((c) => [c.key, c]));
  const subHoursByFeature = new Map<string, { total: number; done: number }>();
  for (const s of subs) {
    const fk = s.parentKey ? cardByKey.get(s.parentKey)?.featureKey : null;
    if (!fk) continue;
    const h = subHoursByFeature.get(fk) ?? { total: 0, done: 0 };
    h.total += s.hours;
    if (s.doneAtMs !== null) h.done += s.hours;
    subHoursByFeature.set(fk, h);
  }

  const isBlocked = isBlockedCard;

  // Horas: base da ALOCAÇÃO (todos os itens da sprint agora, como a Capacidade da Sprint)
  const allCardByKey = new Map(input.cards.map((c) => [c.key, c]));
  const subsByFeature = new Map<string, ExecSubInput[]>();
  for (const s of input.subs) {
    const fk = s.parentKey ? allCardByKey.get(s.parentKey)?.featureKey : null;
    if (!fk) continue;
    const list = subsByFeature.get(fk) ?? [];
    list.push(s);
    subsByFeature.set(fk, list);
  }

  // Agrupa os cards por Feature
  const groups = new Map<string, ExecCardInput[]>();
  for (const c of cards) {
    if (!c.featureKey) continue;
    const list = groups.get(c.featureKey) ?? [];
    list.push(c);
    groups.set(c.featureKey, list);
  }

  const features: ExecFeature[] = [...groups.entries()].map(([key, list]) => {
    const head = list[0];
    const blocked = list.filter(isBlocked);
    const concluded = head.featureStatus ? CYCLE_TIME_END_STATUSES.has(head.featureStatus) : false;
    const started = list.some((c) => c.doneAtMs !== null || !NOT_STARTED.has(c.status));
    const state: FeatureState = concluded ? "concluida" : blocked.length > 0 ? "bloqueada" : started ? "em-andamento" : "nao-iniciada";
    const h = allocationHours(input.cards.filter((c) => c.featureKey === key), subsByFeature.get(key) ?? []);
    const sh = subHoursByFeature.get(key) ?? { total: 0, done: 0 };
    return {
      key,
      title: head.featureTitle || key,
      status: head.featureStatus || "",
      state,
      cards: { total: list.length, done: list.filter((c) => c.doneAtMs !== null).length },
      subtaskHours: { total: round1(sh.total), done: round1(sh.done), pct: pct(sh.done, sh.total) },
      allocatedHours: { total: round1(h.total), done: round1(h.done), pct: pct(h.done, h.total) },
      blockedCardKeys: blocked.map((c) => c.key),
      blockNote: state === "bloqueada" ? buildBlockNote(blocked) : "",
    };
  });

  // Ordem de leitura: bloqueadas (mais cards travados primeiro), em andamento (mais avançadas primeiro), por começar, concluídas
  const rank: Record<FeatureState, number> = { bloqueada: 0, "em-andamento": 1, "nao-iniciada": 2, concluida: 3 };
  features.sort((a, b) => {
    if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
    if (a.state === "bloqueada") return b.blockedCardKeys.length - a.blockedCardKeys.length;
    return pct(b.cards.done, b.cards.total) - pct(a.cards.done, a.cards.total);
  });

  const count = (s: FeatureState) => features.filter((f) => f.state === s).length;
  const cardsDone = cards.filter((c) => c.doneAtMs !== null).length;
  // Mesmo arredondamento da Capacidade da Sprint (horas inteiras), para os totais baterem
  const alloc = allocationHours(input.cards, input.subs);
  const hoursTotal = Math.round(alloc.total);
  const hoursDone = Math.max(0, hoursTotal - Math.round(alloc.total - alloc.done));
  const subTotal = round1(subs.reduce((a, s) => a + s.hours, 0));
  const subDone = round1(subs.filter((s) => s.doneAtMs !== null).reduce((a, s) => a + s.hours, 0));

  return {
    sprint,
    asOf: (input.now ?? new Date()).toISOString(),
    totals: {
      features: { total: features.length, concluded: count("concluida"), blocked: count("bloqueada"), inProgress: count("em-andamento"), notStarted: count("nao-iniciada") },
      cards: {
        total: cards.length,
        done: cardsDone,
        pct: pct(cardsDone, cards.length),
        blocked: cards.filter(isBlocked).length,
        blockedWithoutFeature: cards.filter((c) => !c.featureKey && isBlocked(c)).map((c) => c.key),
      },
      subtaskHours: { total: subTotal, done: subDone, pct: pct(subDone, subTotal), unestimatedSubtasks: subs.filter((s) => s.hours <= 0).length },
      allocatedHours: { total: hoursTotal, done: hoursDone, pct: pct(hoursDone, hoursTotal) },
      priorWork: { cards: priorCards },
    },
    features,
  };
}

/** Frases do resumo (texto maior e menor, como no Resumo da Squad). */
export interface ExecutiveNarrative {
  /** Frase em destaque (negrito) */
  lead: string;
  /** Continuação da abertura (peso normal) */
  leadRest: string;
  /** Frase intermediária: o que merece atenção */
  attention: string;
  attentionTone: "positive" | "negative" | "neutral";
}

const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

export function buildExecutiveNarrative(r: SprintExecutiveResult): ExecutiveNarrative {
  const f = r.totals.features;
  if (r.totals.cards.total === 0) {
    return { lead: `A ${r.sprint.name} ainda não tem cards priorizados.`, leadRest: "", attention: "Assim que houver cards na sprint, as Features aparecem aqui.", attentionTone: "neutral" };
  }
  if (f.total === 0) {
    return { lead: `A ${r.sprint.name} tem ${plural(r.totals.cards.total, "card", "cards")}, nenhum ligado a uma Feature.`, leadRest: "", attention: "Vincule os cards a uma Feature no Jira para acompanhar a entrega por funcionalidade.", attentionTone: "neutral" };
  }
  const parts = [
    f.concluded > 0 ? `${f.concluded} ${f.concluded === 1 ? "concluída" : "concluídas"}` : "",
    f.inProgress > 0 ? `${f.inProgress} em andamento` : "",
    f.blocked > 0 ? `${f.blocked} ${f.blocked === 1 ? "bloqueada" : "bloqueadas"}` : "",
    f.notStarted > 0 ? `${f.notStarted} por começar` : "",
  ].filter(Boolean);
  const list = parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;

  // Cards bloqueados que não pertencem a nenhuma Feature também precisam aparecer
  const orphan = r.totals.cards.blockedWithoutFeature;
  const orphanText = orphan.length > 0 ? `${plural(orphan.length, "card bloqueado", "cards bloqueados")} sem Feature vinculada (${orphan.slice(0, 3).join(", ")}${orphan.length > 3 ? " e mais" : ""})` : "";
  let attention: string;
  if (f.blocked > 0) {
    const inFeatures = r.totals.cards.blocked - orphan.length;
    attention = `${f.blocked === 1 ? "1 Feature está bloqueada" : `${f.blocked} Features estão bloqueadas`} por ${plural(inFeatures, "card", "cards")} e a entrega ${f.blocked === 1 ? "dela" : "delas"} nesta sprint está em risco.${orphanText ? ` Há ainda ${orphanText}.` : ""}`;
  } else if (r.totals.cards.blocked > 0) {
    attention = orphanText ? `${orphanText[0].toUpperCase()}${orphanText.slice(1)}.` : `${plural(r.totals.cards.blocked, "card está bloqueado", "cards estão bloqueados")}.`;
  } else {
    attention = "Nenhum bloqueio ativo nos cards da sprint.";
  }

  return {
    lead: `A ${r.sprint.name} prioriza ${plural(f.total, "Feature", "Features")}.`,
    leadRest: `${list.charAt(0).toUpperCase()}${list.slice(1)}.`,
    attention,
    attentionTone: r.totals.cards.blocked > 0 ? "negative" : "positive",
  };
}
