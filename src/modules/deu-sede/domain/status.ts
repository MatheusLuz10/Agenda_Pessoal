// Regras de status dos pedidos. Este arquivo espelha as
// restrições do banco (supabase/migrations/0001_estrutura_inicial.sql):
// o banco é quem garante a regra; aqui ela serve para a tela mostrar só
// as ações permitidas e dar mensagens claras antes de chamar o banco.

// ----------------------------------------------------------------- Pedidos

export const PEDIDO_STATUS = [
  "em_elaboracao",
  "aguardando_aprovacao",
  "aprovado",
  "enviado",
  "confirmado",
  "em_transporte",
  "parcialmente_recebido",
  "recebido",
  "cancelado",
] as const;
export type PedidoStatus = (typeof PEDIDO_STATUS)[number];

export const PEDIDO_STATUS_LABEL: Record<PedidoStatus, string> = {
  em_elaboracao: "Em elaboração",
  aguardando_aprovacao: "Aguardando aprovação",
  aprovado: "Aprovado",
  enviado: "Enviado ao fornecedor",
  confirmado: "Confirmado",
  em_transporte: "Em transporte",
  parcialmente_recebido: "Parcialmente recebido",
  recebido: "Recebido",
  cancelado: "Cancelado",
};

const PEDIDO_TRANSICOES: Record<PedidoStatus, readonly PedidoStatus[]> = {
  em_elaboracao: ["aguardando_aprovacao", "aprovado", "cancelado"],
  aguardando_aprovacao: ["em_elaboracao", "aprovado", "cancelado"],
  aprovado: ["enviado", "cancelado"],
  enviado: ["confirmado", "em_transporte", "parcialmente_recebido", "recebido", "cancelado"],
  confirmado: ["em_transporte", "parcialmente_recebido", "recebido", "cancelado"],
  em_transporte: ["parcialmente_recebido", "recebido", "cancelado"],
  parcialmente_recebido: ["recebido"],
  recebido: [],
  cancelado: [],
};

export function proximosStatusPedido(status: PedidoStatus): readonly PedidoStatus[] {
  return PEDIDO_TRANSICOES[status];
}

export function podeMudarStatusPedido(de: PedidoStatus, para: PedidoStatus): boolean {
  return PEDIDO_TRANSICOES[de].includes(para);
}

/** Pedido concluído não aceita mais nenhuma alteração. */
export function pedidoEncerrado(status: PedidoStatus): boolean {
  return status === "recebido" || status === "cancelado";
}

/** Só pedidos em elaboração podem ter itens, preços e frete alterados. */
export function pedidoPermiteEditarItens(status: PedidoStatus): boolean {
  return status === "em_elaboracao" || status === "aguardando_aprovacao";
}

/** Recebimentos só podem ser lançados depois que o pedido saiu para o fornecedor. */
export function pedidoAceitaRecebimento(status: PedidoStatus): boolean {
  return (
    status === "enviado" ||
    status === "confirmado" ||
    status === "em_transporte" ||
    status === "parcialmente_recebido"
  );
}

/**
 * "Compra realizada" para painel e relatórios: o pedido já foi enviado ao
 * fornecedor e não foi cancelado. Não entram nesta conta
 * pedidos ainda em elaboração/aprovação.
 */
export function contaComoCompraRealizada(status: PedidoStatus): boolean {
  return pedidoAceitaRecebimento(status) || status === "recebido";
}
