import { Link } from "react-router-dom";
import { PackageCheck } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Badge } from "@/modules/deu-sede/components/ui/badge";
import { Aviso, Carregando, Vazio } from "@/modules/deu-sede/components/ui/aviso";
import { Secao } from "@/modules/deu-sede/components/ui/secao";
import { StatusPedido } from "@/modules/deu-sede/components/ui/status-badge";
import { rota } from "@/modules/deu-sede/config/modules";
import { useConsulta } from "@/modules/deu-sede/data/cliente";
import type { PedidoResumo, RecebimentoResumo } from "@/modules/deu-sede/data/tipos";
import { dataBR, moeda, numero } from "@/modules/deu-sede/domain/formatos";

export function RecebimentosPage() {
  const aguardando = useConsulta<PedidoResumo[]>("listar_pedidos", { aguardando_recebimento: true });
  const historico = useConsulta<RecebimentoResumo[]>("listar_recebimentos");

  return (
    <>
      <PageHeader
        title="Recebimentos"
        description="Conferência do que chegou de cada pedido. Nesta versão é só conferência e histórico, sem controle de estoque."
      />
      <div className="grid gap-5">
        <Secao titulo="Aguardando entrega" descricao="Pedidos já enviados ao fornecedor." semPadding>
          {aguardando.erro && <Aviso tom="erro" className="mx-5 mb-4">{aguardando.erro}</Aviso>}
          {!aguardando.dados && !aguardando.erro && <Carregando />}
          {aguardando.dados && aguardando.dados.length === 0 && (
            <div className="px-5 pb-5">
              <Vazio icone={PackageCheck} titulo="Nenhuma entrega pendente">
                Quando um pedido for enviado ao fornecedor, ele aparece aqui para conferência.
              </Vazio>
            </div>
          )}
          {aguardando.dados && aguardando.dados.length > 0 && (
            <ul className="divide-y divide-linha">
              {aguardando.dados.map((p) => (
                <li key={p.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <Link to={rota("pedidos", p.id)} className="min-w-0">
                    <span className="block font-semibold text-verde">
                      {p.numero_formatado} · {p.fornecedor_nome}
                    </span>
                    <span className="text-sm text-texto-suave">
                      {dataBR(p.data_pedido)} · {moeda(p.valor_total)}
                      {p.previsao_entrega && ` · previsão ${dataBR(p.previsao_entrega)}`}
                      {Number(p.quantidade_pendente) > 0 && ` · ${numero(p.quantidade_pendente)} emb. pendentes`}
                    </span>
                  </Link>
                  <span className="flex items-center gap-2">
                    <StatusPedido status={p.status} />
                    <LinkBotao size="sm" to={rota("recebimentos", "novo", p.id)}>
                      Conferir entrega
                    </LinkBotao>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Secao>

        <Secao titulo="Histórico de recebimentos" semPadding>
          {historico.erro && <Aviso tom="erro" className="mx-5 mb-4">{historico.erro}</Aviso>}
          {historico.dados && historico.dados.length === 0 && <p className="px-5 pb-4 text-sm text-texto-suave">Nenhum recebimento registrado ainda.</p>}
          {historico.dados && historico.dados.length > 0 && (
            <ul className="divide-y divide-linha">
              {historico.dados.map((r) => (
                <li key={r.id}>
                  <Link to={rota("pedidos", r.pedido_id)} className="flex flex-col gap-1 px-5 py-3 hover:bg-offwhite/60 sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      <span className="block font-medium text-verde">
                        {r.numero_formatado} · pedido {r.pedido_numero} · {r.fornecedor_nome}
                      </span>
                      <span className="text-sm text-texto-suave">
                        {dataBR(r.data_recebimento)}
                        {r.nota_fiscal && ` · NF ${r.nota_fiscal}`} · {numero(r.total_recebido)} emb. recebidas
                        {Number(r.total_danificado) > 0 && ` · ${numero(r.total_danificado)} avariadas`}
                      </span>
                    </span>
                    <span className="flex gap-1">
                      {r.divergencias_preco > 0 && <Badge tone="amarelo">{r.divergencias_preco} divergência(s) de preço</Badge>}
                      <StatusPedido status={r.pedido_status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>
    </>
  );
}
