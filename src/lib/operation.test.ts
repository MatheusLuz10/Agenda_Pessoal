import { describe, expect, it } from "vitest";
import { addDays, nextWeekdayISO } from "@/lib/date";
import {
  computeCategory,
  computeCycleWeightedDays,
  computePrizeAmount,
  computeProductionSummary,
  computePunchDay,
  getCurrentCycleRange,
  getDayWeight,
  getPreviousCycleRange,
  type ProductionSummary,
} from "@/lib/operation";
import type { OperationActivity, PunchRecord } from "@/types";

function punch(overrides: Partial<PunchRecord> & { date: string }): PunchRecord {
  return {
    id: "p1",
    createdAt: overrides.date,
    clockIn: "08:00",
    lunchStart: "12:00",
    lunchEnd: "13:30",
    clockOut: "17:30",
    ...overrides,
  };
}

function production(overrides: Partial<ProductionSummary>): ProductionSummary {
  return { ba: 0, bd: 0, total: 0, baPercent: 0, bdPercent: 0, average: 0, ...overrides };
}

describe("getDayWeight", () => {
  it("segunda a sexta tem peso 1,0", () => {
    for (let dow = 1; dow <= 5; dow++) {
      expect(getDayWeight(nextWeekdayISO(dow))).toBe(1);
    }
  });

  it("sábado tem peso 0,85", () => {
    expect(getDayWeight(nextWeekdayISO(6))).toBe(0.85);
  });

  it("domingo tem peso 0,15", () => {
    expect(getDayWeight(nextWeekdayISO(0))).toBe(0.15);
  });
});

describe("computeCycleWeightedDays", () => {
  it("uma semana completa (seg a dom) soma 6,0", () => {
    const monday = nextWeekdayISO(1);
    const sunday = addDays(monday, 6);
    expect(computeCycleWeightedDays(monday, sunday)).toBeCloseTo(6.0, 5);
  });

  it("ciclo de 10 dias (8 dias úteis + sábado + domingo) soma 9,0 — exemplo do enunciado (11/03 a 20/03)", () => {
    const monday = nextWeekdayISO(1);
    const tenDaysLater = addDays(monday, 9);
    expect(computeCycleWeightedDays(monday, tenDaysLater)).toBeCloseTo(9.0, 5);
  });
});

describe("getCurrentCycleRange — 3 ciclos fixos por mês", () => {
  it("dia 1 a 10 -> ciclo 1-10", () => {
    expect(getCurrentCycleRange(new Date(2026, 2, 1))).toEqual({ start: "2026-03-01", end: "2026-03-10" });
    expect(getCurrentCycleRange(new Date(2026, 2, 10))).toEqual({ start: "2026-03-01", end: "2026-03-10" });
  });

  it("dia 11 a 20 -> ciclo 11-20", () => {
    expect(getCurrentCycleRange(new Date(2026, 2, 11))).toEqual({ start: "2026-03-11", end: "2026-03-20" });
    expect(getCurrentCycleRange(new Date(2026, 2, 20))).toEqual({ start: "2026-03-11", end: "2026-03-20" });
  });

  it("dia 21 até o fim do mês -> ciclo 21-fim (respeitando fevereiro e mês de 31 dias)", () => {
    expect(getCurrentCycleRange(new Date(2026, 2, 21))).toEqual({ start: "2026-03-21", end: "2026-03-31" });
    expect(getCurrentCycleRange(new Date(2026, 2, 31))).toEqual({ start: "2026-03-21", end: "2026-03-31" });
    expect(getCurrentCycleRange(new Date(2026, 1, 21))).toEqual({ start: "2026-02-21", end: "2026-02-28" }); // fev. 2026 não é bissexto
  });
});

