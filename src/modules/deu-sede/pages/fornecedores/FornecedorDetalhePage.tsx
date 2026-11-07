import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ClipboardList, MessageCircle, Pencil, Phone, Plus, Power } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Button, LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Badge } from "@/modules/deu-sede/components/ui/badge";
import { Aviso, Carregando } from "@/modules/deu-sede/components/ui/aviso";
import { Confirmar } from "@/modules/deu-sede/components/ui/dialogo";
import { Dados, Secao, Tabela } from "@/modules/deu-sede/components/ui/secao";
import { StatusCotacao, StatusPedido } from "@/modules/deu-sede/components/ui/status-badge";
import { VinculoDialog } from "@/modules/deu-sede/components/VinculoDialog";
import { rota } from "@/modules/deu-sede/config/modules";
import { executar, useConsulta } from "@/modules/deu-sede/data/cliente";
import { useCadastros } from "@/modules/deu-sede/data/hooks";
import type { CotacaoResumo, FornecedorProduto, PedidoResumo } from "@/modules/deu-sede/data/tipos";
import { dataBR, descreverEmbalagem, formatarCnpj, formatarTelefone, moeda, moedaUnitaria } from "@/modules/deu-sede/domain/formatos";
import { numeroWhatsapp } from "@/modules/deu-sede/domain/whatsapp";

interface Resumo {
  cotacoes: CotacaoResumo[];
  pedidos: PedidoResumo[];
  total_comprado: number;
  qtd_pedidos: number;
  ultima_compra: string | null;
}

