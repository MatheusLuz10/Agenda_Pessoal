import { describe, expect, it } from "vitest";
import type { Oferta, PedidoDetalhe } from "@/modules/deu-sede/data/tipos";
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
import { custoOferta, melhorCombinacao, ofertasValidas, tudoDeUmFornecedor } from "./comparacao";
import { linkWhatsapp, mensagemPedido, numeroWhatsapp } from "./whatsapp";

function oferta(o: Partial<Oferta>): Oferta {
  return {
    cotacao_item_id: crypto.randomUUID(),
    produto_id: "brahma",
    produto_nome: "Brahma 269",
    cotacao_id: "c",
    cotacao_numero: "COT-00001",
    fornecedor_id: "A",
    fornecedor_nome: "A",
    fornecedor_ativo: true,
    cotacao_status: "recebida",
    data_cotacao: "2026-11-07",
    validade: null,
    vencida: false,
    tipo_embalagem: "caixa",
    unidades_por_embalagem: 12,
    quantidade_embalagens: 10,
    preco_embalagem: 39.9,
    desconto_valor: 0,
    preco_unitario: 3.325,
    frete: 0,
    desconto_geral: 0,
    condicao_pagamento: null,
    prazo_entrega: null,
    ...o,
  };
}

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

describe("comparação de preços", () => {
  it("normaliza embalagens diferentes pela quantidade em unidades", () => {
    // 240 latas: caixa c/ 12 -> 20 caixas; fardo c/ 15 -> 16 fardos; fardo c/ 18 -> 14 (252 latas)
    expect(custoOferta(oferta({}), 240).embalagens).toBe(20);
    expect(custoOferta(oferta({ unidades_por_embalagem: 15, preco_embalagem: 48 }), 240)).toMatchObject({ embalagens: 16, subtotal: 768 });
    expect(custoOferta(oferta({ unidades_por_embalagem: 18 }), 240)).toMatchObject({ embalagens: 14, unidades: 252 });
  });

  it("aplica o desconto do item proporcionalmente", () => {
    // cotou 10 cx com R$ 10 de desconto -> R$ 1 por caixa
    expect(custoOferta(oferta({ desconto_valor: 10 }), 60)).toMatchObject({ embalagens: 5, descontoItem: 5, subtotal: 194.5 });
  });

  it("melhor combinação considera o frete", () => {
    const desejos = [{ produto_id: "brahma", unidades: 24 }];
    // A: 2 cx × 39,90 = 79,80 + frete 50 = 129,80 | B: 2 cx × 41,50 = 83,00 sem frete
    const alt = melhorCombinacao(desejos, [
      oferta({ fornecedor_id: "A", fornecedor_nome: "A", frete: 50 }),
      oferta({ fornecedor_id: "B", fornecedor_nome: "B", preco_embalagem: 41.5 }),
    ]);
    expect(alt.porFornecedor.map((g) => g.fornecedor_id)).toEqual(["B"]);
    expect(alt.total).toBe(83);
  });

  it("junta itens no mesmo fornecedor quando o frete compensa", () => {
    const desejos = [
      { produto_id: "p1", unidades: 12 },
      { produto_id: "p2", unidades: 12 },
    ];
    const ofertas = [
      oferta({ produto_id: "p1", fornecedor_id: "A", preco_embalagem: 10, frete: 20 }),
      oferta({ produto_id: "p2", fornecedor_id: "A", preco_embalagem: 12, frete: 20 }),
      oferta({ produto_id: "p2", fornecedor_id: "B", preco_embalagem: 11, frete: 20 }),
    ];
    // só A: 10 + 12 + 20 = 42 | A + B: 10 + 11 + 40 = 61
    const alt = melhorCombinacao(desejos, ofertas);
    expect(alt.total).toBe(42);
    expect(alt.porFornecedor).toHaveLength(1);
  });

  it("tudo de um fornecedor aponta o que ele não cotou", () => {
    const desejos = [
      { produto_id: "p1", unidades: 12 },
      { produto_id: "p2", unidades: 12 },
    ];
    const alt = tudoDeUmFornecedor("A", desejos, [oferta({ produto_id: "p1", fornecedor_id: "A" })]);
    expect(alt.semPreco).toEqual(["p2"]);
  });

  it("cotações vencidas ficam de fora, a menos que o usuário peça", () => {
    const lista = [oferta({ vencida: true }), oferta({ fornecedor_id: "B" })];
    expect(ofertasValidas(lista, false)).toHaveLength(1);
    expect(ofertasValidas(lista, true)).toHaveLength(2);
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
