import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Pencil, Plus, Power } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Button, LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Badge } from "@/modules/deu-sede/components/ui/badge";
import { Aviso, Carregando } from "@/modules/deu-sede/components/ui/aviso";
import { Confirmar } from "@/modules/deu-sede/components/ui/dialogo";
import { Dados, Secao, Tabela } from "@/modules/deu-sede/components/ui/secao";
import { StatusPedido } from "@/modules/deu-sede/components/ui/status-badge";
import { VinculoDialog } from "@/modules/deu-sede/components/VinculoDialog";
import { GraficoPrecos } from "@/modules/deu-sede/components/GraficoPrecos";
import { rota } from "@/modules/deu-sede/config/modules";
import { executar, useConsulta } from "@/modules/deu-sede/data/cliente";
import { useCadastros } from "@/modules/deu-sede/data/hooks";
import type { FornecedorProduto, HistoricoPreco } from "@/modules/deu-sede/data/tipos";
import type { PedidoStatus } from "@/modules/deu-sede/domain/status";
import {
  dataBR,
  dataHoraBR,
  descreverEmbalagem,
  descreverVolume,
  moeda,
  moedaUnitaria,
  numero,
} from "@/modules/deu-sede/domain/formatos";

const ORIGEM: Record<FornecedorProduto["preco_origem"], string> = { manual: "manual", cotacao: "cotação", nota: "nota fiscal" };
// de onde veio cada preço do histórico ("cotação": das cotações, que saíram do app)
const ORIGEM_HISTORICO: Record<HistoricoPreco["origem"], string> = {
  manual: "Atualização manual",
  nota: "Nota fiscal (recebimento)",
  pedido: "Pedido",
  cotacao: "Cotação",
};

interface Movimentos {
  pedidos: {
    pedido_id: string;
    numero_formatado: string;
    data_pedido: string;
    status: PedidoStatus;
    fornecedor_nome: string;
    quantidade_embalagens: number;
    tipo_embalagem: FornecedorProduto["tipo_embalagem"];
    unidades_por_embalagem: number;
    preco_unitario: number;
    subtotal: number;
  }[];
}

