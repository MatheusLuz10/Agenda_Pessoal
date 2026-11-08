import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CalendarClock, ClipboardCopy, FileDown, MessageCircle, PackageCheck, XCircle } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Button, LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Badge } from "@/modules/deu-sede/components/ui/badge";
import { Aviso, Carregando } from "@/modules/deu-sede/components/ui/aviso";
import { Confirmar, Dialogo } from "@/modules/deu-sede/components/ui/dialogo";
import { Campo, Input, Textarea } from "@/modules/deu-sede/components/ui/input";
import { Dados, Secao, Tabela } from "@/modules/deu-sede/components/ui/secao";
import { StatusPedido } from "@/modules/deu-sede/components/ui/status-badge";
import { LinhaDoTempo } from "@/modules/deu-sede/components/LinhaDoTempo";
import { rota } from "@/modules/deu-sede/config/modules";
import { executar, useConsulta } from "@/modules/deu-sede/data/cliente";
import { useEnvio } from "@/modules/deu-sede/data/hooks";
import type { PedidoDetalhe } from "@/modules/deu-sede/data/tipos";
import {
  PEDIDO_STATUS_LABEL,
  pedidoAceitaRecebimento,
  pedidoEncerrado,
  proximosStatusPedido,
  type PedidoStatus,
} from "@/modules/deu-sede/domain/status";
import { dataBR, dataHoraBR, descreverEmbalagem, moeda, moedaUnitaria, numero } from "@/modules/deu-sede/domain/formatos";
import { linkWhatsapp, mensagemPedido, numeroWhatsapp } from "@/modules/deu-sede/domain/whatsapp";
import { gerarPdfPedido } from "@/modules/deu-sede/pedidoPdf";
import { useSoPedidos } from "@/modules/deu-sede/soPedidos";

// Mudanças de status feitas por botão nesta tela (recebimento e
// conclusão têm fluxo próprio; envio tem o fluxo do WhatsApp).
const BOTOES: Partial<Record<PedidoStatus, string>> = {
  aguardando_aprovacao: "Enviar para aprovação",
  aprovado: "Aprovar",
  em_elaboracao: "Voltar para elaboração",
  confirmado: "Fornecedor confirmou",
  em_transporte: "Em transporte",
};

