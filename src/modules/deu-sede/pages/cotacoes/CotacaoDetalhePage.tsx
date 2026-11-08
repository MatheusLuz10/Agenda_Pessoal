import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Copy, Pencil, Scale, ShoppingCart, Trash2 } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Button, LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Aviso, Carregando } from "@/modules/deu-sede/components/ui/aviso";
import { Confirmar } from "@/modules/deu-sede/components/ui/dialogo";
import { Dados, Secao, Tabela } from "@/modules/deu-sede/components/ui/secao";
import { StatusCotacao, StatusPedido } from "@/modules/deu-sede/components/ui/status-badge";
import { LinhaDoTempo } from "@/modules/deu-sede/components/LinhaDoTempo";
import { rota } from "@/modules/deu-sede/config/modules";
import { executar, useConsulta } from "@/modules/deu-sede/data/cliente";
import { useEnvio } from "@/modules/deu-sede/data/hooks";
import { adicionarAMontagem } from "@/modules/deu-sede/data/montagem";
import type { CotacaoDetalhe } from "@/modules/deu-sede/data/tipos";
import {
  COTACAO_STATUS_LABEL,
  cotacaoPermiteEditarItens,
  proximosStatusCotacao,
  type CotacaoStatus,
} from "@/modules/deu-sede/domain/status";
import { dataBR, descreverEmbalagem, moeda, moedaUnitaria, numero } from "@/modules/deu-sede/domain/formatos";

const ACAO_STATUS: Partial<Record<CotacaoStatus, string>> = {
  em_elaboracao: "Voltar para elaboração",
  aguardando_fornecedor: "Aguardando fornecedor",
  recebida: "Marcar como recebida",
  em_analise: "Em análise",
  aprovada: "Aprovar",
  rejeitada: "Rejeitar",
  expirada: "Marcar como expirada",
};

