import { CYCLE_TIME_END_STATUSES } from "@/config/status-mapping";

/**
 * Resumo executivo da sprint vigente, organizado pelas FEATURES (pai dos standard issues).
 *
 * Regras de negócio:
 * - Escopo = standard issues na sprint agora (filtro de tipos da tela); a subtask segue o tipo do card pai.
 * - Concluído = status atual Concluído. Concluído ANTES da janela da sprint (fechamento da anterior) é trabalho
 *   da sprint anterior: fica fora de totais e percentuais (mesma regra do Burndown).
 * - Horas alocadas (cards + subtasks) = o comprometido DESTA sprint (ver sprintAllocationHours): regra do maior entre
 *   card e subtasks, sem o que já foi concluído antes da janela da sprint. A Capacidade da Sprint usa a mesma função.
 * - Bloqueio = card ainda NÃO concluído marcado como impedimento no Jira (bandeira "Flagged" = Impediment).
 *   Links entre issues ("bloqueia", "é bloqueado por", pré-requisito) NÃO contam como bloqueio.
 *   O bloqueio é do card, mas a Feature dele fica bloqueada.
 * - Estado da Feature (nesta ordem): Concluída (status Concluído) > Bloqueada (algum card com bloqueio ativo)
 *   > Em andamento (algum card já iniciado ou concluído) > Por começar.
 */

/**
 * Alerta de estimativa: o Original Estimate do card é muito maior que a soma das subtasks dele.
 * Pela regra do maior (card × subtasks), um erro de digitação no card (ex.: 245h no lugar de 24,5h) infla as
 * horas alocadas e, se o card for concluído, as horas concluídas. O alerta não muda a conta: só sinaliza.
 */
export interface EstimateAlert {
  /**
   * acima-subtasks = estimativa do card (já sem as canceladas) muito maior que as subtasks (infla as horas pela regra do maior);
   * invalida = estimativa acima do teto da Ocupação (480h), ignorada na conta, mas errada no Jira.
   */
  kind: "acima-subtasks" | "invalida";
  cardKey: string;
  /** Original Estimate do card (h) */
  cardHours: number;
  /** Soma das subtasks ativas do card (sem canceladas/rejeitadas) (h) */
  subtaskHours: number;
  /** Soma das subtasks canceladas/rejeitadas do card (h) */
  canceledHours: number;
}

/** Card com estimativa acima de RATIO × soma das subtasks e acima de MIN_HOURS dispara o alerta. */
export const ESTIMATE_ALERT_RATIO = 3;
export const ESTIMATE_ALERT_MIN_HOURS = 40;

/**
 * Cards com estimativa a revisar:
 * - invalida: acima do teto de 480h (ignorada na conta), com ou sem subtasks;
 * - acima-subtasks: mais de RATIO × a soma das subtasks e acima de MIN_HOURS. Só compara cards que TÊM
 *   subtasks estimadas (sem subtasks, a estimativa do card é a única referência). Soma subtasks de todas as sprints.
 */
export function findEstimateAlerts(
  cards: { key: string; estimateHours: number }[],
  subs: { parentKey: string | null; hours: number; canceled?: boolean }[]
): EstimateAlert[] {
  const liveByParent = new Map<string, number>();
  const canceledByParent = new Map<string, number>();
  for (const s of subs) {
    if (!s.parentKey || !(s.hours > 0) || s.hours > MAX_ESTIMATE_HOURS) continue;
    const m = s.canceled ? canceledByParent : liveByParent;
    m.set(s.parentKey, (m.get(s.parentKey) ?? 0) + s.hours);
  }
  const alerts: EstimateAlert[] = [];
  for (const c of cards) {
    const cardHours = round1(c.estimateHours);
    const subtaskHours = round1(liveByParent.get(c.key) ?? 0);
    const canceledHours = round1(canceledByParent.get(c.key) ?? 0);
    // Estimativa que entra na conta: sem as subtasks canceladas/rejeitadas
    const effective = Math.max(0, cardHours - canceledHours);
    // Um alerta por card, do mais grave para o mais leve
    if (cardHours > MAX_ESTIMATE_HOURS) alerts.push({ kind: "invalida", cardKey: c.key, cardHours, subtaskHours, canceledHours });
    else if (subtaskHours > 0 && effective > ESTIMATE_ALERT_MIN_HOURS && effective > subtaskHours * ESTIMATE_ALERT_RATIO) {
      alerts.push({ kind: "acima-subtasks", cardKey: c.key, cardHours, subtaskHours, canceledHours });
    }
    // Subtasks canceladas/rejeitadas não geram alerta: a conta já desconta essas horas da estimativa do card
  }
  // Primeiro os que inflam as horas (maior diferença primeiro), depois os inválidos
  const rank: Record<EstimateAlert["kind"], number> = { "acima-subtasks": 0, invalida: 1 };
  const weight = (a: EstimateAlert) => a.cardHours - a.canceledHours - a.subtaskHours;
  return alerts.sort((a, b) => rank[a.kind] - rank[b.kind] || weight(b) - weight(a));
}

