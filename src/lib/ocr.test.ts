import { describe, expect, it } from "vitest";
import { parsePunchText } from "@/lib/ocr";

describe("parsePunchText", () => {
  it("entrada sempre fixa em 08:00, e os 3 últimos horários viram início/fim do almoço e saída (print real do usuário)", () => {
    // Texto aproximado do que o Tesseract extrai da tela "Meus Registros":
    // relógio da barra de status (18:26) + 3 registros de ponto.
    const text = `
      18:26
      Meus Registros
      Data Inicial 07/07/2026 Data Final 14/07/2026
      Pesquisar
      Confirmado Pendente Aprovação
      13:19
      14:50
      OBS: saída do almoço
      18:01
    `;

    const result = parsePunchText(text);

    expect(result.times).toEqual(["13:19", "14:50", "18:01"]);
    expect(result.clockIn).toBe("08:00");
    expect(result.lunchStart).toBe("13:19");
    expect(result.lunchEnd).toBe("14:50");
    expect(result.clockOut).toBe("18:01");
  });

  it("segundo print real (07:56, 13:09, 14:41) — mesma regra, sem OBS nenhuma", () => {
    const text = `
      14:42
      Meus Registros
      Data Inicial 03/07/2026 Data Final 10/07/2026
      Pesquisar
      Confirmado Pendente Aprovação
      07:56
      13:09
      14:41
      2.1.56 - 111900
    `;

    const result = parsePunchText(text);

    expect(result.clockIn).toBe("08:00");
    expect(result.lunchStart).toBe("07:56");
    expect(result.lunchEnd).toBe("13:09");
    expect(result.clockOut).toBe("14:41");
  });

  it("mais de 3 registros: usa só os 3 últimos (mais recentes)", () => {
    const text = "09:00 Meus Registros 08:00 12:00 13:00 18:00";
    const result = parsePunchText(text);

    // 09:00 é a barra de status (primeiro match, descartado). Sobram
    // 08:00, 12:00, 13:00, 18:00 — usa só os 3 últimos.
    expect(result.times).toEqual(["08:00", "12:00", "13:00", "18:00"]);
    expect(result.lunchStart).toBe("12:00");
    expect(result.lunchEnd).toBe("13:00");
    expect(result.clockOut).toBe("18:00");
  });

  it("só 2 registros: preenche início e fim do almoço, saída fica pra completar manualmente", () => {
    const text = "09:00 Meus Registros 12:00 18:00";
    const result = parsePunchText(text);

    expect(result.clockIn).toBe("08:00");
    expect(result.lunchStart).toBe("12:00");
    expect(result.lunchEnd).toBe("18:00");
    expect(result.clockOut).toBeUndefined();
  });

  it("sem nenhum horário de registro (só a barra de status), não preenche nada além da entrada padrão", () => {
    const result = parsePunchText("09:00 nenhum outro horário aqui");
    expect(result.times).toEqual([]);
    expect(result.clockIn).toBe("08:00");
    expect(result.lunchStart).toBeUndefined();
  });
});
