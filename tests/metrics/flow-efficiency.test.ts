import { describe, it, expect } from "vitest";
import {
  calculateIssueFlowEfficiency,
  calculatePeriodFlowEfficiency,
  detectBottleneck,
} from "../../src/metrics/flow-efficiency";
import type { StatusTransition } from "../../src/services/jira-changelog";

describe("calculateIssueFlowEfficiency", () => {
  it("retorna null com menos de 2 transições", () => {
    expect(calculateIssueFlowEfficiency("CT-1", [])).toBeNull();
    expect(
      calculateIssueFlowEfficiency("CT-1", [
        { timestamp: "2026-06-01T10:00:00Z", fromStatus: "Backlog", toStatus: "In Progress" },
      ])
    ).toBeNull();
  });

  it("calcula 100% quando todo tempo é em estado ativo", () => {
    const transitions: StatusTransition[] = [
      { timestamp: "2026-06-01T10:00:00Z", fromStatus: "Backlog", toStatus: "In Progress" },
      { timestamp: "2026-06-05T10:00:00Z", fromStatus: "In Progress", toStatus: "Concluído" },
    ];
    const result = calculateIssueFlowEfficiency("CT-1", transitions);
    expect(result).not.toBeNull();
    expect(result!.efficiency).toBe(100);
  });

  it("calcula 0% quando todo tempo é em estado de espera", () => {
    const transitions: StatusTransition[] = [
      { timestamp: "2026-06-01T10:00:00Z", fromStatus: "Backlog", toStatus: "To Do" },
      { timestamp: "2026-06-05T10:00:00Z", fromStatus: "To Do", toStatus: "Concluído" },
    ];
    const result = calculateIssueFlowEfficiency("CT-1", transitions);
    expect(result).not.toBeNull();
    expect(result!.efficiency).toBe(0);
  });

  it("calcula eficiência mista corretamente", () => {
    // 2 dias em To Do (espera) + 3 dias em In Progress (ativo) = 60% ativo
    const transitions: StatusTransition[] = [
      { timestamp: "2026-06-01T00:00:00Z", fromStatus: "Backlog", toStatus: "To Do" },
      { timestamp: "2026-06-03T00:00:00Z", fromStatus: "To Do", toStatus: "In Progress" },
      { timestamp: "2026-06-06T00:00:00Z", fromStatus: "In Progress", toStatus: "Concluído" },
    ];
    const result = calculateIssueFlowEfficiency("CT-1", transitions);
    expect(result).not.toBeNull();
    expect(result!.efficiency).toBe(60); // 3/(2+3) = 60%
  });

  it("conta Design Review como estado ativo", () => {
    const transitions: StatusTransition[] = [
      { timestamp: "2026-06-01T00:00:00Z", fromStatus: "Backlog", toStatus: "Design Review" },
      { timestamp: "2026-06-05T00:00:00Z", fromStatus: "Design Review", toStatus: "Concluído" },
    ];
    const result = calculateIssueFlowEfficiency("CT-1", transitions);
    expect(result).not.toBeNull();
    expect(result!.efficiency).toBe(100);
  });

  it("conta Code Review como estado de espera", () => {
    const transitions: StatusTransition[] = [
      { timestamp: "2026-06-01T00:00:00Z", fromStatus: "Backlog", toStatus: "Code Review" },
      { timestamp: "2026-06-05T00:00:00Z", fromStatus: "Code Review", toStatus: "Concluído" },
    ];
    const result = calculateIssueFlowEfficiency("CT-1", transitions);
    expect(result).not.toBeNull();
    expect(result!.efficiency).toBe(0);
  });

  it("conta Test como estado ativo", () => {
    const transitions: StatusTransition[] = [
      { timestamp: "2026-06-01T00:00:00Z", fromStatus: "Code Review", toStatus: "Test" },
      { timestamp: "2026-06-04T00:00:00Z", fromStatus: "Test", toStatus: "Concluído" },
    ];
    const result = calculateIssueFlowEfficiency("CT-1", transitions);
    expect(result).not.toBeNull();
    expect(result!.efficiency).toBe(100);
  });

  it("conta Waiting for Test como estado de espera", () => {
    // 2 dias ativo + 3 dias espera = 40%
    const transitions: StatusTransition[] = [
      { timestamp: "2026-06-01T00:00:00Z", fromStatus: "Backlog", toStatus: "In Progress" },
      { timestamp: "2026-06-03T00:00:00Z", fromStatus: "In Progress", toStatus: "Waiting for Test" },
      { timestamp: "2026-06-06T00:00:00Z", fromStatus: "Waiting for Test", toStatus: "Concluído" },
    ];
    const result = calculateIssueFlowEfficiency("CT-1", transitions);
    expect(result).not.toBeNull();
    expect(result!.efficiency).toBe(40); // 2/(2+3) = 40%
  });

  it("fluxo complexo real: múltiplos estados", () => {
    // In Progress 2d → Code Review 1d → In Progress 1d → Waiting for Test 2d → Test 1d
    // Ativos: 2+1+1 = 4d | Espera: 1+2 = 3d | Total = 7d | Eff = 4/7 = 57%
    const transitions: StatusTransition[] = [
      { timestamp: "2026-06-01T00:00:00Z", fromStatus: "Backlog", toStatus: "In Progress" },
      { timestamp: "2026-06-03T00:00:00Z", fromStatus: "In Progress", toStatus: "Code Review" },
      { timestamp: "2026-06-04T00:00:00Z", fromStatus: "Code Review", toStatus: "In Progress" },
      { timestamp: "2026-06-05T00:00:00Z", fromStatus: "In Progress", toStatus: "Waiting for Test" },
      { timestamp: "2026-06-07T00:00:00Z", fromStatus: "Waiting for Test", toStatus: "Test" },
      { timestamp: "2026-06-08T00:00:00Z", fromStatus: "Test", toStatus: "Concluído" },
    ];
    const result = calculateIssueFlowEfficiency("CT-1", transitions);
    expect(result).not.toBeNull();
    expect(result!.efficiency).toBe(57); // Math.round(4/7*100) = 57
  });
});

describe("calculatePeriodFlowEfficiency", () => {
  it("retorna 0 para lista vazia", () => {
    const result = calculatePeriodFlowEfficiency([]);
    expect(result.efficiency).toBe(0);
  });

  it("calcula média das eficiências individuais", () => {
    const issues = [
      {
        key: "CT-1",
        transitions: [
          { timestamp: "2026-06-01T00:00:00Z", fromStatus: "Backlog", toStatus: "In Progress" },
          { timestamp: "2026-06-05T00:00:00Z", fromStatus: "In Progress", toStatus: "Concluído" },
        ] as StatusTransition[],
      },
      {
        key: "CT-2",
        transitions: [
          { timestamp: "2026-06-01T00:00:00Z", fromStatus: "Backlog", toStatus: "To Do" },
          { timestamp: "2026-06-05T00:00:00Z", fromStatus: "To Do", toStatus: "Concluído" },
        ] as StatusTransition[],
      },
    ];
    const result = calculatePeriodFlowEfficiency(issues);
    // CT-1: 100%, CT-2: 0% → média = 50%
    expect(result.efficiency).toBe(50);
  });
});

describe("detectBottleneck", () => {
  it("retorna undefined quando eficiência >= 50%", () => {
    expect(detectBottleneck([60, 70, 80])).toBeUndefined();
  });

  it("retorna gargalo quando eficiência média < 50%", () => {
    const result = detectBottleneck([30, 40, 45]);
    expect(result).not.toBeUndefined();
    expect(result!.title).toBe("GARGALO IDENTIFICADO");
  });
});