export type FeatureState = "concluida" | "bloqueada" | "em-andamento" | "nao-iniciada";

/** Responsável (assignee) de um card ou subtask no Jira. */
export interface ExecPerson {
  accountId: string;
  name: string;
  /** Foto do Jira (avatarUrls 48x48) */
  avatarUrl?: string;
}

/** Engenheiro da Feature: itens e horas que estão com ele nesta sprint. */
export interface ExecFeaturePerson extends ExecPerson {
  /** Cards + subtasks desta sprint com essa pessoa como responsável */
  items: number;
  /** Horas alocadas dela (mesma regra do comprometido da sprint) */
  allocatedHours: number;
  doneHours: number;
  /** Alocado − concluído */
  remainingHours: number;
  /** Chaves dos itens (cards e subtasks) desta Feature na sprint com essa pessoa, em ordem. Em "Sem responsável", são os itens a alocar. */
  itemKeys: { key: string; done: boolean }[];
}

/** Chave de quem não tem responsável no Jira */
export const UNASSIGNED_ID = "";

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
  /** Responsável no Jira (null = sem responsável) */
  assignee?: ExecPerson | null;
}

export interface ExecSubInput {
  key: string;
  parentKey: string | null;
  /** Original Estimate em horas (0 = sem estimativa) */
  hours: number;
  doneAtMs: number | null;
  /** Responsável no Jira (null = sem responsável) */
  assignee?: ExecPerson | null;
  /** Cancelada ou Rejeitada: só desconta da estimativa do card pai (ver AllocationSub.canceled) */
  canceled?: boolean;
}

export interface ExecFeature {
  key: string;
  title: string;
  /** Status da Feature no Jira */
  status: string;
  state: FeatureState;
  cards: { total: number; done: number };
  /** Horas alocadas da Feature nesta sprint (cards + subtasks, regra do maior, sem o trabalho de sprints anteriores) */
  allocatedHours: { total: number; done: number; pct: number };
  /** Cards da Feature com bloqueio ativo */
  blockedCardKeys: string[];
  /** Cards da Feature com estimativa muito acima das subtasks (provável erro de cadastro) */
  estimateAlerts: EstimateAlert[];
  /** Texto curto do motivo do bloqueio (vazio se não bloqueada) */
  blockNote: string;
  /**
   * Engenheiros da Feature (responsáveis dos cards e subtasks desta sprint), mais itens primeiro.
   * Quem não tem responsável no Jira aparece com accountId = UNASSIGNED_ID, sempre por último.
   */
  people: ExecFeaturePerson[];
}

