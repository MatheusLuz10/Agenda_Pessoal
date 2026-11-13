import { Badge } from "@/modules/deu-sede/components/ui/badge";
import { PEDIDO_STATUS_LABEL, type PedidoStatus } from "@/modules/deu-sede/domain/status";

type Tom = "neutro" | "amarelo" | "verde" | "marrom" | "perigo";

const TOM_PEDIDO: Record<PedidoStatus, Tom> = {
  em_elaboracao: "neutro",
  aguardando_aprovacao: "marrom",
  aprovado: "amarelo",
  enviado: "marrom",
  confirmado: "marrom",
  em_transporte: "marrom",
  parcialmente_recebido: "amarelo",
  recebido: "verde",
  cancelado: "perigo",
};

export function StatusPedido({ status }: { status: PedidoStatus }) {
  return <Badge tone={TOM_PEDIDO[status]}>{PEDIDO_STATUS_LABEL[status]}</Badge>;
}
