import { describe, expect, it } from "vitest";
import {
  COTACAO_STATUS,
  PEDIDO_STATUS,
  contaComoCompraRealizada,
  cotacaoPermiteEditarItens,
  cotacaoVencida,
  pedidoAceitaRecebimento,
  pedidoEncerrado,
  podeMudarStatusPedido,
  proximosStatusCotacao,
  proximosStatusPedido,
} from "./status";

describe("status de pedidos", () => {
  it("pedidos recebidos ou cancelados não mudam mais", () => {
    for (const para of PEDIDO_STATUS) {
      expect(podeMudarStatusPedido("recebido", para)).toBe(false);
      expect(podeMudarStatusPedido("cancelado", para)).toBe(false);
    }
    expect(pedidoEncerrado("recebido")).toBe(true);
    expect(pedidoEncerrado("cancelado")).toBe(true);
  });

  it("não envia ao fornecedor sem aprovar antes", () => {
    expect(podeMudarStatusPedido("em_elaboracao", "enviado")).toBe(false);
    expect(podeMudarStatusPedido("aprovado", "enviado")).toBe(true);
  });

  it("pedido com recebimento parcial só pode ser concluído (não cancelado)", () => {
    expect(proximosStatusPedido("parcialmente_recebido")).toEqual(["recebido"]);
  });

  it("recebimento só depois de enviado ao fornecedor", () => {
    expect(pedidoAceitaRecebimento("aprovado")).toBe(false);
    expect(pedidoAceitaRecebimento("enviado")).toBe(true);
    expect(pedidoAceitaRecebimento("recebido")).toBe(false);
  });

  it("compra realizada exclui rascunhos, aprovações pendentes e cancelados", () => {
    const realizadas = PEDIDO_STATUS.filter(contaComoCompraRealizada);
    expect(realizadas).toEqual(["enviado", "confirmado", "em_transporte", "parcialmente_recebido", "recebido"]);
  });

  it("toda transição aponta para um status existente", () => {
    for (const s of PEDIDO_STATUS) {
      for (const p of proximosStatusPedido(s)) expect(PEDIDO_STATUS).toContain(p);
    }
  });
});

describe("status de cotações", () => {
  it("itens editáveis só antes de a cotação ser recebida", () => {
    expect(cotacaoPermiteEditarItens("em_elaboracao")).toBe(true);
    expect(cotacaoPermiteEditarItens("aguardando_fornecedor")).toBe(true);
    expect(cotacaoPermiteEditarItens("recebida")).toBe(false);
    expect(cotacaoPermiteEditarItens("aprovada")).toBe(false);
  });

  it("toda transição aponta para um status existente", () => {
    for (const s of COTACAO_STATUS) {
      for (const p of proximosStatusCotacao(s)) expect(COTACAO_STATUS).toContain(p);
    }
  });

  it("vencimento compara pela data de validade", () => {
    expect(cotacaoVencida("2026-11-06", "2026-11-07")).toBe(true);
    expect(cotacaoVencida("2026-11-07", "2026-11-07")).toBe(false);
    expect(cotacaoVencida(null, "2026-11-07")).toBe(false);
  });
});
