import type { Evento } from "@/modules/deu-sede/data/tipos";
import { COTACAO_STATUS_LABEL, PEDIDO_STATUS_LABEL } from "@/modules/deu-sede/domain/status";
import { dataHoraBR } from "@/modules/deu-sede/domain/formatos";

const ROTULOS = { ...COTACAO_STATUS_LABEL, ...PEDIDO_STATUS_LABEL } as Record<string, string>;

function descrever(e: Evento): string {
  switch (e.acao) {
    case "criado":
      return "Pedido criado";
    case "status_alterado":
      return `${ROTULOS[e.status_anterior ?? ""] ?? e.status_anterior} → ${ROTULOS[e.status_novo ?? ""] ?? e.status_novo}`;
    case "recebimento_registrado":
      return `Recebimento ${e.detalhe} registrado`;
    case "recebimento_cancelado":
      return `Recebimento cancelado: ${e.detalhe}`;
    case "concluido_com_pendencia":
      return "Concluído com itens pendentes";
    default:
      return e.acao;
  }
}

/** Histórico de alterações (auditoria) de uma cotação ou pedido. */
export function LinhaDoTempo({ eventos }: { eventos: Evento[] }) {
  if (eventos.length === 0) return <p className="text-sm text-texto-suave">Nenhuma alteração registrada.</p>;
  return (
    <ol className="flex flex-col gap-3 border-l-2 border-linha pl-4">
      {eventos.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full bg-amarelo ring-2 ring-superficie" />
          <p className="text-sm font-medium text-verde">{descrever(e)}</p>
          {e.detalhe && e.acao !== "recebimento_registrado" && e.acao !== "recebimento_cancelado" && (
            <p className="text-sm text-texto">{e.detalhe}</p>
          )}
          <p className="text-xs text-texto-suave">{dataHoraBR(e.created_at)}</p>
        </li>
      ))}
    </ol>
  );
}
