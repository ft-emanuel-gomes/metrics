import { describe, it, expect } from "vitest";
import {
  computeCapacity,
  computeLegacyCapacity,
  inheritSprintCapacity,
  validateAllocationPct,
  validateHoursPerDay,
  type SprintMemberCapacity,
} from "../../src/metrics/capacity";

const m = (accountId: string, allocationPct: number, hoursPerDay = 6, hoursOverride = false): SprintMemberCapacity => ({
  accountId,
  allocationPct,
  hoursPerDay,
  hoursOverride,
});

describe("computeCapacity", () => {
  it("exemplo do requisito: 5 a 100% e 1 a 50%, 6h, 10 dias = 330h", () => {
    const team = [m("a", 100), m("b", 100), m("c", 100), m("d", 100), m("e", 100), m("f", 50)];
    const r = computeCapacity(team, 10);
    expect(r.capacityHours).toBe(330);
    expect(r.fte).toBe(5.5);
    expect(r.headcount).toBe(6);
    expect(r.hoursPerDayTotal).toBe(33);
  });

  it("0% é ausência: não soma e não conta como pessoa", () => {
    const r = computeCapacity([m("a", 100), m("b", 0)], 10);
    expect(r.capacityHours).toBe(60);
    expect(r.headcount).toBe(1);
  });

  it("horas diferentes por integrante", () => {
    // 7h × 100% + 6h × 50% = 10h/dia × 10 dias = 100h
    const r = computeCapacity([m("a", 100, 7, true), m("b", 50, 6)], 10);
    expect(r.capacityHours).toBe(100);
  });

  it("igual à conta antiga quando todos estão a 100% e 6h", () => {
    const team = Array.from({ length: 6 }, (_, i) => m(String(i), 100));
    expect(computeCapacity(team, 10).capacityHours).toBe(computeLegacyCapacity(6, 6, 10).capacityHours);
  });
});

describe("inheritSprintCapacity", () => {
  const previous = [m("a", 50), m("b", 100, 7, true), m("c", 80)];

  it("mantém o % de quem continua e o override de horas", () => {
    const r = inheritSprintCapacity(previous, ["a", "b"], 6);
    expect(r).toEqual([m("a", 50, 6, false), m("b", 100, 7, true)]);
  });

  it("sem override, as horas seguem o padrão atual", () => {
    const r = inheritSprintCapacity([m("a", 50, 6)], ["a"], 8);
    expect(r[0].hoursPerDay).toBe(8);
  });

  it("integrante novo entra a 100% com as horas padrão e desvinculado sai", () => {
    const r = inheritSprintCapacity(previous, ["a", "z"], 6);
    expect(r.map((x) => x.accountId)).toEqual(["a", "z"]);
    expect(r[1]).toEqual(m("z", 100, 6, false));
  });

  it("sem sprint anterior: todos a 100% com as horas padrão", () => {
    const r = inheritSprintCapacity(null, ["a", "b"], 6);
    expect(r.every((x) => x.allocationPct === 100 && x.hoursPerDay === 6)).toBe(true);
  });

  it("herda a capacidade configurada, nunca a alocação (60h de capacidade, 30h alocadas → 60h)", () => {
    // A função só recebe configuração: o engenheiro a 100% × 6h × 10 dias = 60h continua 60h na próxima sprint
    const next = inheritSprintCapacity([m("eng", 100)], ["eng"], 6);
    expect(computeCapacity(next, 10).capacityHours).toBe(60);
  });
});

describe("validações", () => {
  it("% de atuação: 0 a 100 em passos de 5", () => {
    expect(validateAllocationPct(55)).toBe(55);
    expect(() => validateAllocationPct(52)).toThrow();
    expect(() => validateAllocationPct(105)).toThrow();
    expect(() => validateAllocationPct(-5)).toThrow();
  });

  it("horas por dia: 1 a 12 em passos de 0,5", () => {
    expect(validateHoursPerDay(6.5)).toBe(6.5);
    expect(() => validateHoursPerDay(6.3)).toThrow();
    expect(() => validateHoursPerDay(0.5)).toThrow();
    expect(() => validateHoursPerDay(13)).toThrow();
  });
});