export function CotacaoDetalhePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { dados: c, erro, carregando } = useConsulta<CotacaoDetalhe | null>("obter_cotacao", { id });
  const [mudanca, setMudanca] = useState<CotacaoStatus | null>(null);
  const [excluir, setExcluir] = useState(false);
  const acao = useEnvio();

  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (c === undefined || (carregando && !c)) return <Carregando />;
  if (!c) return <Aviso tom="erro">Cotação não encontrada.</Aviso>;

  const podePedido = ["recebida", "em_analise", "aprovada"].includes(c.status);
  const editavel = cotacaoPermiteEditarItens(c.status);

  async function duplicar() {
    const nova = await acao.enviar(() => executar<CotacaoDetalhe>("duplicar_cotacao", { id: c!.id }));
    if (nova) navigate(rota("cotacoes", nova.id, "editar"));
  }

  function gerarPedido() {
    adicionarAMontagem(
      c!.itens.map((i) => ({
        produto_id: i.produto_id,
        unidades: Number(i.quantidade_embalagens) * i.unidades_por_embalagem,
        opcao: `cot:${i.id}`,
      })),
      {
        [c!.fornecedor_id]: {
          frete: Number(c!.frete) ? String(c!.frete).replace(".", ",") : "",
          desconto_geral: Number(c!.desconto_geral) ? String(c!.desconto_geral).replace(".", ",") : "",
          condicao_pagamento: c!.condicao_pagamento ?? "",
        },
      },
    );
    navigate(rota("pedidos", "montar-comparacao"));
  }

  return (
    <>
      <PageHeader
        title={`Cotação ${c.numero_formatado}`}
        description={`${c.fornecedor_nome} · ${dataBR(c.data_cotacao)}`}
        actions={
          <>
            {podePedido && (
              <Button onClick={gerarPedido}>
                <ShoppingCart className="size-4" /> Gerar pedido
              </Button>
            )}
            {editavel && (
              <LinkBotao to={rota("cotacoes", c.id, "editar")} variant="secundario">
                <Pencil className="size-4" /> Editar
              </LinkBotao>
            )}
            <Button variant="contorno" onClick={duplicar} disabled={acao.enviando}>
              <Copy className="size-4" /> Duplicar
            </Button>
          </>
        }
      />
      {acao.erro && <Aviso tom="erro" className="mb-4">{acao.erro}</Aviso>}
      {c.vencida && c.status !== "expirada" && (
        <Aviso tom="atencao" className="mb-4">
          Esta cotação venceu em {dataBR(c.validade)}. Confirme os preços com o fornecedor antes de comprar.
        </Aviso>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="grid min-w-0 gap-5">
          <Secao titulo="Situação" acoes={<StatusCotacao status={c.status} vencida={c.vencida} />}>
            <div className="flex flex-wrap gap-2">
              {proximosStatusCotacao(c.status).map((s) => (
                <Button key={s} size="sm" variant={s === "rejeitada" ? "contorno" : "secundario"} onClick={() => setMudanca(s)}>
                  {ACAO_STATUS[s]}
                </Button>
              ))}
              {c.status === "em_elaboracao" && (
                <Button size="sm" variant="contorno" onClick={() => setExcluir(true)}>
                  <Trash2 className="size-4" /> Excluir rascunho
                </Button>
              )}
              {proximosStatusCotacao(c.status).length === 0 && c.status !== "em_elaboracao" && (
                <p className="text-sm text-texto-suave">Cotação encerrada. Ela continua no histórico; use "Duplicar" para uma nova proposta.</p>
              )}
            </div>
            {!editavel && (
              <p className="mt-3 text-xs text-texto-suave">
                Cotação recebida: os itens e valores ficam preservados como foram registrados.
              </p>
            )}
          </Secao>

          <Secao
            titulo="Produtos"
            acoes={
              podePedido && (
                <LinkBotao size="sm" variant="contorno" to={rota("comparacao") + `?produtos=${c.itens.map((i) => i.produto_id).join(",")}`}>
                  <Scale className="size-4" /> Comparar preços
                </LinkBotao>
              )
            }
            semPadding
          >
            <Tabela>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Embalagem</th>
                  <th className="num">Qtd.</th>
                  <th className="num">Preço/emb.</th>
                  <th className="num">Desconto</th>
                  <th className="num">Subtotal</th>
                  <th className="num">Por unidade</th>
                </tr>
              </thead>
              <tbody>
                {c.itens.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <Link to={rota("produtos", i.produto_id)} className="font-medium text-verde hover:underline">
                        {i.produto_nome}
                      </Link>
                    </td>
                    <td>{descreverEmbalagem(i.tipo_embalagem, i.unidades_por_embalagem)}</td>
                    <td className="num">{numero(i.quantidade_embalagens)}</td>
                    <td className="num">{moeda(i.preco_embalagem)}</td>
                    <td className="num">{Number(i.desconto_valor) ? moeda(i.desconto_valor) : "—"}</td>
                    <td className="num">{moeda(i.subtotal)}</td>
                    <td className="num">{moedaUnitaria(i.preco_unitario)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
            <dl className="mx-4 my-3 grid gap-1 rounded-xl bg-offwhite/60 p-4 text-sm sm:mx-5">
              <div className="flex justify-between"><dt>Soma dos produtos</dt><dd className="tabular-nums">{moeda(c.valor_bruto)}</dd></div>
              <div className="flex justify-between"><dt>Descontos</dt><dd className="tabular-nums">− {moeda(c.total_descontos)}</dd></div>
              <div className="flex justify-between"><dt>Frete</dt><dd className="tabular-nums">{moeda(c.frete)}</dd></div>
              <div className="mt-1 flex justify-between border-t border-linha pt-2 text-base font-bold text-verde">
                <dt>Total</dt>
                <dd className="tabular-nums">{moeda(c.valor_total)}</dd>
              </div>
            </dl>
          </Secao>
        </div>

        <div className="grid content-start gap-5">
          <Secao titulo="Condições">
            <Dados
              itens={[
                ["Fornecedor", <Link key="f" to={rota("fornecedores", c.fornecedor_id)} className="text-marrom underline">{c.fornecedor_nome}</Link>],
                ["Data", dataBR(c.data_cotacao)],
                ["Válida até", c.validade ? dataBR(c.validade) : "Não informada"],
                ["Pagamento", c.condicao_pagamento],
                ["Prazo de entrega", c.prazo_entrega],
                ["Observações", c.observacoes],
                ["Motivo", c.motivo_status],
              ]}
            />
          </Secao>
          {c.pedidos.length > 0 && (
            <Secao titulo="Pedidos gerados">
              <ul className="flex flex-col gap-2">
                {c.pedidos.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <Link to={rota("pedidos", p.id)} className="font-medium text-marrom underline">
                      {p.numero_formatado}
                    </Link>
                    <StatusPedido status={p.status} />
                  </li>
                ))}
              </ul>
            </Secao>
          )}
          <Secao titulo="Histórico">
            <LinhaDoTempo eventos={c.eventos} />
          </Secao>
        </div>
      </div>

      <Confirmar
        aberto={mudanca !== null}
        titulo={mudanca ? `${ACAO_STATUS[mudanca]}?` : ""}
        mensagem={
          mudanca === "recebida"
            ? "Os itens e valores ficam travados e os preços entram no histórico e no preço atual do fornecedor."
            : `A cotação passa para "${mudanca ? COTACAO_STATUS_LABEL[mudanca] : ""}".`
        }
        pedirMotivo={mudanca === "rejeitada"}
        rotuloMotivo="Motivo da rejeição"
        perigo={mudanca === "rejeitada"}
        textoConfirmar={mudanca ? ACAO_STATUS[mudanca] : "Confirmar"}
        aoFechar={() => setMudanca(null)}
        aoConfirmar={async (motivo) => {
          await executar("mudar_status_cotacao", { id: c.id, status: mudanca, motivo: motivo || undefined });
        }}
      />
      <Confirmar
        aberto={excluir}
        titulo="Excluir rascunho?"
        mensagem="O rascunho será apagado. Só rascunhos podem ser excluídos; cotações recebidas ficam sempre no histórico."
        perigo
        textoConfirmar="Excluir"
        aoFechar={() => setExcluir(false)}
        aoConfirmar={async () => {
          await executar("excluir_cotacao", { id: c.id });
          navigate(rota("cotacoes"), { replace: true });
        }}
      />
    </>
  );
}
