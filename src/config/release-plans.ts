/**
 * Calendário oficial de sprints por release (previsão comum a todas as squads).
 *
 * Regra de negócio: o Calendário da Release mostra estas sprints como "Prevista".
 * A cada Update, as sprints REAIS de cada projeto no Jira substituem as previstas
 * na mesma posição (1ª real -> Sprint 1, 2ª real -> Sprint 2, ...), com as datas do Jira.
 *
 * Datas no formato YYYY-MM-DD (fuso America/Sao_Paulo). Chave = nome curto da release (ex.: "R4").
 * Para uma nova release, basta adicionar a entrada aqui.
 */
export interface PlannedSprint {
  name: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}

export const RELEASE_PLANS: Record<string, PlannedSprint[]> = {
  R4: [
    { name: "Sprint 1", start: "2026-11-04", end: "2026-11-17" },
    { name: "Sprint 2", start: "2026-11-17", end: "2026-12-01" },
    { name: "Sprint 3", start: "2026-12-01", end: "2026-12-15" },
    { name: "Sprint 4", start: "2026-12-15", end: "2026-12-29" },
    { name: "Sprint 5", start: "2026-12-29", end: "2027-01-12" },
    { name: "Sprint 6", start: "2027-01-12", end: "2027-01-26" },
  ],
};