describe("getPreviousCycleRange", () => {
  it("11-20 -> anterior é 1-10 do mesmo mês", () => {
    expect(getPreviousCycleRange("2026-03-11")).toEqual({ start: "2026-03-01", end: "2026-03-10" });
  });

  it("21-fim -> anterior é 11-20 do mesmo mês", () => {
    expect(getPreviousCycleRange("2026-03-21")).toEqual({ start: "2026-03-11", end: "2026-03-20" });
  });

  it("1-10 -> anterior é 21-fim do mês anterior", () => {
    expect(getPreviousCycleRange("2026-03-01")).toEqual({ start: "2026-02-21", end: "2026-02-28" });
  });

  it("1-10 de janeiro -> anterior é 21-31 de dezembro do ano anterior (virada de ano)", () => {
    expect(getPreviousCycleRange("2026-01-01")).toEqual({ start: "2025-12-21", end: "2025-12-31" });
  });
});

describe("computePunchDay — jornada padrão (08-12 / 13:30-17:30, sábado 08-12)", () => {
  it("dia de semana batendo o horário exato: sem hora extra", () => {
    const result = computePunchDay(punch({ date: nextWeekdayISO(2) }));
    expect(result.workedMinutes).toBe(8 * 60);
    expect(result.overtime50Minutes).toBe(0);
    expect(result.overtime100Minutes).toBe(0);
  });

  it("chegou 30min mais cedo: 30min de hora extra 50%", () => {
    const result = computePunchDay(punch({ date: nextWeekdayISO(2), clockIn: "07:30" }));
    expect(result.overtime50Minutes).toBe(30);
  });

  it("saiu 30min mais tarde: 30min de hora extra 50%", () => {
    const result = computePunchDay(punch({ date: nextWeekdayISO(2), clockOut: "18:00" }));
    expect(result.overtime50Minutes).toBe(30);
  });

  it("almoço mais curto que o padrão (trabalhou parte do horário de almoço) também vira hora extra", () => {
    // Almoço de 12:00 a 12:30 (em vez de até 13:30) = 1h a mais trabalhada
    // dentro da janela que deveria ser de almoço.
    const result = computePunchDay(punch({ date: nextWeekdayISO(2), lunchEnd: "12:30" }));
    expect(result.overtime50Minutes).toBe(60);
  });

  it("sábado no horário padrão (08-12): sem hora extra", () => {
    const result = computePunchDay(
      punch({ date: nextWeekdayISO(6), lunchStart: "12:00", lunchEnd: "12:00", clockOut: "12:00" })
    );
    expect(result.workedMinutes).toBe(4 * 60);
    expect(result.overtime50Minutes).toBe(0);
  });

  it("sábado além do meio-dia: excedente vira hora extra 50%", () => {
    const result = computePunchDay(
      punch({ date: nextWeekdayISO(6), lunchStart: "12:00", lunchEnd: "12:00", clockOut: "14:00" })
    );
    expect(result.overtime50Minutes).toBe(2 * 60);
  });

  it("domingo: tudo é hora extra 100%, nada em 50%", () => {
    const result = computePunchDay(punch({ date: nextWeekdayISO(0) }));
    expect(result.overtime50Minutes).toBe(0);
    expect(result.overtime100Minutes).toBe(result.workedMinutes);
  });
});

describe("computeProductionSummary", () => {
  function activitiesOf(ba: number, bd: number): OperationActivity[] {
    const list: OperationActivity[] = [];
    if (ba > 0) list.push({ id: "a", type: "BA", date: "2026-01-01", quantity: ba, createdAt: "2026-01-01" });
    if (bd > 0) list.push({ id: "b", type: "BD", date: "2026-01-01", quantity: bd, createdAt: "2026-01-01" });
    return list;
  }

  it("total = BA + BD e percentuais somam 100%", () => {
    const result = computeProductionSummary(activitiesOf(25, 6), 9.1176);
    expect(result.ba).toBe(25);
    expect(result.bd).toBe(6);
    expect(result.total).toBe(31);
    expect(result.baPercent + result.bdPercent).toBeCloseTo(100, 5);
  });

  it("média = total ÷ dias ponderados", () => {
    const result = computeProductionSummary(activitiesOf(20, 10), 10);
    expect(result.average).toBeCloseTo(3, 5);
  });

  it("sem atividades não divide por zero", () => {
    const result = computeProductionSummary([], 9);
    expect(result).toEqual({ ba: 0, bd: 0, total: 0, baPercent: 0, bdPercent: 0, average: 0 });
  });
});

