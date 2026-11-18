/**
 * Leitura de tendência para gráficos comparativos.
 * Regra de negócio: compara o último período com a média dos até 3 anteriores;
 * variação de até 5% (em módulo) é "estável".
 */
export type TrendVerdict = "melhorando" | "estavel" | "piorando" | "sem-base";

export interface TrendReading {
  verdict: TrendVerdict;
  /** Variação percentual do último valor vs média dos anteriores (null sem base). */
  deltaPct: number | null;
  baseline: number | null;
}

const STABLE_BAND_PCT = 5;

/** Média móvel simples (janela `size`), null enquanto não há pontos suficientes. */
export function movingAverage(values: Array<number | null>, size = 3): Array<number | null> {
  return values.map((_, i) => {
    const win = values.slice(Math.max(0, i - size + 1), i + 1).filter((v): v is number => v != null);
    if (win.length === 0) return null;
    return Math.round((win.reduce((a, b) => a + b, 0) / win.length) * 10) / 10;
  });
}

/** Percentil inclusivo (PERCENTILE.INC) arredondado para cima, como o P85 do projeto. */
export function percentileCeil(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const rank = 1 + p * (s.length - 1);
  const lo = Math.floor(rank);
  const frac = rank - lo;
  const a = s[lo - 1];
  const b = s[Math.min(lo, s.length - 1)];
  return Math.ceil(a + frac * (b - a));
}

/**
 * @param lowerIsBetter true para Cycle Time (menor = melhor), false para Vazão.
 */
export function readTrend(values: Array<number | null>, lowerIsBetter: boolean): TrendReading {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length < 2) return { verdict: "sem-base", deltaPct: null, baseline: null };
  const last = valid[valid.length - 1];
  const prev = valid.slice(Math.max(0, valid.length - 4), valid.length - 1);
  const baseline = prev.reduce((a, b) => a + b, 0) / prev.length;
  // Base zerada: qualquer valor novo é mudança de direção (ex.: transbordo 0 -> 48% = piorando)
  if (baseline === 0) return { verdict: last === 0 ? "estavel" : lowerIsBetter ? "piorando" : "melhorando", deltaPct: null, baseline };
  const deltaPct = ((last - baseline) / baseline) * 100;
  if (Math.abs(deltaPct) <= STABLE_BAND_PCT) return { verdict: "estavel", deltaPct, baseline };
  const better = lowerIsBetter ? deltaPct < 0 : deltaPct > 0;
  return { verdict: better ? "melhorando" : "piorando", deltaPct, baseline };
}