export function PedidoDetalhePage() {
  const { id = "" } = useParams();
  const { dados: p, erro, carregando } = useConsulta<PedidoDetalhe | null>("obter_pedido", { id });
  const soPedidos = useSoPedidos() === true;
  const [mudanca, setMudanca] = useState<PedidoStatus | null>(null);
  const [confirmarEnvio, setConfirmarEnvio] = useState(false);
  const [cancelar, setCancelar] = useState(false);
  const [concluir, setConcluir] = useState(false);
  const [editarEntrega, setEditarEntrega] = useState(false);
  const [copiado, setCopiado] = useState(false);

  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (p === undefined || (carregando && !p)) return <Carregando />;
  if (!p) return <Aviso tom="erro">Pedido não encontrado.</Aviso>;

  const mensagem = mensagemPedido(p);
  const numeroWa = numeroWhatsapp(p.fornecedor?.whatsapp ?? p.fornecedor_whatsapp);
  const podeEnviar = p.status === "aprovado";
  const reenviar = ["enviado", "confirmado", "em_transporte"].includes(p.status);
  const proximos = proximosStatusPedido(p.status).filter((s) => BOTOES[s]);
  const podeCancelar = proximosStatusPedido(p.status).includes("cancelado");
  const divergencias = p.itens.filter((i) => i.maior_preco_cobrado !== null && Number(i.maior_preco_cobrado) !== Number(i.preco_embalagem));

  function abrirWhatsapp() {
    if (!numeroWa) return;
    window.open(linkWhatsapp(numeroWa, mensagem), "_blank", "noopener");
    if (podeEnviar) setConfirmarEnvio(true);
  }

  async function copiarMensagem() {
    try {
      await navigator.clipboard.writeText(mensagem);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* sem acesso à área de transferência: a mensagem segue visível para copiar à mão */
    }
  }

  return (
    <>
      <PageHeader
        title={`Pedido ${p.numero_formatado}`}
        description={`${p.fornecedor_nome} · ${dataBR(p.data_pedido)}`}
        actions={
          <>
            {pedidoAceitaRecebimento(p.status) && !soPedidos && (
              <LinkBotao to={rota("recebimentos", "novo", p.id)}>
                <PackageCheck className="size-4" /> Registrar recebimento
              </LinkBotao>
            )}
            {(podeEnviar || reenviar) && (
              <Button variant={podeEnviar ? "primario" : "contorno"} onClick={abrirWhatsapp} disabled={!numeroWa}>
                <MessageCircle className="size-4" /> {podeEnviar ? "Enviar pelo WhatsApp" : "Reenviar no WhatsApp"}
              </Button>
            )}
          </>
        }
      />

      {(podeEnviar || reenviar) && !numeroWa && (
        <Aviso tom="atencao" className="mb-4">
          O fornecedor não tem WhatsApp cadastrado.{" "}
          <Link to={rota("fornecedores", p.fornecedor_id, "editar")} className="font-semibold underline">
            Cadastrar o WhatsApp
          </Link>{" "}
          ou copie a mensagem abaixo e envie por outro meio.
        </Aviso>
      )}
      {divergencias.length > 0 && (
        <Aviso tom="atencao" className="mb-4">
          Divergência de preço no recebimento: {divergencias.map((i) => `${i.produto_nome} (pedido ${moeda(i.preco_embalagem)}, cobrado ${moeda(i.maior_preco_cobrado)})`).join("; ")}.
        </Aviso>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="grid min-w-0 gap-5">
          <Secao titulo="Situação" acoes={<StatusPedido status={p.status} />}>
            <div className="flex flex-wrap gap-2">
              {podeEnviar && (
                <Button size="sm" variant="secundario" onClick={() => setConfirmarEnvio(true)}>
                  Já enviei por outro meio
                </Button>
              )}
              {proximos.map((s) => (
                <Button key={s} size="sm" variant="secundario" onClick={() => setMudanca(s)}>
                  {BOTOES[s]}
                </Button>
              ))}
              {p.status === "parcialmente_recebido" && (
                <Button size="sm" variant="contorno" onClick={() => setConcluir(true)}>
                  Concluir com itens pendentes
                </Button>
              )}
              {!pedidoEncerrado(p.status) && (
                <Button size="sm" variant="contorno" onClick={() => setEditarEntrega(true)}>
                  <CalendarClock className="size-4" /> Previsão e observações
                </Button>
              )}
              {podeCancelar && (
                <Button size="sm" variant="contorno" className="text-perigo" onClick={() => setCancelar(true)}>
                  <XCircle className="size-4" /> Cancelar pedido
                </Button>
              )}
            </div>
            {pedidoEncerrado(p.status) && (
              <p className="mt-2 text-sm text-texto-suave">
                Pedido {p.status === "recebido" ? "concluído" : "cancelado"}: não aceita mais alterações.
                {p.motivo_cancelamento && ` Motivo: ${p.motivo_cancelamento}`}
              </p>
            )}
          </Secao>

          <Secao titulo="Produtos" semPadding>
            <Tabela>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Embalagem</th>
                  <th className="num">Pedido</th>
                  <th className="num">Recebido</th>
                  <th className="num">Pendente</th>
                  <th className="num">Preço/emb.</th>
                  <th className="num">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {p.itens.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <Link to={rota("produtos", i.produto_id)} className="font-medium text-verde hover:underline">
                        {i.produto_nome}
                      </Link>
                      <span className="block text-xs text-texto-suave">{moedaUnitaria(i.preco_unitario)}/un</span>
                    </td>
                    <td>{descreverEmbalagem(i.tipo_embalagem, i.unidades_por_embalagem)}</td>
                    <td className="num">{numero(i.quantidade_embalagens)}</td>
                    <td className="num">
                      {numero(i.quantidade_aceita)}
                      {Number(i.quantidade_danificada) > 0 && <span className="block text-xs text-perigo">{numero(i.quantidade_danificada)} avariada(s)</span>}
                    </td>
                    <td className="num">{Number(i.quantidade_pendente) > 0 ? <Badge tone="amarelo">{numero(i.quantidade_pendente)}</Badge> : "—"}</td>
                    <td className="num">{moeda(i.preco_embalagem)}</td>
                    <td className="num">
                      {moeda(i.subtotal)}
                      {Number(i.desconto_valor) > 0 && <span className="block text-xs text-texto-suave">desc. {moeda(i.desconto_valor)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
            <dl className="mx-4 my-3 grid gap-1 rounded-xl bg-offwhite/60 p-4 text-sm sm:mx-5">
              <div className="flex justify-between"><dt>Soma dos produtos</dt><dd className="tabular-nums">{moeda(p.valor_bruto)}</dd></div>
              <div className="flex justify-between"><dt>Descontos</dt><dd className="tabular-nums">− {moeda(p.total_descontos)}</dd></div>
              <div className="flex justify-between"><dt>Frete</dt><dd className="tabular-nums">{moeda(p.frete)}</dd></div>
              <div className="mt-1 flex justify-between border-t border-linha pt-2 text-base font-bold text-verde">
                <dt>Total do pedido</dt>
                <dd className="tabular-nums">{moeda(p.valor_total)}</dd>
              </div>
              <div className="flex justify-between text-texto-suave"><dt>Já recebido (valor)</dt><dd className="tabular-nums">{moeda(p.valor_recebido_itens)}</dd></div>
            </dl>
          </Secao>

          <Secao
            titulo="Mensagem para o fornecedor"
            acoes={
              <>
                <Button size="sm" variant="contorno" onClick={copiarMensagem}>
                  <ClipboardCopy className="size-4" /> {copiado ? "Copiada!" : "Copiar"}
                </Button>
                <Button size="sm" variant="contorno" onClick={() => gerarPdfPedido(p)}>
                  <FileDown className="size-4" /> PDF
                </Button>
              </>
            }
          >
            <pre className="max-h-72 overflow-auto rounded-xl bg-offwhite/60 p-3 text-sm whitespace-pre-wrap text-verde">{mensagem}</pre>
          </Secao>

          {p.recebimentos.length > 0 && (
            <Secao titulo="Recebimentos" semPadding>
              <ul className="divide-y divide-linha">
                {p.recebimentos.map((r) => (
                  <li key={r.id} className="px-5 py-3">
                    <p className="font-medium text-verde">
                      {r.numero_formatado} · {dataBR(r.data_recebimento)}
                      {r.nota_fiscal && ` · NF ${r.nota_fiscal}`}
                      {r.cancelado_em && <Badge tone="perigo" className="ml-2">Cancelado</Badge>}
                    </p>
                    <ul className="mt-1 text-sm text-texto">
                      {r.itens.map((ri) => (
                        <li key={ri.id}>
                          {ri.produto_nome}: {numero(ri.quantidade_recebida)} recebida(s)
                          {Number(ri.quantidade_danificada) > 0 && `, ${numero(ri.quantidade_danificada)} avariada(s)`}
                          {ri.preco_cobrado !== null && Number(ri.preco_cobrado) !== Number(ri.preco_pedido) && (
                            <span className="text-marrom"> · cobrado {moeda(ri.preco_cobrado)} (pedido {moeda(ri.preco_pedido)})</span>
                          )}
                          {ri.observacoes && <span className="text-texto-suave"> · {ri.observacoes}</span>}
                        </li>
                      ))}
                    </ul>
                    {r.observacoes && <p className="text-sm text-texto-suave">{r.observacoes}</p>}
                  </li>
                ))}
              </ul>
            </Secao>
          )}
        </div>

        <div className="grid content-start gap-5">
          <Secao titulo="Dados do pedido">
            <Dados
              itens={[
                ["Fornecedor", <Link key="f" to={rota("fornecedores", p.fornecedor_id)} className="text-marrom underline">{p.fornecedor_nome}</Link>],
                ["Cotação de origem", p.cotacao_id ? <Link key="c" to={rota("cotacoes", p.cotacao_id)} className="text-marrom underline">{p.cotacao_numero}</Link> : null],
                ["Pagamento", p.condicao_pagamento],
                ["Previsão de entrega", p.previsao_entrega ? dataBR(p.previsao_entrega) : null],
                ["Enviado em", p.enviado_em ? dataHoraBR(p.enviado_em) : null],
                ["Concluído em", p.concluido_em ? dataHoraBR(p.concluido_em) : null],
                ["Observações", p.observacoes],
              ]}
            />
          </Secao>
          <Secao titulo="Histórico">
            <LinhaDoTempo eventos={p.eventos} />
          </Secao>
        </div>
      </div>

      <Confirmar
        aberto={confirmarEnvio}
        titulo="Você enviou o pedido?"
        mensagem="Confirme só depois de enviar a mensagem ao fornecedor. O pedido passa para “Enviado ao fornecedor” e entra nas compras realizadas."
        textoConfirmar="Sim, enviei"
        aoFechar={() => setConfirmarEnvio(false)}
        aoConfirmar={async () => {
          await executar("mudar_status_pedido", { id: p.id, status: "enviado" });
        }}
      />
      <Confirmar
        aberto={mudanca !== null}
        titulo={mudanca ? `${BOTOES[mudanca]}?` : ""}
        mensagem={`O pedido passa para “${mudanca ? PEDIDO_STATUS_LABEL[mudanca] : ""}”.`}
        textoConfirmar="Confirmar"
        aoFechar={() => setMudanca(null)}
        aoConfirmar={async () => {
          await executar("mudar_status_pedido", { id: p.id, status: mudanca });
        }}
      />
      <Confirmar
        aberto={cancelar}
        titulo={`Cancelar o pedido ${p.numero_formatado}?`}
        mensagem="O pedido fica no histórico como cancelado e não conta como compra. Esta ação não pode ser desfeita."
        pedirMotivo
        rotuloMotivo="Motivo do cancelamento"
        perigo
        textoConfirmar="Cancelar pedido"
        aoFechar={() => setCancelar(false)}
        aoConfirmar={async (motivo) => {
          await executar("mudar_status_pedido", { id: p.id, status: "cancelado", motivo });
        }}
      />
      <Confirmar
        aberto={concluir}
        titulo="Concluir com itens pendentes?"
        mensagem="Use quando o restante não vai mais chegar. O pedido fica como Recebido e a justificativa entra no histórico."
        pedirMotivo
        rotuloMotivo="Justificativa"
        textoConfirmar="Concluir pedido"
        aoFechar={() => setConcluir(false)}
        aoConfirmar={async (justificativa) => {
          await executar("concluir_pedido", { id: p.id, justificativa });
        }}
      />
      {editarEntrega && <EditarEntrega pedido={p} aoFechar={() => setEditarEntrega(false)} />}
    </>
  );
}

function EditarEntrega({ pedido, aoFechar }: { pedido: PedidoDetalhe; aoFechar: () => void }) {
  const [previsao, setPrevisao] = useState(pedido.previsao_entrega ?? "");
  const [observacoes, setObservacoes] = useState(pedido.observacoes ?? "");
  const { enviando, erro, enviar } = useEnvio();
  async function salvar() {
    const ok = await enviar(() => executar("atualizar_pedido", { id: pedido.id, previsao_entrega: previsao || null, observacoes }));
    if (ok) aoFechar();
  }
  return (
    <Dialogo
      aberto
      titulo="Previsão de entrega e observações"
      aoFechar={aoFechar}
      rodape={
        <>
          <Button variant="contorno" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button data-principal onClick={salvar} disabled={enviando}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Campo rotulo="Previsão de entrega">{(id) => <Input id={id} type="date" value={previsao} onChange={(e) => setPrevisao(e.target.value)} />}</Campo>
        <Campo rotulo="Observações">{(id) => <Textarea id={id} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />}</Campo>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Dialogo>
  );
}