describe("computeCategory — exemplos do enunciado", () => {
  it("INSTALADOR: BA=25 BD=6 (81%, média 3,4)", () => {
    const result = production({ ba: 25, bd: 6, total: 31, baPercent: (25 / 31) * 100, bdPercent: (6 / 31) * 100, average: 3.4 });
    expect(computeCategory(result, 0)).toBe("instalador");
  });

  it("REPARADOR: BD=32 BA=8 (80%, média 4,4, efetividade 85%)", () => {
    const result = production({ ba: 8, bd: 32, total: 40, baPercent: (8 / 40) * 100, bdPercent: (32 / 40) * 100, average: 4.4 });
    expect(computeCategory(result, 85)).toBe("reparador");
  });

  it("MIX: BA=15 BD=17 (média 3,6)", () => {
    const result = production({ ba: 15, bd: 17, total: 32, baPercent: (15 / 32) * 100, bdPercent: (17 / 32) * 100, average: 3.6 });
    expect(computeCategory(result, 0)).toBe("mix");
  });
});

describe("computeCategory — regras e casos de borda", () => {
  it("Instalador nos limites exatos (BA=69%, média=3) já qualifica", () => {
    const result = production({ ba: 69, bd: 31, total: 100, baPercent: 69, bdPercent: 31, average: 3 });
    expect(computeCategory(result, 0)).toBe("instalador");
  });

  it("BA=68,9% (abaixo de 69%) não qualifica Instalador mesmo com média alta", () => {
    const result = production({ ba: 68.9, bd: 31.1, total: 100, baPercent: 68.9, bdPercent: 31.1, average: 5 });
    expect(computeCategory(result, 0)).not.toBe("instalador");
  });

  it("Reparador some (vira sem_categoria) se efetividade não for MAIOR que 80%, mesmo com BD/média ok", () => {
    const result = production({ ba: 8, bd: 32, total: 40, baPercent: 20, bdPercent: 80, average: 4.4 });
    expect(computeCategory(result, 80)).toBe("sem_categoria");
    expect(computeCategory(result, 79)).toBe("sem_categoria");
  });

  it("Reparador exige média >= 4: média 3,9 com BD 80% e efetividade alta não qualifica", () => {
    const result = production({ ba: 8, bd: 32, total: 40, baPercent: 20, bdPercent: 80, average: 3.9 });
    expect(computeCategory(result, 90)).toBe("sem_categoria");
  });

  it("Mix exige média >= 3,5: média 3,4 com BA/BD abaixo dos cortes não qualifica nada", () => {
    const result = production({ ba: 15, bd: 17, total: 32, baPercent: (15 / 32) * 100, bdPercent: (17 / 32) * 100, average: 3.4 });
    expect(computeCategory(result, 0)).toBe("sem_categoria");
  });

  it("Sem nenhuma atividade não há categoria", () => {
    const result = production({});
    expect(computeCategory(result, 0)).toBe("sem_categoria");
  });
});

describe("computePrizeAmount", () => {
  it("R$ 400 para qualquer categoria atingida", () => {
    expect(computePrizeAmount("instalador")).toBe(400);
    expect(computePrizeAmount("reparador")).toBe(400);
    expect(computePrizeAmount("mix")).toBe(400);
  });

  it("R$ 0 quando não há categoria", () => {
    expect(computePrizeAmount("sem_categoria")).toBe(0);
  });
});
