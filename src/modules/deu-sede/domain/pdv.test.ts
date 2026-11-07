import { describe, expect, it } from "vitest";
import type { ProdutoPdv } from "@/modules/deu-sede/data/tipos";
import { precoTabela, subtotalItem, totaisCarrinho, type ItemCarrinho } from "./pdv";

const brahma: ProdutoPdv = {
  produto_id: "b",
  nome: "Brahma Lata 350",
  codigo: null,
  marca: "Brahma",
  categoria_id: "c",
  categoria_nome: "Cervejas",
  tipo_embalagem: "pack",
  unidades_por_embalagem: 12,
  preco_venda: 4.99,
  preco_venda_embalagem: 55.9,
  saldo_unidades: 30,
};
const item = (o: Partial<ItemCarrinho>): ItemCarrinho => ({ chave: "1", produto: brahma, unidade_venda: "unidade", quantidade: 1, preco_manual: null, ...o });

describe("PDV", () => {
  it("preço por unidade ou pela embalagem fechada", () => {
    expect(precoTabela(brahma, "unidade")).toBe(4.99);
    expect(precoTabela(brahma, "embalagem")).toBe(55.9);
    expect(precoTabela({ ...brahma, preco_venda_embalagem: null }, "embalagem")).toBe(59.88);
    expect(precoTabela({ ...brahma, preco_venda: null }, "unidade")).toBeNull();
  });

  it("total, desconto e troco", () => {
    const t = totaisCarrinho([item({ quantidade: 6 }), item({ unidade_venda: "embalagem" })], 1.84, "dinheiro", 100);
    expect(t.subtotal).toBe(85.84);
    expect(t.total).toBe(84);
    expect(t.troco).toBe(16);
  });

  it("aponta falta de saldo somando unidade e embalagem do mesmo produto", () => {
    const t = totaisCarrinho([item({ quantidade: 20 }), item({ unidade_venda: "embalagem" })], 0, "pix", null);
    expect(t.semSaldo).toHaveLength(1);
    expect(t.semSaldo[0].pedido).toBe(32);
    expect(t.troco).toBeNull();
  });

  it("preço digitado no caixa vale sobre o cadastrado; sem preço é apontado", () => {
    expect(subtotalItem(item({ quantidade: 2, preco_manual: 4 }))).toBe(8);
    const t = totaisCarrinho([item({ produto: { ...brahma, preco_venda: null } })], 0, "pix", null);
    expect(t.semPreco).toHaveLength(1);
  });
});
