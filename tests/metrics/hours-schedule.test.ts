import { describe, it, expect } from "vitest";
import {
  BASE_EFFECTIVE_FROM,
  brtDate,
  hoursAt,
  minEffectiveFrom,
  normalizeVersions,
  removeVersion,
  scheduleVersion,
  validateEffectiveFrom,
} from "../../src/metrics/hours-schedule";

const base = [{ hoursPerDay: 6, effectiveFrom: BASE_EFFECTIVE_FROM }];

describe("hoursAt", () => {
  const versions = scheduleVersion(base, { hoursPerDay: 8, effectiveFrom: "2026-12-01" });

  it("exemplo: 8h a partir de 01/12 — sprint vigente (17/11) fica com 6h, próxima (01/12) com 8h", () => {
    expect(hoursAt(versions, "2026-11-17T15:11:11.000Z")).toBe(6);
    expect(hoursAt(versions, "2026-12-01T13:00:00.000Z")).toBe(8);
    expect(hoursAt(versions, "2026-11-30")).toBe(6);
  });

  it("usa a data em Brasília (01/12 00:30 BRT já é 01/12)", () => {
    expect(brtDate("2026-12-01T03:30:00.000Z")).toBe("2026-12-01");
    expect(brtDate("2026-12-01T02:30:00.000Z")).toBe("2026-11-30");
  });

  it("sem histórico salvo, vale o valor antigo (ou 6h)", () => {
    expect(hoursAt(normalizeVersions(null), "2026-12-10")).toBe(6);
    expect(hoursAt(normalizeVersions({ hoursPerDayDefault: 7 }), "2020-01-01")).toBe(7);
  });
});

describe("validateEffectiveFrom", () => {
  it("não pode ser anterior ao início da sprint vigente nem no passado", () => {
    // Hoje 26/11, sprint vigente começou em 17/11 → mínimo é hoje (26/11)
    expect(minEffectiveFrom("2026-11-26", ["2026-11-17T15:11:11.000Z"])).toBe("2026-11-26");
    expect(() => validateEffectiveFrom("2026-11-20", "2026-11-26", ["2026-11-17T15:11:11.000Z"])).toThrow(/26\/11\/2026/);
    expect(validateEffectiveFrom("2026-12-01", "2026-11-26", ["2026-11-17T15:11:11.000Z"])).toBe("2026-12-01");
  });

  it("sprint vigente que começa hoje: só a partir de amanhã (não muda a sprint no meio)", () => {
    expect(() => validateEffectiveFrom("2026-11-26", "2026-11-26", ["2026-11-26T12:00:00.000Z"])).toThrow();
    expect(validateEffectiveFrom("2026-11-27", "2026-11-26", ["2026-11-26T12:00:00.000Z"])).toBe("2026-11-27");
  });

  it("formato inválido é recusado", () => {
    expect(() => validateEffectiveFrom("01/12/2026", "2026-11-26", [])).toThrow();
  });
});

describe("scheduleVersion / removeVersion", () => {
  it("nova vigência substitui agendamentos iguais ou posteriores e mantém o histórico anterior", () => {
    let v = scheduleVersion(base, { hoursPerDay: 8, effectiveFrom: "2026-12-15" });
    v = scheduleVersion(v, { hoursPerDay: 7, effectiveFrom: "2026-12-01" });
    expect(v.map((x) => [x.effectiveFrom, x.hoursPerDay])).toEqual([[BASE_EFFECTIVE_FROM, 6], ["2026-12-01", 7]]);
  });

  it("valida as horas (1 a 12, passos de 0,5)", () => {
    expect(() => scheduleVersion(base, { hoursPerDay: 7.3, effectiveFrom: "2026-12-01" })).toThrow();
  });

  it("cancela um agendamento, mas nunca a versão inicial", () => {
    const v = scheduleVersion(base, { hoursPerDay: 8, effectiveFrom: "2026-12-01" });
    expect(removeVersion(v, "2026-12-01")).toEqual(base);
    expect(() => removeVersion(v, BASE_EFFECTIVE_FROM)).toThrow();
  });
});
