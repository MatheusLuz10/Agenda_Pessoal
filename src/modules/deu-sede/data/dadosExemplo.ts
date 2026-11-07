import type { FuncaoRPC } from "@/modules/deu-sede/data/cliente";
import { CATALOGO } from "@/modules/deu-sede/data/catalogo";
import type { Cadastros, CotacaoDetalhe, Fornecedor, PedidoDetalhe, PedidoResumo, Produto } from "@/modules/deu-sede/data/tipos";
import { hojeISO, somarDias } from "@/modules/deu-sede/domain/formatos";

// DADOS DE EXEMPLO do modo de teste local. Fornecedores, cotações, preços,
// pedidos e vendas são FICTÍCIOS e marcados como "EXEMPLO"; os nomes dos
// produtos vêm do catálogo de referência. Tudo é gravado pelas mesmas
// funções que o app usa, então passa pelas mesmas regras.
type Rpc = <T>(fn: FuncaoRPC, payload?: object) => Promise<T>;

const CHAVE = "deusede:exemplo";

/** "carregado" | "vazio" (usuário apagou) | "existente" | null (nunca decidido) */
export function situacaoExemplo(): string | null {
  try {
    return localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

export function marcarExemplo(valor: string | null) {
  try {
    if (valor === null) localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, valor);
  } catch {
    /* sem armazenamento */
  }
}

export async function carregarDadosExemplo(rpc: Rpc) {
  await rpc("importar_produtos", { produtos: CATALOGO });
  const hoje = hojeISO();

  const fornecedor = (nome: string, extra: object) =>
    rpc<Fornecedor>("salvar_fornecedor", { nome, observacoes: "Fornecedor de EXEMPLO (dados fictícios).", ...extra });
  const fA = await fornecedor("EXEMPLO — Ambev CDD", {
    vendedor: "Representante (exemplo)",
    whatsapp: "11900000001",
    condicoes_comerciais: "Exemplo: boleto 21 dias, pedido mínimo de 30 caixas.",
  });
  const fB = await fornecedor("EXEMPLO — Atacado Bebidas Norte", { vendedor: "Vendedor (exemplo)", whatsapp: "11900000002" });
  const fC = await fornecedor("EXEMPLO — Distribuidora Sul", { telefone: "1130000003" });

  const cad = await rpc<Cadastros>("cadastros");
  const prod = (nome: string): Produto => {
    const p = cad.produtos.find((x) => x.nome === nome);
    if (!p) throw new Error(`Produto do catálogo não encontrado: ${nome}`);
    return p;
  };
  const BRAHMA = prod("Cerveja Brahma Chopp Lata 350 ml");
  const SKOL = prod("Cerveja Skol Pilsen Lata 350 ml");
  const ANTARCTICA = prod("Cerveja Antarctica Pilsen Lata 350 ml");
  const BRAHMA600 = prod("Cerveja Brahma Chopp Garrafa 600 ml");
  const BUD_LN = prod("Cerveja Budweiser Long Neck 330 ml");
  const SPATEN = prod("Cerveja Spaten Lata 350 ml");
  const AMA = prod("Água Mineral AMA sem gás 500 ml");
  const REDBULL = prod("Energético Red Bull 250 ml");
  const MONSTER = prod("Energético Monster Energy 473 ml");
  const BRAHMA269 = prod("Cerveja Brahma Chopp Lata 269 ml");
  const SKOL269 = prod("Cerveja Skol Pilsen Lata 269 ml");
  const BUD350 = prod("Cerveja Budweiser Lata 350 ml");
  const C51 = prod("Cachaça 51");
  const SMIRNOFF = prod("Vodka Smirnoff");
  const REDLABEL = prod("Whisky Johnnie Walker Red Label");

  const item = (p: Produto, quantidade: number, preco: number) => ({ produto_id: p.id, quantidade_embalagens: quantidade, preco_embalagem: preco });

  // Cotações recebidas (preços de EXEMPLO por embalagem)
  const cotA = await rpc<CotacaoDetalhe>("salvar_cotacao", {
    fornecedor_id: fA.id,
    data_cotacao: somarDias(hoje, -3),
    validade: somarDias(hoje, 7),
    condicao_pagamento: "Boleto 21 dias (exemplo)",
    prazo_entrega: "2 dias úteis",
    observacoes: "Cotação de EXEMPLO",
    status: "recebida",
    itens: [
      item(BRAHMA, 30, 38.9),
      item(SKOL, 30, 37.5),
      item(ANTARCTICA, 20, 37.9),
      item(BRAHMA600, 10, 129.9),
      item(BUD_LN, 5, 119.9),
      item(SPATEN, 10, 45.9),
      item(AMA, 10, 15.9),
    ],
  });
  const cotB = await rpc<CotacaoDetalhe>("salvar_cotacao", {
    fornecedor_id: fB.id,
    data_cotacao: somarDias(hoje, -2),
    validade: somarDias(hoje, 5),
    frete: 25,
    condicao_pagamento: "PIX à vista (exemplo)",
    observacoes: "Cotação de EXEMPLO",
    status: "recebida",
    itens: [item(BRAHMA, 30, 39.5), item(SKOL, 30, 36.9), item(ANTARCTICA, 20, 38.5), item(AMA, 10, 14.9), item(REDBULL, 24, 6.9), item(MONSTER, 12, 8.5)],
  });
  await rpc("salvar_cotacao", {
    fornecedor_id: fC.id,
    data_cotacao: somarDias(hoje, -12),
    validade: somarDias(hoje, -2),
    frete: 40,
    observacoes: "Cotação de EXEMPLO (já vencida)",
    status: "recebida",
    itens: [item(BRAHMA269, 20, 33.9), item(SKOL269, 20, 33.5), item(BUD350, 10, 42.9), item(C51, 12, 13.9), item(SMIRNOFF, 6, 32.9), item(REDLABEL, 3, 89.9)],
  });

  // Montar pedido: itens dos dois fornecedores -> 2 pedidos
  const deA = (p: Produto) => cotA.itens.find((i) => i.produto_id === p.id)!.id;
  const deB = (p: Produto) => cotB.itens.find((i) => i.produto_id === p.id)!.id;
  const lote = await rpc<{ pedidos: PedidoResumo[] }>("gerar_pedidos", {
    lote_id: crypto.randomUUID(),
    itens: [
      { fornecedor_id: fA.id, produto_id: BRAHMA.id, cotacao_item_id: deA(BRAHMA), quantidade_embalagens: 30 },
      { fornecedor_id: fA.id, produto_id: ANTARCTICA.id, cotacao_item_id: deA(ANTARCTICA), quantidade_embalagens: 10 },
      { fornecedor_id: fA.id, produto_id: BUD_LN.id, cotacao_item_id: deA(BUD_LN), quantidade_embalagens: 2 },
      { fornecedor_id: fA.id, produto_id: SPATEN.id, cotacao_item_id: deA(SPATEN), quantidade_embalagens: 5 },
      { fornecedor_id: fB.id, produto_id: SKOL.id, cotacao_item_id: deB(SKOL), quantidade_embalagens: 20 },
      { fornecedor_id: fB.id, produto_id: AMA.id, cotacao_item_id: deB(AMA), quantidade_embalagens: 10 },
      { fornecedor_id: fB.id, produto_id: REDBULL.id, cotacao_item_id: deB(REDBULL), quantidade_embalagens: 24 },
      { fornecedor_id: fB.id, produto_id: MONSTER.id, cotacao_item_id: deB(MONSTER), quantidade_embalagens: 12 },
    ],
    fornecedores: [
      { fornecedor_id: fA.id, condicao_pagamento: "Boleto 21 dias (exemplo)", previsao_entrega: somarDias(hoje, 2) },
      { fornecedor_id: fB.id, frete: 25, condicao_pagamento: "PIX à vista (exemplo)" },
    ],
  });
  const pedA = lote.pedidos.find((p) => p.fornecedor_id === fA.id)!;
  const pedB = lote.pedidos.find((p) => p.fornecedor_id === fB.id)!;
  await rpc("mudar_status_pedido", { id: pedA.id, status: "enviado" });
  await rpc("mudar_status_pedido", { id: pedB.id, status: "enviado" });
  await rpc("mudar_status_pedido", { id: pedB.id, status: "confirmado" });
  // Pedido B chegou inteiro (entra no estoque); pedido A segue aguardando entrega.
  const detB = await rpc<PedidoDetalhe>("obter_pedido", { id: pedB.id });
  await rpc("registrar_recebimento", {
    pedido_id: pedB.id,
    nota_fiscal: "EXEMPLO-1001",
    itens: detB.itens.map((i) => ({ pedido_item_id: i.id, quantidade_recebida: Number(i.quantidade_pendente) })),
  });

  // Entrada por nota sem pedido (balcão), com preço atualizado
  await rpc("registrar_entrada_nota", {
    fornecedor_id: fC.id,
    numero_nota: "EXEMPLO-2002",
    atualizar_precos: true,
    itens: [item(C51, 12, 13.9), item(SMIRNOFF, 6, 32.9), item(REDLABEL, 3, 89.9), item(BRAHMA, 10, 39.9)].map((i) => ({ ...i })),
  });

  // Preços de venda e estoque mínimo (EXEMPLO)
  const venda = async (p: Produto, unidade: number, embalagem: number | null, minimo: number | null = null) =>
    rpc("salvar_produto", { ...p, preco_venda: unidade, preco_venda_embalagem: embalagem, estoque_minimo: minimo });
  await venda(BRAHMA, 4.99, 55.9, 8);
  await venda(SKOL, 4.79, 52.9, 25);
  await venda(ANTARCTICA, 4.79, 52.9);
  await venda(AMA, 2.5, 27.9, 5);
  await venda(BUD_LN, 6.99, 159.9);
  await venda(REDBULL, 9.99, null, 12);
  await venda(MONSTER, 11.99, null);
  await venda(SPATEN, 5.49, 59.9);
  await venda(C51, 19.9, null);
  await venda(SMIRNOFF, 44.9, null);
  await venda(REDLABEL, 119.9, null, 2);

  // Vendas do dia no PDV (EXEMPLO)
  const v = (forma: string, itens: object[], extra: object = {}) => rpc("registrar_venda", { forma_pagamento: forma, itens, ...extra });
  const un = (p: Produto, quantidade: number) => ({ produto_id: p.id, unidade_venda: "unidade", quantidade });
  const emb = (p: Produto, quantidade: number) => ({ produto_id: p.id, unidade_venda: "embalagem", quantidade });
  await v("pix", [un(SKOL, 12), un(AMA, 6)]);
  await v("dinheiro", [emb(BRAHMA, 1), un(C51, 1)], { valor_recebido: 100 });
  await v("debito", [emb(SKOL, 1), un(SMIRNOFF, 1)]);
  await v("credito", [un(REDBULL, 6), un(REDLABEL, 1)]);
  await v("pix", [un(SKOL, 24)], { desconto: 4.96 });
  await v("dinheiro", [un(REDBULL, 4), un(MONSTER, 2)]);
}
