import type { FuncaoRPC } from "@/modules/deu-sede/data/cliente";
import { CATALOGO } from "@/modules/deu-sede/data/catalogo";
import type { Cadastros, Fornecedor, PedidoDetalhe, PedidoResumo, Produto } from "@/modules/deu-sede/data/tipos";
import { hojeISO, somarDias } from "@/modules/deu-sede/domain/formatos";

// DADOS DE EXEMPLO do modo de teste local. Fornecedores, preços,
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

  // Preço atual de cada fornecedor (preços de EXEMPLO por embalagem)
  const precos = async (f: Fornecedor, lista: [Produto, number][]) => {
    for (const [p, preco] of lista)
      await rpc("salvar_fornecedor_produto", {
        fornecedor_id: f.id,
        produto_id: p.id,
        tipo_embalagem: p.tipo_embalagem,
        unidades_por_embalagem: p.unidades_por_embalagem,
        preco_atual: preco,
      });
  };
  await precos(fA, [[BRAHMA, 38.9], [SKOL, 37.5], [ANTARCTICA, 37.9], [BRAHMA600, 129.9], [BUD_LN, 119.9], [SPATEN, 45.9], [AMA, 15.9]]);
  await precos(fB, [[BRAHMA, 39.5], [SKOL, 36.9], [ANTARCTICA, 38.5], [AMA, 14.9], [REDBULL, 6.9], [MONSTER, 8.5]]);
  await precos(fC, [[BRAHMA269, 33.9], [SKOL269, 33.5], [BUD350, 42.9], [C51, 13.9], [SMIRNOFF, 32.9], [REDLABEL, 89.9]]);

  // Montar pedido: itens dos dois fornecedores -> 2 pedidos
  const pedir = (f: Fornecedor, p: Produto, quantidade: number, preco: number) => ({
    fornecedor_id: f.id,
    produto_id: p.id,
    quantidade_embalagens: quantidade,
    preco_embalagem: preco,
  });
  const lote = await rpc<{ pedidos: PedidoResumo[] }>("gerar_pedidos", {
    lote_id: crypto.randomUUID(),
    itens: [
      pedir(fA, BRAHMA, 30, 38.9),
      pedir(fA, ANTARCTICA, 10, 37.9),
      pedir(fA, BUD_LN, 2, 119.9),
      pedir(fA, SPATEN, 5, 45.9),
      pedir(fB, SKOL, 20, 36.9),
      pedir(fB, AMA, 10, 14.9),
      pedir(fB, REDBULL, 24, 6.9),
      pedir(fB, MONSTER, 12, 8.5),
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
