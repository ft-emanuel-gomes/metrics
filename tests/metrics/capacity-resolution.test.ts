import { describe, it, expect } from "vitest";
import { decideSprintCapacity, type CapacityDecisionInput, type SprintCapacityConfig } from "../../src/metrics/capacity-resolution";

const base: CapacityDecisionInput = {
  sprintId: 200,
  editable: true,
  autoBusinessDays: 10,
  own: null,
  previous: null,
  legacy: null,
  activeMemberIds: [],
  defaultHoursPerDay: 6,
  squadTeamSize: 6,
};
const cfg = (members: [string, number, number?, boolean?][], extra: Partial<SprintCapacityConfig> = {}): SprintCapacityConfig => ({
  version: 2,
  source: "ajustada",
  members: members.map(([accountId, allocationPct, hoursPerDay = 6, hoursOverride = false]) => ({ accountId, allocationPct, hoursPerDay, hoursOverride })),
  ...extra,
});

describe("decideSprintCapacity", () => {
  it("sem nada configurado: igual a hoje (teamSize × 6h × dias)", () => {
    const d = decideSprintCapacity(base);
    expect(d.source).toBe("time-padrao");
    expect(d.capacityHours).toBe(360);
    expect(d.materialize).toBeUndefined();
  });

  it("concluída sem configuração por integrante: legado salvo da época, sempre com 6h", () => {
    const d = decideSprintCapacity({ ...base, editable: false, legacy: { teamSize: 5, businessDays: 9 }, defaultHoursPerDay: 7 });
    expect(d.source).toBe("legado");
    expect(d.capacityHours).toBe(5 * 6 * 9);
    expect(d.businessDaysManual).toBe(true);
  });

  it("concluída nunca herda nem materializa, mesmo com integrantes e sprint anterior", () => {
    const d = decideSprintCapacity({ ...base, editable: false, activeMemberIds: ["a"], previous: { sprintId: 100, config: cfg([["a", 50]]) } });
    expect(d.source).toBe("time-padrao");
    expect(d.materialize).toBeUndefined();
  });

  it("configuração salva vale sempre, inclusive em sprint concluída (histórico congelado)", () => {
    const own = cfg([["a", 100], ["b", 50]], { source: "herdada", inheritedFromSprintId: 100 });
    const d = decideSprintCapacity({ ...base, editable: false, own, defaultHoursPerDay: 8, activeMemberIds: ["z"] });
    expect(d.source).toBe("herdada");
    expect(d.capacityHours).toBe((6 + 3) * 10); // horas gravadas, não o padrão atual de 8h
  });

  it("editável herda da sprint anterior, sem ação manual, e materializa", () => {
    const d = decideSprintCapacity({ ...base, activeMemberIds: ["a", "b", "novo"], previous: { sprintId: 100, config: cfg([["a", 50], ["b", 100], ["saiu", 100]]) } });
    expect(d.source).toBe("herdada");
    expect(d.inheritedFromSprintId).toBe(100);
    expect(d.members.map((m) => [m.accountId, m.allocationPct])).toEqual([["a", 50], ["b", 100], ["novo", 100]]);
    expect(d.capacityHours).toBe((3 + 6 + 6) * 10);
    expect(d.materialize?.source).toBe("herdada");
  });

  it("editável sem herança, com legado salvo: continua com o legado (sem ação do administrador)", () => {
    const d = decideSprintCapacity({ ...base, activeMemberIds: ["a"], legacy: { teamSize: 4 } });
    expect(d.source).toBe("legado");
    expect(d.capacityHours).toBe(240);
    expect(d.materialize).toBeUndefined();
  });

  it("editável sem herança e sem legado, com integrantes: todos a 100% com as horas padrão", () => {
    const d = decideSprintCapacity({ ...base, activeMemberIds: ["a", "b", "c"], defaultHoursPerDay: 7 });
    expect(d.source).toBe("padrao");
    expect(d.capacityHours).toBe(3 * 7 * 10);
    expect(d.materialize?.members).toHaveLength(3);
  });

  it("dias úteis ajustados à mão no legado da sprint continuam valendo na herança", () => {
    const d = decideSprintCapacity({ ...base, activeMemberIds: ["a"], legacy: { teamSize: 6, businessDays: 8 }, previous: { sprintId: 100, config: cfg([["a", 100]]) } });
    expect(d.businessDays).toBe(8);
    expect(d.businessDaysManual).toBe(true);
    expect(d.capacityHours).toBe(48);
  });

  it("sprint sem datas e sem ajuste usa 10 dias", () => {
    const d = decideSprintCapacity({ ...base, autoBusinessDays: undefined });
    expect(d.businessDays).toBe(10);
  });
});