export function ProdutoDetalhePage() {
  const { id = "" } = useParams();
  const { dados, erro, produtos, categorias, fornecedores, vinculosPorProduto } = useCadastros();
  const historico = useConsulta<HistoricoPreco[]>("historico_produto", { produto_id: id });
  const movimentos = useConsulta<Movimentos>("movimentos_produto", { id });
  const [vinculoAberto, setVinculoAberto] = useState<FornecedorProduto | "novo" | null>(null);
  const [confirmarAtivo, setConfirmarAtivo] = useState(false);

  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;
  const produto = produtos.get(id);
  if (!produto) return <Aviso tom="erro">Produto não encontrado.</Aviso>;

  const vinculos = (vinculosPorProduto.get(id) ?? [])
    .slice()
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || (a.preco_unitario ?? Infinity) - (b.preco_unitario ?? Infinity));
  const comPreco = vinculos.filter((v) => v.ativo && v.preco_unitario !== null && fornecedores.get(v.fornecedor_id)?.ativo);
  const menor = comPreco.length ? Math.min(...comPreco.map((v) => Number(v.preco_unitario))) : null;

  return (
    <>
      <PageHeader
        title={produto.nome}
        description={[produto.marca, descreverVolume(produto.volume_por_unidade, produto.unidade_medida)].filter(Boolean).join(" · ")}
        actions={
          <>
            <LinkBotao to={rota("produtos", produto.id, "editar")} variant="secundario">
              <Pencil className="size-4" /> Editar
            </LinkBotao>
          </>
        }
      />

      <div className="grid gap-5">
        <Secao
          titulo="Dados do produto"
          acoes={
            <Button variant="contorno" size="sm" onClick={() => setConfirmarAtivo(true)}>
              <Power className="size-4" /> {produto.ativo ? "Desativar" : "Reativar"}
            </Button>
          }
        >
          <Dados
            itens={[
              ["Situação", produto.ativo ? <Badge tone="verde">Ativo</Badge> : <Badge tone="perigo">Inativo</Badge>],
              ["Categoria", categorias.get(produto.categoria_id)?.nome],
              ["Embalagem padrão", descreverEmbalagem(produto.tipo_embalagem, produto.unidades_por_embalagem)],
              ["Volume / peso", descreverVolume(produto.volume_por_unidade, produto.unidade_medida)],
              ["Código", produto.codigo],
              ["Marca", produto.marca],
              ["Observações", produto.observacoes],
              ["Atualizado em", dataHoraBR(produto.updated_at)],
            ]}
          />
        </Secao>

        <Secao
          titulo="Fornecedores que vendem"
          descricao="Preço atual de cada fornecedor, comparado por unidade."
          acoes={
            <Button size="sm" onClick={() => setVinculoAberto("novo")}>
              <Plus className="size-4" /> Adicionar fornecedor
            </Button>
          }
          semPadding
        >
          {vinculos.length === 0 ? (
            <p className="px-5 pb-4 text-sm text-texto-suave">
              Nenhum fornecedor ligado a este produto ainda. Use “Adicionar fornecedor” ou dê entrada de uma nota com fornecedor.
            </p>
          ) : (
            <Tabela>
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th>Embalagem</th>
                  <th className="num">Preço embalagem</th>
                  <th className="num">Preço por unidade</th>
                  <th>Atualizado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {vinculos.map((v) => {
                  const f = fornecedores.get(v.fornecedor_id);
                  const melhor = menor !== null && v.ativo && Number(v.preco_unitario) === menor;
                  return (
                    <tr key={v.id} className={!v.ativo ? "text-texto-suave" : undefined}>
                      <td>
                        <Link to={rota("fornecedores", v.fornecedor_id)} className="font-medium text-verde underline-offset-2 hover:underline">
                          {f?.nome}
                        </Link>
                        {!v.ativo && <span className="ml-2 text-xs">(não vende mais)</span>}
                      </td>
                      <td>{descreverEmbalagem(v.tipo_embalagem, v.unidades_por_embalagem)}</td>
                      <td className="num">{moeda(v.preco_atual)}</td>
                      <td className="num">
                        {moedaUnitaria(v.preco_unitario)} {melhor && <Badge tone="verde">Menor preço</Badge>}
                      </td>
                      <td className="text-xs text-texto-suave">
                        {v.preco_atualizado_em ? `${dataBR(v.preco_atualizado_em)} · ${ORIGEM[v.preco_origem]}` : "—"}
                      </td>
                      <td>
                        <Button size="sm" variant="fantasma" onClick={() => setVinculoAberto(v)}>
                          Atualizar
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabela>
          )}
        </Secao>

        <Secao titulo="Histórico de preços" descricao="Cada mudança de preço atual (manual ou por nota) fica registrada para sempre.">
          {historico.erro && <Aviso tom="erro">{historico.erro}</Aviso>}
          {!historico.dados && !historico.erro && <Carregando />}
          {historico.dados && historico.dados.length === 0 && <p className="text-sm text-texto-suave">Nenhum preço registrado ainda.</p>}
          {historico.dados && historico.dados.length > 0 && (
            <div className="flex flex-col gap-5">
              <GraficoPrecos historico={historico.dados} />
              <Tabela>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Fornecedor</th>
                    <th>Origem</th>
                    <th>Embalagem</th>
                    <th className="num">Preço embalagem</th>
                    <th className="num">Preço por unidade</th>
                  </tr>
                </thead>
                <tbody>
                  {historico.dados.map((h) => (
                    <tr key={h.id}>
                      <td>{dataBR(h.data_referencia)}</td>
                      <td>{h.fornecedor_nome}</td>
                      <td>{ORIGEM_HISTORICO[h.origem] ?? h.origem}</td>
                      <td>{descreverEmbalagem(h.tipo_embalagem, h.unidades_por_embalagem)}</td>
                      <td className="num">{moeda(h.preco_embalagem)}</td>
                      <td className="num">{moedaUnitaria(h.preco_unitario)}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            </div>
          )}
        </Secao>

        <div className="grid gap-5">
          <Secao titulo="Pedidos com este produto" semPadding>
            {(movimentos.dados?.pedidos ?? []).length === 0 ? (
              <p className="px-5 pb-4 text-sm text-texto-suave">Nenhum pedido ainda.</p>
            ) : (
              <ul className="divide-y divide-linha">
                {movimentos.dados!.pedidos.map((p) => (
                  <li key={p.pedido_id + p.tipo_embalagem + p.unidades_por_embalagem}>
                    <Link to={rota("pedidos", p.pedido_id)} className="flex flex-col gap-1 px-5 py-3 hover:bg-offwhite/60">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-verde">
                          {p.numero_formatado} · {p.fornecedor_nome}
                        </span>
                        <StatusPedido status={p.status} />
                      </span>
                      <span className="text-sm text-texto-suave">
                        {dataBR(p.data_pedido)} · {numero(p.quantidade_embalagens)} ×{" "}
                        {descreverEmbalagem(p.tipo_embalagem, p.unidades_por_embalagem)} · {moeda(p.subtotal)}
                      </span>
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
        produtoId={produto.id}
        vinculo={vinculoAberto === "novo" ? null : vinculoAberto}
      />
      <Confirmar
        aberto={confirmarAtivo}
        titulo={produto.ativo ? "Desativar produto?" : "Reativar produto?"}
        mensagem={
          produto.ativo
            ? "O produto deixa de aparecer nos novos pedidos. O histórico continua guardado e você pode reativar quando quiser."
            : "O produto volta a aparecer nos novos pedidos."
        }
        textoConfirmar={produto.ativo ? "Desativar" : "Reativar"}
        aoFechar={() => setConfirmarAtivo(false)}
        aoConfirmar={async () => {
          await executar("definir_ativo", { tabela: "produtos", id: produto.id, ativo: !produto.ativo });
        }}
      />
    </>
  );
}
