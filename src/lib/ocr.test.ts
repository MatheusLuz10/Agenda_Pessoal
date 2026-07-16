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

  it("só 2 registros: ancora pelo FIM (saída e fim do almoço certos), início do almoço fica pra completar manualmente", () => {
    // Ancorar pelo fim é o que importa: a saída (horário mais crítico pro
    // cálculo de hora extra) tem que continuar certa mesmo quando falta 1.
    const text = "09:00 Meus Registros 12:00 18:00";
    const result = parsePunchText(text);

    expect(result.clockIn).toBe("08:00");
    expect(result.lunchStart).toBeUndefined();
    expect(result.lunchEnd).toBe("12:00");
    expect(result.clockOut).toBe("18:00");
  });

  it("print real (12:02, 13:31, 17:31) com o OCR deixando passar o horário do meio: saída continua correta", () => {
    // Bug real encontrado com o print de ponto de verdade: a compressão da
    // foto fez o Tesseract não reconhecer "12:02", restando só 2 horários.
    // Antes da correção (ancorar pelo início), isso jogava "13:31" pro
    // lugar de início do almoço e perdia a saída (17:31) por completo.
    const text = "13:15 Meus Registros 13:31 17:31";
    const result = parsePunchText(text);

    expect(result.lunchStart).toBeUndefined();
    expect(result.lunchEnd).toBe("13:31");
    expect(result.clockOut).toBe("17:31");
  });

  it("sem nenhum horário de registro (só a barra de status), não preenche nada além da entrada padrão", () => {
    const result = parsePunchText("09:00 nenhum outro horário aqui");
    expect(result.times).toEqual([]);
    expect(result.clockIn).toBe("08:00");
    expect(result.lunchStart).toBeUndefined();
  });
});
