// Rascunho do MONTAR PEDIDO, guardado neste aparelho até os pedidos serem
// gerados. Cada item guarda o produto, a QUANTIDADE EM UNIDADES desejada
// e a opção de compra escolhida:
//   "cot:<id do item da cotação>"  -> preço de uma cotação recebida
//   "atual:<id do vínculo>"        -> preço atual do fornecedor
export interface ItemMontagem {
  chave: string;
  produto_id: string;
  unidades: number;
  opcao: string;
}

export interface ConfigFornecedor {
  frete?: string;
  desconto_geral?: string;
  condicao_pagamento?: string;
  previsao_entrega?: string;
  observacoes?: string;
}

export interface Montagem {
  itens: ItemMontagem[];
  /** identificação única do lote: repetir o envio não duplica pedidos */
  lote_id: string;
  fornecedores: Record<string, ConfigFornecedor>;
}

const CHAVE = "deusede:montagem";

export function novaMontagem(): Montagem {
  return { itens: [], lote_id: crypto.randomUUID(), fornecedores: {} };
}

export function lerMontagem(): Montagem {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto) {
      const m = JSON.parse(bruto) as Montagem;
      if (Array.isArray(m.itens) && m.lote_id) return { ...novaMontagem(), ...m };
    }
  } catch {
    /* armazenamento indisponível: começa vazio */
  }
  return novaMontagem();
}

export function salvarMontagem(m: Montagem) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(m));
  } catch {
    /* sem armazenamento: o rascunho vale só até fechar a página */
  }
}

export function limparMontagem() {
  try {
    localStorage.removeItem(CHAVE);
  } catch {
    /* nada a fazer */
  }
}

/** Leva itens (da cotação ou da comparação) para o rascunho do Montar Pedido. */
export function adicionarAMontagem(itens: Omit<ItemMontagem, "chave">[], fornecedores: Record<string, ConfigFornecedor> = {}) {
  const m = lerMontagem();
  for (const it of itens) {
    const existente = m.itens.find((x) => x.produto_id === it.produto_id);
    if (existente) Object.assign(existente, it);
    else m.itens.push({ ...it, chave: crypto.randomUUID() });
  }
  m.fornecedores = { ...m.fornecedores, ...fornecedores };
  // a lista mudou: um novo envio é um novo lote
  m.lote_id = crypto.randomUUID();
  salvarMontagem(m);
}
