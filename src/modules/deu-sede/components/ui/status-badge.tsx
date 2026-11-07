import { Badge } from "@/modules/deu-sede/components/ui/badge";
import {
  COTACAO_STATUS_LABEL,
  PEDIDO_STATUS_LABEL,
  type CotacaoStatus,
  type PedidoStatus,
} from "@/modules/deu-sede/domain/status";

type Tom = "neutro" | "amarelo" | "verde" | "marrom" | "perigo";

const TOM_COTACAO: Record<CotacaoStatus, Tom> = {
  em_elaboracao: "neutro",
  aguardando_fornecedor: "marrom",
  recebida: "amarelo",
  em_analise: "amarelo",
  aprovada: "verde",
  rejeitada: "perigo",
  expirada: "neutro",
};

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

export function StatusCotacao({ status, vencida }: { status: CotacaoStatus; vencida?: boolean }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge tone={TOM_COTACAO[status]}>{COTACAO_STATUS_LABEL[status]}</Badge>
      {vencida && status !== "expirada" && <Badge tone="perigo">Vencida</Badge>}
    </span>
  );
}

export function StatusPedido({ status }: { status: PedidoStatus }) {
  return <Badge tone={TOM_PEDIDO[status]}>{PEDIDO_STATUS_LABEL[status]}</Badge>;
}
