import { describe, it, expect } from "vitest";
import { calculateIssueCycleTime, calculateCycleTimeP85 } from "../../src/metrics/cycle-time";
import type { StatusTransition } from "../../src/services/jira-changelog";

describe("calculateIssueCycleTime", () => {
  it("retorna null quando não há transições", () => {
    expect(calculateIssueCycleTime("CT-1", [])).toBeNull();
  });

  it("retorna null quando não há transição para status de início", () => {
    const transitions: StatusTransition[] = [
      { timestamp: "2026-06-01T10:00:00Z", fromStatus: "Backlog", toStatus: "Cancelado" },
    ];
    expect(calculateIssueCycleTime("CT-1", transitions)).toBeNull();
  });

  it("retorna null quando não há transição para Concluído", () => {
    const transitions: StatusTransition[] = [
      { timestamp: "2026-06-01T10:00:00Z", fromStatus: "Backlog", toStatus: "In Progress" },
      { timestamp: "2026-06-05T10:00:00Z", fromStatus: "In Progress", toStatus: "Code Review" },
    ];
    expect(calculateIssueCycleTime("CT-1", transitions)).toBeNull();
  });

  it("calcula CT correto para fluxo simples (To Do → Concluído)", () => {
    const transitions: StatusTransition[] = [
      { timestamp: "2026-06-01T10:00:00Z", fromStatus: "Backlog", toStatus: "To Do" },
      { timestamp: "2026-06-03T10:00:00Z", fromStatus: "To Do", toStatus: "In Progress" },
      { timestamp: "2026-06-10T10:00:00Z", fromStatus: "In Progress", toStatus: "Concluído" },
    ];
    const result = calculateIssueCycleTime("CT-1", transitions);
    expect(result).not.toBeNull();
    expect(result!.days).toBe(9); // 1 Jun → 10 Jun = 9 dias corridos
    expect(result!.key).toBe("CT-1");
  });

  it("usa In Progress como ponto de partida quando não há To Do", () => {
    // Caso real: Backlog → In Progress (sem passar por To Do)
    const transitions: StatusTransition[] = [
      { timestamp: "2026-04-09T09:53:12Z", fromStatus: "Backlog", toStatus: "In Progress" },
      { timestamp: "2026-04-28T09:33:25Z", fromStatus: "In Progress", toStatus: "Code Review" },
      { timestamp: "2026-06-24T08:57:40Z", fromStatus: "Waiting for Delivery", toStatus: "Concluído" },
    ];
    const result = calculateIssueCycleTime("CT-170", transitions);
    expect(result).not.toBeNull();
    expect(result!.days).toBe(75); // 9 Abr → 24 Jun = 75 dias (calendarDaysBetween)
  });

  it("CT = 0 quando concluído no mesmo dia que entrou em To Do", () => {
    const transitions: StatusTransition[] = [
      { timestamp: "2026-06-10T08:00:00Z", fromStatus: "Backlog", toStatus: "To Do" },
      { timestamp: "2026-06-10T16:00:00Z", fromStatus: "To Do", toStatus: "In Progress" },
      { timestamp: "2026-06-10T18:00:00Z", fromStatus: "In Progress", toStatus: "Concluído" },
    ];
    const result = calculateIssueCycleTime("CT-99", transitions);
    expect(result).not.toBeNull();
    expect(result!.days).toBe(0);
  });

  it("usa ÚLTIMA transição para Concluído (caso de retrabalho)", () => {
    const transitions: StatusTransition[] = [
      { timestamp: "2026-06-01T10:00:00Z", fromStatus: "Backlog", toStatus: "To Do" },
      { timestamp: "2026-06-05T10:00:00Z", fromStatus: "To Do", toStatus: "In Progress" },
      { timestamp: "2026-06-08T10:00:00Z", fromStatus: "In Progress", toStatus: "Concluído" },
      // Reaberto
      { timestamp: "2026-06-09T10:00:00Z", fromStatus: "Concluído", toStatus: "In Progress" },
      // Concluído novamente
      { timestamp: "2026-06-15T10:00:00Z", fromStatus: "In Progress", toStatus: "Concluído" },
    ];
    const result = calculateIssueCycleTime("CT-50", transitions);
    expect(result).not.toBeNull();
    expect(result!.days).toBe(14); // 1 Jun → 15 Jun = 14 dias (usa última conclusão)
  });

  it("usa PRIMEIRA transição para To Do (ponto de partida)", () => {
    const transitions: StatusTransition[] = [
      { timestamp: "2026-06-01T10:00:00Z", fromStatus: "Backlog", toStatus: "To Do" },
      // Volta pro backlog e depois To Do de novo
      { timestamp: "2026-06-02T10:00:00Z", fromStatus: "To Do", toStatus: "Backlog" },
      { timestamp: "2026-06-05T10:00:00Z", fromStatus: "Backlog", toStatus: "To Do" },
      { timestamp: "2026-06-10T10:00:00Z", fromStatus: "To Do", toStatus: "Concluído" },
    ];
    const result = calculateIssueCycleTime("CT-60", transitions);
    expect(result).not.toBeNull();
    expect(result!.days).toBe(9); // 1 Jun → 10 Jun (usa PRIMEIRA entrada em To Do)
  });
});

describe("calculateCycleTimeP85", () => {
  it("retorna null para lista vazia", () => {
    const result = calculateCycleTimeP85([]);
    expect(result.p85).toBeNull();
    expect(result.issueCount).toBe(0);
  });

  it("calcula P85 com múltiplas issues", () => {
    const issues = [
      {
        key: "CT-1",
        transitions: [
          { timestamp: "2026-06-01T10:00:00Z", fromStatus: "Backlog", toStatus: "To Do" },
          { timestamp: "2026-06-06T10:00:00Z", fromStatus: "To Do", toStatus: "Concluído" },
        ] as StatusTransition[],
      },
      {
        key: "CT-2",
        transitions: [
          { timestamp: "2026-06-01T10:00:00Z", fromStatus: "Backlog", toStatus: "To Do" },
          { timestamp: "2026-06-11T10:00:00Z", fromStatus: "To Do", toStatus: "Concluído" },
        ] as StatusTransition[],
      },
      {
        key: "CT-3",
        transitions: [
          { timestamp: "2026-06-01T10:00:00Z", fromStatus: "Backlog", toStatus: "To Do" },
          { timestamp: "2026-06-04T10:00:00Z", fromStatus: "To Do", toStatus: "Concluído" },
        ] as StatusTransition[],
      },
    ];

    const result = calculateCycleTimeP85(issues);
    expect(result.issueCount).toBe(3);
    expect(result.p85).not.toBeNull();
    // CTs: [3, 5, 10] (ordenado)
    // rank = 1 + 0.85*2 = 2.7 → intPart=2, fração=0.7
    // valor[2]=5, valor[3]=10 → 5 + 0.7*5 = 8.5 → CEILING = 9
    expect(result.p85).toBe(9);
  });

  it("exclui issues sem transições válidas", () => {
    const issues = [
      {
        key: "CT-1",
        transitions: [
          { timestamp: "2026-06-01T10:00:00Z", fromStatus: "Backlog", toStatus: "To Do" },
          { timestamp: "2026-06-06T10:00:00Z", fromStatus: "To Do", toStatus: "Concluído" },
        ] as StatusTransition[],
      },
      {
        key: "CT-INVALID",
        transitions: [] as StatusTransition[], // Sem transições
      },
    ];

    const result = calculateCycleTimeP85(issues);
    expect(result.issueCount).toBe(1);
    expect(result.p85).toBe(5); // Apenas 1 issue com CT=5
  });
});
