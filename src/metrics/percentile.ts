/**
 * Módulo de cálculo de percentil — PERCENTILE.INC (interpolação linear).
 * Equivalente à função PERCENTILE.INC do Excel.
 *
 * Regras:
 * - Sempre arredondar resultado com CEILING (para cima)
 * - Incluir valores zero no cálculo
 * - Retorna null se array estiver vazio
 */

/**
 * Calcula o percentil usando método PERCENTILE.INC com interpolação linear.
 *
 * Fórmula:
 *   rank = 1 + (p × (n - 1))
 *   parte_inteira = FLOOR(rank)
 *   fração = rank - parte_inteira
 *   resultado = valor[parte_inteira] + fração × (valor[parte_inteira + 1] - valor[parte_inteira])
 *   FINAL = CEILING(resultado)
 *
 * @param values - Array de valores numéricos (não precisa estar ordenado)
 * @param p - Percentil desejado (0 a 1). Ex: 0.85 para P85
 * @returns Valor do percentil arredondado com CEILING, ou null se array vazio
 */
export function calculatePercentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  if (values.length === 1) return Math.ceil(values[0]);

  // Ordenar crescente
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;

  // Calcular rank (1-based)
  const rank = 1 + p * (n - 1);

  // Separar parte inteira e fração
  const intPart = Math.floor(rank);
  const fraction = rank - intPart;

  // Índice 0-based
  const lowerIndex = intPart - 1;
  const upperIndex = intPart; // intPart - 1 + 1

  const lowerValue = sorted[lowerIndex];

  // Se o rank é exato (sem fração) ou estamos no último elemento
  if (fraction === 0 || upperIndex >= n) {
    return Math.ceil(lowerValue);
  }

  const upperValue = sorted[upperIndex];

  // Interpolação linear
  const rawResult = lowerValue + fraction * (upperValue - lowerValue);

  // CEILING — sempre arredondar para cima
  return Math.ceil(rawResult);
}

/**
 * Calcula P50 (mediana)
 */
export function calculateP50(values: number[]): number | null {
  return calculatePercentile(values, 0.5);
}

/**
 * Calcula P85
 */
export function calculateP85(values: number[]): number | null {
  return calculatePercentile(values, 0.85);
}

/**
 * Calcula P95
 */
export function calculateP95(values: number[]): number | null {
  return calculatePercentile(values, 0.95);
}
