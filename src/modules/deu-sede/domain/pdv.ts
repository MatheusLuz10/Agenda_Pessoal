import type { FormaPagamento, ProdutoPdv } from "@/modules/deu-sede/data/tipos";
import { arredondar } from "@/modules/deu-sede/domain/formatos";

// Carrinho do PDV (cálculo na tela; o banco recalcula e confere tudo ao
// finalizar a venda).

export const FORMAS_PAGAMENTO: { valor: FormaPagamento; rotulo: string }[] = [
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "pix", rotulo: "PIX" },
  { valor: "debito", rotulo: "Débito" },
  { valor: "credito", rotulo: "Crédito" },
  { valor: "outro", rotulo: "Outro" },
];

export interface ItemCarrinho {
  chave: string;
  produto: ProdutoPdv;
  unidade_venda: "unidade" | "embalagem";
  quantidade: number;
  /** preço digitado no caixa (null = preço cadastrado) */
  preco_manual: number | null;
}

/** Preço de tabela do item (unidade ou embalagem fechada). */
export function precoTabela(p: ProdutoPdv, unidade: "unidade" | "embalagem"): number | null {
  if (unidade === "embalagem") {
    if (p.preco_venda_embalagem !== null) return Number(p.preco_venda_embalagem);
    return p.preco_venda === null ? null : arredondar(Number(p.preco_venda) * p.unidades_por_embalagem);
  }
  return p.preco_venda === null ? null : Number(p.preco_venda);
}

export function precoItem(i: ItemCarrinho): number | null {
  return i.preco_manual ?? precoTabela(i.produto, i.unidade_venda);
}

export function unidadesDoItem(i: ItemCarrinho): number {
  return i.quantidade * (i.unidade_venda === "embalagem" ? i.produto.unidades_por_embalagem : 1);
}

export function subtotalItem(i: ItemCarrinho): number {
  const p = precoItem(i);
  return p === null ? 0 : arredondar(i.quantidade * p);
}

export interface TotaisCarrinho {
  subtotal: number;
  desconto: number;
  total: number;
  troco: number | null;
  semPreco: ItemCarrinho[];
  /** produtos em que o carrinho pede mais que o saldo */
  semSaldo: { produto: ProdutoPdv; pedido: number }[];
}

export function totaisCarrinho(itens: ItemCarrinho[], desconto: number, forma: FormaPagamento, recebido: number | null): TotaisCarrinho {
  const subtotal = arredondar(itens.reduce((s, i) => s + subtotalItem(i), 0));
  const d = Math.min(Math.max(desconto || 0, 0), subtotal);
  const total = arredondar(subtotal - d);
  const porProduto = new Map<string, { produto: ProdutoPdv; pedido: number }>();
  for (const i of itens) {
    const x = porProduto.get(i.produto.produto_id) ?? { produto: i.produto, pedido: 0 };
    x.pedido += unidadesDoItem(i);
    porProduto.set(i.produto.produto_id, x);
  }
  return {
    subtotal,
    desconto: d,
    total,
    troco: forma === "dinheiro" && recebido !== null && recebido >= total ? arredondar(recebido - total) : null,
    semPreco: itens.filter((i) => precoItem(i) === null),
    semSaldo: [...porProduto.values()].filter((x) => x.pedido > Number(x.produto.saldo_unidades) + 1e-9),
  };
}
