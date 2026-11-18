const BRT_OFFSET_MS = 3 * 3_600_000; // America/Sao_Paulo (sem horário de verão desde 2019)

/**
 * Dias úteis (seg a sex) de um período, no fuso de Brasília, como datas YYYY-MM-DD.
 * Regra: início e fim exatamente como cadastrados no Jira (datas no fuso de Brasília), os dois dias incluídos.
 * Ex.: sprint de 17/11 a 01/12 conta de 17/11 até 01/12. Independe do fuso do servidor.
 * Usado pela Ocupação e pela Capacidade da Sprint (mesma contagem nas duas).
 */
export function businessDaysListBrt(startIso: string, endIso: string): string[] {
  const toBrDate = (ms: number) => new Date(ms - BRT_OFFSET_MS).toISOString().slice(0, 10);
  const first = toBrDate(new Date(startIso).getTime());
  const last = toBrDate(new Date(endIso).getTime());
  const days: string[] = [];
  for (let d = new Date(`${first}T12:00:00Z`); d.toISOString().slice(0, 10) <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) days.push(d.toISOString().slice(0, 10));
  }
  return days;
}
/**
 * Calcula dias úteis entre duas datas (exclui sábado e domingo)
 */
export function businessDaysBetween(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  current.setHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setHours(0, 0, 0, 0);

  while (current <= endDate) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/**
 * Calcula dias corridos entre duas datas
 */
export function calendarDaysBetween(start: Date, end: Date): number {
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Formata data ISO para display curto (DD/MM)
 */
export function formatShortDate(isoDate: string): string {
  const d = new Date(isoDate);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

/**
 * Formata data ISO para display completo (DD/MM/AAAA)
 */
export function formatFullDate(isoDate: string): string {
  const d = new Date(isoDate);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Hash simples para usar como chave de cache
 */
export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