export function FornecedorDetalhePage() {
  const { id = "" } = useParams();
  const { dados, erro, fornecedores, produtos, vinculosPorFornecedor } = useCadastros();
  const resumo = useConsulta<Resumo>("resumo_fornecedor", { id });
  const [vinculoAberto, setVinculoAberto] = useState<FornecedorProduto | "novo" | null>(null);
  const [confirmarAtivo, setConfirmarAtivo] = useState(false);

  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;
  const f = fornecedores.get(id);
  if (!f) return <Aviso tom="erro">Fornecedor não encontrado.</Aviso>;

  const vinculos = (vinculosPorFornecedor.get(id) ?? [])
    .slice()
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || (produtos.get(a.produto_id)?.nome ?? "").localeCompare(produtos.get(b.produto_id)?.nome ?? ""));
  const wa = numeroWhatsapp(f.whatsapp);

  return (
    <>
      <PageHeader
        title={f.nome}
        description={f.vendedor ? `Vendedor: ${f.vendedor}` : undefined}
        actions={
          <>
            <LinkBotao to={rota("cotacoes", "nova") + `?fornecedor=${f.id}`}>
              <ClipboardList className="size-4" /> Nova cotação
            </LinkBotao>
            <LinkBotao to={rota("fornecedores", f.id, "editar")} variant="secundario">
              <Pencil className="size-4" /> Editar
            </LinkBotao>
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Indicador rotulo="Total comprado" valor={resumo.dados ? moeda(resumo.dados.total_comprado) : "…"} />
        <Indicador rotulo="Pedidos realizados" valor={resumo.dados ? String(resumo.dados.qtd_pedidos) : "…"} />
        <Indicador rotulo="Última compra" valor={resumo.dados ? dataBR(resumo.dados.ultima_compra) : "…"} />
      </div>

      <div className="grid gap-5">
        <Secao
          titulo="Contato e condições"
          acoes={
            <>
              {wa && (
                <a
                  href={`https://wa.me/${wa}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-linha px-3 text-sm font-medium text-verde hover:bg-offwhite"
                >
                  <MessageCircle className="size-4" /> WhatsApp
                </a>
              )}
              {f.telefone && (
                <a
                  href={`tel:${f.telefone}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-linha px-3 text-sm font-medium text-verde hover:bg-offwhite"
                >
                  <Phone className="size-4" /> Ligar
                </a>
              )}
              <Button variant="contorno" size="sm" onClick={() => setConfirmarAtivo(true)}>
                <Power className="size-4" /> {f.ativo ? "Desativar" : "Reativar"}
              </Button>
            </>
          }
        >
          <Dados
            itens={[
              ["Situação", f.ativo ? <Badge tone="verde">Ativo</Badge> : <Badge tone="perigo">Inativo</Badge>],
              ["WhatsApp", formatarTelefone(f.whatsapp)],
              ["Telefone", formatarTelefone(f.telefone)],
              ["CNPJ", formatarCnpj(f.cnpj)],
              ["E-mail", f.email],
              ["Endereço", f.endereco],
              ["Condições comerciais", f.condicoes_comerciais],
              ["Observações", f.observacoes],
            ]}
          />
        </Secao>

        <Secao
          titulo="Produtos que vende"
          descricao="Preço atual por embalagem e por unidade. Cotações recebidas atualizam esta lista."
          acoes={
            <Button size="sm" onClick={() => setVinculoAberto("novo")}>
              <Plus className="size-4" /> Adicionar produto
            </Button>
          }
          semPadding
        >
          {vinculos.length === 0 ? (
            <p className="px-5 pb-4 text-sm text-texto-suave">Nenhum produto ligado a este fornecedor ainda.</p>
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Embalagem</th>
                  <th className="num">Preço embalagem</th>
                  <th className="num">Por unidade</th>
                  <th>Atualizado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vinculos.map((v) => (
                  <tr key={v.id} className={!v.ativo ? "text-texto-suave" : undefined}>
                    <td>
                      <Link to={rota("produtos", v.produto_id)} className="font-medium text-verde hover:underline">
                        {produtos.get(v.produto_id)?.nome}
                      </Link>
                      {!v.ativo && <span className="ml-2 text-xs">(não vende mais)</span>}
                    </td>
                    <td>{descreverEmbalagem(v.tipo_embalagem, v.unidades_por_embalagem)}</td>
                    <td className="num">{moeda(v.preco_atual)}</td>
                    <td className="num">{moedaUnitaria(v.preco_unitario)}</td>
                    <td className="text-xs text-texto-suave">{v.preco_atualizado_em ? dataBR(v.preco_atualizado_em) : "—"}</td>
                    <td>
                      <Button size="sm" variant="fantasma" onClick={() => setVinculoAberto(v)}>
                        Atualizar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </Secao>

        <div className="grid gap-5 lg:grid-cols-2">
          <Secao titulo="Cotações recebidas" semPadding>
            {resumo.erro && <Aviso tom="erro" className="mx-5 mb-4">{resumo.erro}</Aviso>}
            {(resumo.dados?.cotacoes ?? []).length === 0 ? (
              <p className="px-5 pb-4 text-sm text-texto-suave">Nenhuma cotação deste fornecedor.</p>
            ) : (
              <ul className="divide-y divide-linha">
                {resumo.dados!.cotacoes.map((c) => (
                  <li key={c.id}>
                    <Link to={rota("cotacoes", c.id)} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-offwhite/60">
                      <span>
                        <span className="font-medium text-verde">{c.numero_formatado}</span>{" "}
                        <span className="text-sm text-texto-suave">· {dataBR(c.data_cotacao)} · {moeda(c.valor_total)}</span>
                      </span>
                      <StatusCotacao status={c.status} vencida={c.vencida} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Secao>
          <Secao titulo="Pedidos realizados" semPadding>
            {(resumo.dados?.pedidos ?? []).length === 0 ? (
              <p className="px-5 pb-4 text-sm text-texto-suave">Nenhum pedido para este fornecedor.</p>
            ) : (
              <ul className="divide-y divide-linha">
                {resumo.dados!.pedidos.map((p) => (
                  <li key={p.id}>
                    <Link to={rota("pedidos", p.id)} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-offwhite/60">
                      <span>
                        <span className="font-medium text-verde">{p.numero_formatado}</span>{" "}
                        <span className="text-sm text-texto-suave">· {dataBR(p.data_pedido)} · {moeda(p.valor_total)}</span>
                      </span>
                      <StatusPedido status={p.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Secao>
        </div>
      </div>

      <VinculoDialog
        aberto={vinculoAberto !== null}
        aoFechar={() => setVinculoAberto(null)}
        fornecedorId={f.id}
        vinculo={vinculoAberto === "novo" ? null : vinculoAberto}
      />
      <Confirmar
        aberto={confirmarAtivo}
        titulo={f.ativo ? "Desativar fornecedor?" : "Reativar fornecedor?"}
        mensagem={
          f.ativo
            ? "O fornecedor não aparece mais para novas cotações e pedidos. Todo o histórico continua guardado."
            : "O fornecedor volta a aparecer para novas cotações e pedidos."
        }
        textoConfirmar={f.ativo ? "Desativar" : "Reativar"}
        aoFechar={() => setConfirmarAtivo(false)}
        aoConfirmar={async () => {
          await executar("definir_ativo", { tabela: "fornecedores", id: f.id, ativo: !f.ativo });
        }}
      />
    </>
  );
}

function Indicador({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-linha bg-superficie px-4 py-3">
      <p className="text-xs font-medium tracking-wide text-texto-suave uppercase">{rotulo}</p>
      <p className="mt-1 text-lg font-bold text-verde tabular-nums">{valor}</p>
    </div>
  );
}
