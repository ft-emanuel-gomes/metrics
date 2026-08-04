/**
 * Simulação Monte Carlo para previsão de entrega.
 *
 * Segue o mesmo conceito do Nave (ActionableAgile):
 * - Usa THROUGHPUT DIÁRIO como base (quantos itens concluídos por dia)
 * - Simula N iterações sorteando dias aleatórios do histórico
 * - Cada iteração acumula throughput diário até atingir o total de itens
 * - Resultado: distribuição de datas de conclusão em percentis
 *
 * Ajuste de capacidade: +/- 10% por pessoa diferente do padrão.
 */

export interface MonteCarloInput {
  /** Throughput diário: array onde cada elemento = itens concluídos naquele dia */
  dailyThroughput: number[];
  /** Quantidade de itens a entregar */
  itemCount: number;
  /** Tamanho padrão do time (default da squad) */
  defaultTeamSize: number;
  /** Tamanho do time para a simulação */
  simulationTeamSize: number;
  /** Data de início do desenvolvimento */
  startDate: string; // ISO 8601 (YYYY-MM-DD)
  /** Número de simulações (default: 10000) */
  simulations?: number;
}

export interface MonteCarloResult {
  /** Dias necessários por percentil */
  daysP50: number;
  daysP75: number;
  daysP85: number;
  /** Datas previstas de conclusão */
  dateP50: string;
  dateP75: string;
  dateP85: string;
  /** Metadados */
  totalDaysAnalyzed: number;
  avgDailyThroughput: number;
  adjustedAvgDailyThroughput: number;
  capacityAdjustment: number;
  totalSimulations: number;
}

/**
 * Executa simulação Monte Carlo baseada em throughput diário.
 *
 * Para cada iteração:
 * 1. Sortear aleatoriamente um dia do histórico (com reposição)
 * 2. Somar o throughput daquele dia (ajustado por capacidade)
 * 3. Repetir até acumular >= itemCount
 * 4. Registrar quantos dias foram necessários
 *
 * Retorna percentis P50, P75, P85 convertidos em datas.
 */
export function runMonteCarloSimulation(input: MonteCarloInput): MonteCarloResult {
  const {
    dailyThroughput,
    itemCount,
    defaultTeamSize,
    simulationTeamSize,
    startDate,
    simulations = 10000,
  } = input;

  if (dailyThroughput.length === 0 || itemCount <= 0) {
    return {
      daysP50: 0,
      daysP75: 0,
      daysP85: 0,
      dateP50: startDate,
      dateP75: startDate,
      dateP85: startDate,
      totalDaysAnalyzed: 0,
      avgDailyThroughput: 0,
      adjustedAvgDailyThroughput: 0,
      capacityAdjustment: 1,
      totalSimulations: simulations,
    };
  }

  // Ajuste de capacidade: +/- 10% por pessoa diferente do padrão
  const peopleDiff = simulationTeamSize - defaultTeamSize;
  const capacityAdjustment = 1 + (peopleDiff * 0.10);

  // Média de throughput diário (para exibição)
  const totalItems = dailyThroughput.reduce((s, v) => s + v, 0);
  const avgDaily = totalItems / dailyThroughput.length;
  const adjustedAvgDaily = avgDaily * capacityAdjustment;

  // Executar N simulações
  const daysNeeded: number[] = [];

  for (let sim = 0; sim < simulations; sim++) {
    let remaining = itemCount;
    let days = 0;

    while (remaining > 0 && days < 365) {
      // Sortear aleatoriamente um dia do histórico
      const idx = Math.floor(Math.random() * dailyThroughput.length);
      const sampledDaily = dailyThroughput[idx];

      // Aplicar ajuste de capacidade
      const adjusted = sampledDaily * capacityAdjustment;

      remaining -= adjusted;
      days++;
    }

    daysNeeded.push(days);
  }

  // Ordenar para calcular percentis
  daysNeeded.sort((a, b) => a - b);

  const daysP50 = percentile(daysNeeded, 0.50);
  const daysP75 = percentile(daysNeeded, 0.75);
  const daysP85 = percentile(daysNeeded, 0.85);

  // Converter dias em datas (apenas dias úteis — pular fins de semana)
  const dateP50 = addBusinessDays(startDate, daysP50);
  const dateP75 = addBusinessDays(startDate, daysP75);
  const dateP85 = addBusinessDays(startDate, daysP85);

  return {
    daysP50,
    daysP75,
    daysP85,
    dateP50,
    dateP75,
    dateP85,
    totalDaysAnalyzed: dailyThroughput.length,
    avgDailyThroughput: Math.round(avgDaily * 100) / 100,
    adjustedAvgDailyThroughput: Math.round(adjustedAvgDaily * 100) / 100,
    capacityAdjustment: Math.round(capacityAdjustment * 100) / 100,
    totalSimulations: simulations,
  };
}

/**
 * Converte issues concluídas com datas em throughput diário.
 * Para cada dia do período, conta quantos itens foram concluídos naquele dia.
 *
 * @param completionDates - Array de datas ISO (resolutionDate ou data da transição para Done)
 * @param startDate - Início do período
 * @param endDate - Fim do período
 */
export function buildDailyThroughput(
  completionDates: string[],
  startDate: string,
  endDate: string
): number[] {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const daily: number[] = [];

  // Contar itens por dia
  const countByDay = new Map<string, number>();
  for (const date of completionDates) {
    const day = date.split("T")[0];
    countByDay.set(day, (countByDay.get(day) || 0) + 1);
  }

  // Gerar array de throughput para cada dia do período (incluindo zeros)
  const current = new Date(start);
  while (current <= end) {
    const dayKey = current.toISOString().split("T")[0];
    const dayOfWeek = current.getDay();

    // Incluir apenas dias úteis (seg-sex)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daily.push(countByDay.get(dayKey) || 0);
    }

    current.setDate(current.getDate() + 1);
  }

  return daily;
}

// --- Helpers ---

function percentile(sortedArr: number[], p: number): number {
  const n = sortedArr.length;
  const rank = 1 + p * (n - 1);
  const floor = Math.floor(rank);
  const frac = rank - floor;

  if (floor >= n) return sortedArr[n - 1];
  if (floor < 1) return sortedArr[0];

  const lower = sortedArr[floor - 1];
  const upper = sortedArr[floor] ?? lower;

  return Math.ceil(lower + frac * (upper - lower));
}

function addBusinessDays(isoDate: string, days: number): string {
  const d = new Date(isoDate);
  let added = 0;

  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      added++;
    }
  }

  return d.toISOString().split("T")[0];
}
