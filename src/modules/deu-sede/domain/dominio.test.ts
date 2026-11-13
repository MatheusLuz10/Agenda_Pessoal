import { describe, expect, it } from "vitest";
import type { PedidoDetalhe } from "@/modules/deu-sede/data/tipos";
import {
  cnpjValido,
  contemBusca,
  dataBR,
  descreverEmbalagem,
  formatarCnpj,
  formatarTelefone,
  lerDecimal,
  moeda,
  moedaUnitaria,
  normalizarWhatsapp,
  somarDias,
} from "./formatos";
import { linkWhatsapp, mensagemPedido, numeroWhatsapp } from "./whatsapp";

describe("formatos", () => {
  it("lê números digitados em pt-BR", () => {
    expect(lerDecimal("39,90")).toBe(39.9);
    expect(lerDecimal("1.234,56")).toBe(1234.56);
    expect(lerDecimal("39.90")).toBe(39.9);
    expect(lerDecimal("R$ 5")).toBe(5);
    expect(lerDecimal("")).toBeNull();
    expect(lerDecimal("abc")).toBeNaN();
  });

  it("formata dinheiro e preço por unidade", () => {
    expect(moeda(1278).replace(/\s/g, " ")).toBe("R$ 1.278,00");
    expect(moedaUnitaria(3.325).replace(/\s/g, " ")).toBe("R$ 3,325");
    expect(moeda(null)).toBe("—");
  });

  it("valida CNPJ pelos dígitos verificadores", () => {
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11222333000182")).toBe(false);
    expect(cnpjValido("11111111111111")).toBe(false);
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("normaliza WhatsApp e telefone", () => {
    expect(normalizarWhatsapp("(11) 99999-0000")).toBe("11999990000");
    expect(normalizarWhatsapp("123")).toBe("");
    expect(normalizarWhatsapp("")).toBeNull();
    expect(formatarTelefone("5511999990000")).toBe("(11) 99999-0000");
  });

  it("datas sem erro de fuso", () => {
    expect(dataBR("2026-11-07")).toBe("07/11/2026");
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("descrição de embalagem e busca sem acento", () => {
    expect(descreverEmbalagem("fardo", 15)).toBe("Fardo c/ 15");
    expect(contemBusca("agua", "Água Mineral")).toBe(true);
  });
});

describe("WhatsApp", () => {
  it("monta o número internacional", () => {
    expect(numeroWhatsapp("11999990000")).toBe("5511999990000");
    expect(numeroWhatsapp("5511999990000")).toBe("5511999990000");
    expect(numeroWhatsapp("123")).toBeNull();
  });

  it("mensagem traz número, itens, frete e total", () => {
    const pedido = {
      numero_formatado: "PED-00012",
      data_pedido: "2026-11-07",
      fornecedor_nome: "Fornecedor C",
      itens: [
        {
          produto_nome: "Brahma 269",
          quantidade_embalagens: 16,
          tipo_embalagem: "fardo",
          unidades_por_embalagem: 15,
          preco_embalagem: 48,
          desconto_valor: 0,
          subtotal: 768,
        },
      ],
      valor_bruto: 768,
      total_descontos: 0,
      frete: 50,
      valor_total: 818,
      condicao_pagamento: "Boleto 28 dias",
      previsao_entrega: null,
      observacoes: null,
      empresa: { nome: "DEU SEDE!" },
      fornecedor: null,
    } as unknown as PedidoDetalhe;
    const msg = mensagemPedido(pedido);
    expect(msg).toContain("PED-00012");
    expect(msg).toContain("16 × Fardo c/ 15");
    expect(msg.replace(/\s/g, " ")).toContain("*Total: R$ 818,00*");
    expect(msg).toContain("Boleto 28 dias");
    expect(linkWhatsapp("5511999990000", "Olá & tchau")).toBe("https://wa.me/5511999990000?text=Ol%C3%A1%20%26%20tchau");
  });
});