export interface SprintExecutiveResult {
  sprint: { id: number; name: string; startDate: string; endDate: string };
  asOf: string;
  totals: {
    features: { total: number; concluded: number; blocked: number; inProgress: number; notStarted: number };
    cards: { total: number; done: number; pct: number; blocked: number; /** Cards bloqueados sem Feature como pai (chaves) */ blockedWithoutFeature: string[] };
    /** Horas alocadas desta sprint (cards + subtasks), sem o trabalho concluído antes da janela da sprint */
    allocatedHours: { total: number; done: number; pct: number; /** Subtasks desta sprint sem Original Estimate */ unestimatedSubtasks: number };
    /** Cards já concluídos antes da sprint (fora das contagens de cards) */
    priorWork: { cards: number };
    /** Todos os cards da sprint com estimativa muito acima das subtasks */
    estimateAlerts: EstimateAlert[];
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

/** Mesmo teto da Ocupação: estimativa acima de 12 semanas (480h) é tratada como erro de cadastro. */
const MAX_ESTIMATE_HOURS = 12 * 5 * 8;
const validHours = (h: number) => (h > 0 && h <= MAX_ESTIMATE_HOURS ? h : 0);

/**
 * Horas alocadas DA SPRINT VIGENTE (comprometido) e quanto já foi concluído nela.
 *
 * Regra de negócio: só entra o que corresponde a esta sprint.
 * - Trabalho concluído ANTES da janela da sprint (sprint anterior) fica fora do total e do concluído.
 *   Ex.: card de 5h com 5 subtasks de 1h, 4 concluídas na sprint anterior → comprometido = 1h.
 * - Por card: o MAIOR entre (estimativa do card − horas de subtasks concluídas antes da sprint) e a soma das
 *   subtasks desta sprint. Nunca soma os dois (regra da Ocupação).
 * - Concluído: card concluído na sprint → todas as horas dele; card em andamento → horas das subtasks
 *   concluídas nesta sprint, até o limite do card.
 * - Subtasks sem card na lista entram pela soma delas (só as desta sprint).
 */
/** Card mínimo para a conta de horas (o Resumo executivo e a Capacidade da Sprint usam a mesma função). */
export interface AllocationCard {
  key: string;
  /** Original Estimate do card em horas */
  estimateHours: number;
  /** Conclusão (última transição para Concluído); null = aberto */
  doneAtMs: number | null;
}
/** Subtask mínima para a conta de horas. */
export interface AllocationSub {
  key: string;
  parentKey: string | null;
  hours: number;
  doneAtMs: number | null;
  /**
   * Cancelada ou Rejeitada no Jira. Não conta como trabalho: as horas dela só são DESCONTADAS da estimativa do
   * card pai (a estimativa do card costuma incluir as subtasks que depois foram canceladas).
   */
  canceled?: boolean;
}

export function sprintAllocationHours(
  cards: AllocationCard[],
  subs: AllocationSub[],
  isPrior: (doneAtMs: number | null) => boolean
): { total: number; done: number } {
  const byParent = new Map<string, { total: number; done: number; prior: number }>();
  let looseTotal = 0;
  let looseDone = 0;
  const cardKeys = new Set(cards.map((c) => c.key));
  for (const s of subs) {
    const h = validHours(s.hours);
    if (h === 0) continue;
    // Cancelada/Rejeitada: só desconta da estimativa do card (soma em "prior", que já é descontado)
    if (s.canceled) {
      if (s.parentKey && cardKeys.has(s.parentKey)) {
        const agg = byParent.get(s.parentKey) ?? { total: 0, done: 0, prior: 0 };
        agg.prior += h;
        byParent.set(s.parentKey, agg);
      }
      continue;
    }
    const prior = isPrior(s.doneAtMs);
    if (s.parentKey && cardKeys.has(s.parentKey)) {
      const agg = byParent.get(s.parentKey) ?? { total: 0, done: 0, prior: 0 };
      if (prior) agg.prior += h;
      else {
        agg.total += h;
        if (s.doneAtMs !== null) agg.done += h;
      }
      byParent.set(s.parentKey, agg);
    } else if (!prior) {
      looseTotal += h;
      if (s.doneAtMs !== null) looseDone += h;
    }
  }
  let total = looseTotal;
  let done = looseDone;
  for (const c of cards) {
    const sub = byParent.get(c.key) ?? { total: 0, done: 0, prior: 0 };
    // Estimativa do card descontada do que já foi feito antes desta sprint e das subtasks canceladas/rejeitadas
    const cardLeft = Math.max(0, validHours(c.estimateHours) - sub.prior);
    const alloc = Math.max(cardLeft, sub.total);
    total += alloc;
    done += c.doneAtMs !== null ? alloc : Math.min(alloc, sub.done);
  }
  return { total, done: Math.min(done, total) };
}

/**
 * Horas alocadas POR PESSOA, com a mesma regra de sprintAllocationHours (a soma das pessoas = total da Feature).
 * - Subtask desta sprint: as horas dela vão para o responsável da subtask.
 * - Card: se a estimativa do card (descontado o feito antes da sprint) passa da soma das subtasks desta sprint,
 *   a diferença vai para o responsável do card.
 * - Concluído: card concluído → todas as horas dele (de todas as pessoas) contam como concluídas;
 *   card em andamento → as subtasks concluídas nesta sprint.
 * - Itens = cards + subtasks desta sprint com a pessoa como responsável (inclusive sem estimativa).
 */
export function peopleAllocation(
  cards: (AllocationCard & { assignee?: ExecPerson | null })[],
  subs: (AllocationSub & { assignee?: ExecPerson | null })[],
  isPrior: (doneAtMs: number | null) => boolean
): ExecFeaturePerson[] {
  const acc = new Map<string, ExecFeaturePerson>();
  const get = (p?: ExecPerson | null): ExecFeaturePerson => {
    const id = p?.accountId || UNASSIGNED_ID;
    let e = acc.get(id);
    if (!e) {
      e = { accountId: id, name: p?.name || "Sem responsável", avatarUrl: p?.avatarUrl, items: 0, allocatedHours: 0, doneHours: 0, remainingHours: 0, itemKeys: [] };
      acc.set(id, e);
    }
    return e;
  };
  const cardByKey = new Map(cards.map((c) => [c.key, c]));
  const subsByCard = new Map<string, (typeof subs)[number][]>();
  const priorByCard = new Map<string, number>();
  for (const s of subs) {
    // Feita antes da sprint ou cancelada/rejeitada: não é item de ninguém, só desconta da estimativa do card
    const prior = isPrior(s.doneAtMs) || s.canceled === true;
    const card = s.parentKey ? cardByKey.get(s.parentKey) : undefined;
    if (prior) {
      if (card) priorByCard.set(card.key, (priorByCard.get(card.key) ?? 0) + validHours(s.hours));
      continue;
    }
    const p = get(s.assignee);
    p.items += 1;
    p.itemKeys.push({ key: s.key, done: s.doneAtMs !== null || (card?.doneAtMs ?? null) !== null });
    if (card) {
      const list = subsByCard.get(card.key) ?? [];
      list.push(s);
      subsByCard.set(card.key, list);
    } else {
      // Subtask sem o card na lista: entra pela própria estimativa
      const h = validHours(s.hours);
      p.allocatedHours += h;
      if (s.doneAtMs !== null) p.doneHours += h;
    }
  }
  for (const c of cards) {
    const owner = get(c.assignee);
    owner.items += 1;
    owner.itemKeys.push({ key: c.key, done: c.doneAtMs !== null });
    const list = subsByCard.get(c.key) ?? [];
    const cardDone = c.doneAtMs !== null;
    let subTotal = 0;
    for (const s of list) {
      const h = validHours(s.hours);
      subTotal += h;
      const p = get(s.assignee);
      p.allocatedHours += h;
      if (cardDone || s.doneAtMs !== null) p.doneHours += h;
    }
    const cardLeft = Math.max(0, validHours(c.estimateHours) - (priorByCard.get(c.key) ?? 0));
    const extra = Math.max(0, cardLeft - subTotal);
    owner.allocatedHours += extra;
    if (cardDone) owner.doneHours += extra;
  }
  return [...acc.values()]
    .map((p) => {
      const allocatedHours = round1(p.allocatedHours);
      const doneHours = Math.min(allocatedHours, round1(p.doneHours));
      // Abertos primeiro (são os que precisam de alocação), depois em ordem natural da chave (CS-9 antes de CS-10)
      const itemKeys = [...p.itemKeys].sort((a, b) => Number(a.done) - Number(b.done) || a.key.localeCompare(b.key, "en", { numeric: true }));
      return { ...p, allocatedHours, doneHours, remainingHours: round1(allocatedHours - doneHours), itemKeys };
    })
    .sort((a, b) => {
      // Sem responsável sempre por último
      if ((a.accountId === UNASSIGNED_ID) !== (b.accountId === UNASSIGNED_ID)) return a.accountId === UNASSIGNED_ID ? 1 : -1;
      return b.items - a.items || b.allocatedHours - a.allocatedHours || a.name.localeCompare(b.name, "pt-BR");
    });
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

  // Trabalho concluído antes da janela da sprint fica fora; canceladas/rejeitadas não são trabalho desta sprint
  const cards = input.cards.filter((c) => !isPrior(c.doneAtMs));
  const subs = input.subs.filter((s) => !isPrior(s.doneAtMs) && !s.canceled);
  const priorCards = input.cards.length - cards.length;


  const isBlocked = isBlockedCard;
  // Estimativas suspeitas: cards desta sprint × todas as subtasks deles
  const estimateAlerts = findEstimateAlerts(cards, input.subs);

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
    const h = sprintAllocationHours(list, subsByFeature.get(key) ?? [], isPrior);
    return {
      key,
      title: head.featureTitle || key,
      status: head.featureStatus || "",
      state,
      cards: { total: list.length, done: list.filter((c) => c.doneAtMs !== null).length },
      allocatedHours: { total: round1(h.total), done: round1(h.done), pct: pct(h.done, h.total) },
      blockedCardKeys: blocked.map((c) => c.key),
      estimateAlerts: estimateAlerts.filter((a) => list.some((c) => c.key === a.cardKey)),
      blockNote: state === "bloqueada" ? buildBlockNote(blocked) : "",
      people: peopleAllocation(list, subsByFeature.get(key) ?? [], isPrior),
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
  // Comprometido desta sprint (horas inteiras): sem o que foi concluído antes da janela da sprint
  const alloc = sprintAllocationHours(cards, input.subs, isPrior);
  const hoursTotal = Math.round(alloc.total);
  const hoursDone = Math.min(hoursTotal, Math.round(alloc.done));

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
      allocatedHours: { total: hoursTotal, done: hoursDone, pct: pct(hoursDone, hoursTotal), unestimatedSubtasks: subs.filter((s) => s.hours <= 0).length },
      priorWork: { cards: priorCards },
      estimateAlerts,
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
