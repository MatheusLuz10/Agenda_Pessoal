import { describe, expect, it } from "vitest";
import { dividirParcelas, erroEscolha, escolhaInicial, payloadEscolha, situacaoVencimento } from "@/modules/deu-sede/domain/financeiro";

describe("dividirParcelas", () => {
  it("divide igual e põe os centavos na última (como o banco)", () => {
    expect(dividirParcelas(100, 3)).toEqual([33.33, 33.33, 33.34]);
    expect(dividirParcelas(60, 2)).toEqual([30, 30]);
    expect(dividirParcelas(10, 1)).toEqual([10]);
  });
  it("valor ou parcelas inválidos: nada", () => {
    expect(dividirParcelas(0, 3)).toEqual([]);
    expect(dividirParcelas(10, 0)).toEqual([]);
  });
});

describe("escolha de pagamento", () => {
  it("começa à vista com 1º vencimento em 30 dias", () => {
    expect(escolhaInicial(new Date(2026, 10, 8))).toEqual({ forma: "a_vista", parcelas: "2", primeiro: "2026-12-08" });
  });
  it("valida o parcelado", () => {
    const e = { forma: "parcelado" as const, parcelas: "3", primeiro: "2026-12-08" };
    expect(erroEscolha(e, 100)).toBeNull();
    expect(erroEscolha({ ...e, parcelas: "0" }, 100)).toMatch(/1 a 48/);
    expect(erroEscolha({ ...e, parcelas: "2,5" }, 100)).toMatch(/1 a 48/);
    expect(erroEscolha({ ...e, primeiro: "" }, 100)).toMatch(/vencimento/);
    expect(erroEscolha({ ...e, parcelas: "10" }, 0.05)).toMatch(/pequeno/);
    expect(erroEscolha({ forma: "a_vista", parcelas: "x", primeiro: "" }, 100)).toBeNull();
  });
  it("monta os campos para o banco", () => {
    expect(payloadEscolha({ forma: "a_vista", parcelas: "3", primeiro: "2026-12-08" })).toEqual({ forma: "a_vista" });
    expect(payloadEscolha({ forma: "parcelado", parcelas: "3", primeiro: "2026-12-08" })).toEqual({
      forma: "parcelado",
      parcelas: 3,
      primeiro_vencimento: "2026-12-08",
    });
  });
});

describe("situacaoVencimento", () => {
  const hoje = "2026-11-08";
  it("vencida, hoje, em poucos dias e depois", () => {
    expect(situacaoVencimento("2026-11-05", hoje)).toEqual({ texto: "Vencida há 3 dias", tom: "perigo" });
    expect(situacaoVencimento("2026-11-07", hoje)).toEqual({ texto: "Vencida há 1 dia", tom: "perigo" });
    expect(situacaoVencimento("2026-11-08", hoje)).toEqual({ texto: "Vence hoje", tom: "atencao" });
    expect(situacaoVencimento("2026-11-09", hoje)).toEqual({ texto: "Vence em 1 dia", tom: "atencao" });
    expect(situacaoVencimento("2026-12-31", hoje)).toEqual({ texto: "Vence 31/12/2026", tom: "normal" });
  });
});
