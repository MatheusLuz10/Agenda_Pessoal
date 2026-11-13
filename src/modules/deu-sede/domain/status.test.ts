import { describe, expect, it } from "vitest";
import {
  PEDIDO_STATUS,
  contaComoCompraRealizada,
  pedidoAceitaRecebimento,
  pedidoEncerrado,
  podeMudarStatusPedido,
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
