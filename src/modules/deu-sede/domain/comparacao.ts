import type { Oferta } from "@/modules/deu-sede/data/tipos";
import { arredondar } from "@/modules/deu-sede/domain/formatos";

// Comparação inteligente de preços (Etapa 4).
//
// Regras:
//  * compara o MESMO produto pelo preço por UNIDADE (nunca embalagem
//    contra embalagem de tamanhos diferentes);
//  * a quantidade desejada é convertida em unidades e, para cada oferta,
//    em embalagens daquele fornecedor (arredondando para cima);
//  * o desconto do item da cotação é aplicado proporcionalmente;
//  * frete e desconto geral entram UMA vez por fornecedor usado (o maior
//    entre as cotações usadas daquele fornecedor);
//  * só usa ofertas registradas — produto sem oferta fica "sem preço".

export interface Desejo {
  produto_id: string;
  /** unidades desejadas (ex.: 20 caixas c/ 12 = 240) */
  unidades: number;
}

export interface CustoItem {
  oferta: Oferta;
  embalagens: number;
  unidades: number;
  descontoItem: number;
  subtotal: number;
}

export function custoOferta(oferta: Oferta, unidadesDesejadas: number): CustoItem {
  const embalagens = Math.max(1, Math.ceil(unidadesDesejadas / oferta.unidades_por_embalagem - 1e-9));
  const descontoPorEmbalagem =
    oferta.quantidade_embalagens > 0 ? Number(oferta.desconto_valor) / Number(oferta.quantidade_embalagens) : 0;
  const descontoItem = arredondar(descontoPorEmbalagem * embalagens);
  const bruto = arredondar(embalagens * Number(oferta.preco_embalagem));
  return {
    oferta,
    embalagens,
    unidades: embalagens * oferta.unidades_por_embalagem,
    descontoItem,
    subtotal: arredondar(bruto - descontoItem),
  };
}

export interface ResumoFornecedor {
  fornecedor_id: string;
  fornecedor_nome: string;
  itens: CustoItem[];
  subtotal: number;
  frete: number;
  descontoGeral: number;
  total: number;
}

export interface Alternativa {
  escolhas: Record<string, CustoItem>;
  porFornecedor: ResumoFornecedor[];
  itens: number;
  fretes: number;
  descontosGerais: number;
  total: number;
  /** produtos desejados sem oferta nesta alternativa */
  semPreco: string[];
}

export function montarAlternativa(escolhas: Record<string, CustoItem>, desejos: Desejo[]): Alternativa {
  const grupos = new Map<string, ResumoFornecedor>();
  for (const c of Object.values(escolhas)) {
    const o = c.oferta;
    let g = grupos.get(o.fornecedor_id);
    if (!g) {
      g = { fornecedor_id: o.fornecedor_id, fornecedor_nome: o.fornecedor_nome, itens: [], subtotal: 0, frete: 0, descontoGeral: 0, total: 0 };
      grupos.set(o.fornecedor_id, g);
    }
    g.itens.push(c);
    g.subtotal = arredondar(g.subtotal + c.subtotal);
    g.frete = Math.max(g.frete, Number(o.frete));
    g.descontoGeral = Math.max(g.descontoGeral, Number(o.desconto_geral));
  }
  const porFornecedor = [...grupos.values()].map((g) => ({
    ...g,
    total: arredondar(g.subtotal + g.frete - g.descontoGeral),
  }));
  porFornecedor.sort((a, b) => b.total - a.total);
  const itens = arredondar(porFornecedor.reduce((s, g) => s + g.subtotal, 0));
  const fretes = arredondar(porFornecedor.reduce((s, g) => s + g.frete, 0));
  const descontosGerais = arredondar(porFornecedor.reduce((s, g) => s + g.descontoGeral, 0));
  return {
    escolhas,
    porFornecedor,
    itens,
    fretes,
    descontosGerais,
    total: arredondar(itens + fretes - descontosGerais),
    semPreco: desejos.filter((d) => !escolhas[d.produto_id]).map((d) => d.produto_id),
  };
}

export function ofertasValidas(ofertas: Oferta[], incluirVencidas: boolean): Oferta[] {
  return ofertas.filter((o) => o.fornecedor_ativo && (incluirVencidas || !o.vencida));
}

/** Menor custo considerando frete: testa todas as combinações de fornecedores. */
export function melhorCombinacao(desejos: Desejo[], ofertas: Oferta[]): Alternativa {
  const fornecedores = [...new Set(ofertas.map((o) => o.fornecedor_id))];
  const porProduto = new Map<string, Oferta[]>();
  for (const o of ofertas) porProduto.set(o.produto_id, [...(porProduto.get(o.produto_id) ?? []), o]);

  const escolherDentro = (permitidos: Set<string>) => {
    const escolhas: Record<string, CustoItem> = {};
    for (const d of desejos) {
      let melhor: CustoItem | null = null;
      for (const o of porProduto.get(d.produto_id) ?? []) {
        if (!permitidos.has(o.fornecedor_id)) continue;
        const c = custoOferta(o, d.unidades);
        if (!melhor || c.subtotal < melhor.subtotal) melhor = c;
      }
      if (melhor) escolhas[d.produto_id] = melhor;
    }
    return montarAlternativa(escolhas, desejos);
  };

  // Até 12 fornecedores: 4.096 combinações (instantâneo). Acima disso,
  // usa o melhor preço por item (o frete ainda entra no total).
  if (fornecedores.length > 12) return escolherDentro(new Set(fornecedores));

  let melhor: Alternativa | null = null;
  for (let mascara = 1; mascara < 1 << fornecedores.length; mascara++) {
    const permitidos = new Set(fornecedores.filter((_, i) => mascara & (1 << i)));
    const alt = escolherDentro(permitidos);
    const melhorCobertura = !melhor || alt.semPreco.length < melhor.semPreco.length;
    const mesmaCobertura = melhor && alt.semPreco.length === melhor.semPreco.length;
    if (melhorCobertura || (mesmaCobertura && alt.total < melhor!.total - 0.001)) melhor = alt;
  }
  return melhor ?? montarAlternativa({}, desejos);
}

/** Comprar tudo de um fornecedor (o que ele não cotou fica sem preço). */
export function tudoDeUmFornecedor(fornecedorId: string, desejos: Desejo[], ofertas: Oferta[]): Alternativa {
  const escolhas: Record<string, CustoItem> = {};
  for (const d of desejos) {
    let melhor: CustoItem | null = null;
    for (const o of ofertas) {
      if (o.fornecedor_id !== fornecedorId || o.produto_id !== d.produto_id) continue;
      const c = custoOferta(o, d.unidades);
      if (!melhor || c.subtotal < melhor.subtotal) melhor = c;
    }
    if (melhor) escolhas[d.produto_id] = melhor;
  }
  return montarAlternativa(escolhas, desejos);
}
