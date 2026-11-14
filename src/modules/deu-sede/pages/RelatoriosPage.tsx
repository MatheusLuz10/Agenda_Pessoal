import { useState } from "react";
import { Link } from "react-router-dom";
import { FileSpreadsheet, FileText } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Button } from "@/modules/deu-sede/components/ui/button";
import { Aviso, Carregando } from "@/modules/deu-sede/components/ui/aviso";
import { Input, Select } from "@/modules/deu-sede/components/ui/input";
import { Segmentado } from "@/modules/deu-sede/components/ui/filtros";
import { Secao, Tabela } from "@/modules/deu-sede/components/ui/secao";
import { StatusPedido } from "@/modules/deu-sede/components/ui/status-badge";
import { FiltroPeriodo } from "@/modules/deu-sede/components/FiltroPeriodo";
import { periodoDoAtalho, type Periodo } from "@/modules/deu-sede/domain/periodo";
import { rota } from "@/modules/deu-sede/config/modules";
import { useConsulta } from "@/modules/deu-sede/data/cliente";
import { useAtrasado, useCadastros } from "@/modules/deu-sede/data/hooks";
import type { Empresa, PedidoResumo } from "@/modules/deu-sede/data/tipos";
import { exportarExcel, exportarPdf, type Relatorio } from "@/modules/deu-sede/exportar";
import { PEDIDO_STATUS, PEDIDO_STATUS_LABEL, type PedidoStatus } from "@/modules/deu-sede/domain/status";
import { dataBR, mesCurto, moeda, moedaUnitaria, numero, percentual } from "@/modules/deu-sede/domain/formatos";

type Aba = "financeiro" | "fornecedores" | "produtos" | "pedidos";

interface Financeiro {
  somente_itens: boolean;
  resumo: {
    total_comprado: number;
    total_itens: number;
    total_fretes: number;
    total_descontos: number;
    total_recebido: number;
    qtd_pedidos: number;
    valor_medio: number;
  };
  por_mes: { mes: string; total_itens: number; pedidos: number; fretes: number; total_pedidos: number }[];
  por_fornecedor: { fornecedor_id: string; fornecedor_nome: string; total: number; fretes: number; descontos: number; pedidos: number }[];
}

interface LinhaFornecedor {
  fornecedor_id: string;
  fornecedor_nome: string;
  ativo: boolean;
  total_comprado: number;
  qtd_pedidos: number;
  ultima_compra: string | null;
  produtos_mais_comprados: string;
  produtos_com_melhor_preco: number;
  variacao_media_pct: number | null;
}

interface LinhaProduto {
  produto_id: string;
  produto_nome: string;
  categoria_nome: string;
  unidades_compradas: number;
  embalagens_compradas: number;
  total_gasto: number;
  ultimo_preco_unitario: number | null;
  menor_preco_unitario: number | null;
  maior_preco_unitario: number | null;
  variacao_pct: number | null;
  melhor_fornecedor: string | null;
  melhor_preco_unitario: number | null;
}

interface RelPedidos {
  por_status: Partial<Record<PedidoStatus, { quantidade: number; valor: number }>>;
  linhas: PedidoResumo[];
}

const FUNCAO = {
  financeiro: "relatorio_financeiro",
  fornecedores: "relatorio_fornecedores",
  produtos: "relatorio_produtos",
  pedidos: "relatorio_pedidos",
} as const;

const TITULO: Record<Aba, string> = {
  financeiro: "Relatório financeiro de compras",
  fornecedores: "Relatório de fornecedores",
  produtos: "Relatório de produtos",
  pedidos: "Relatório de pedidos",
};

export function RelatoriosPage() {
  const { dados: cad, fornecedores, produtos, categorias } = useCadastros();
  const empresa = useConsulta<Empresa | null>("empresa");
  const [aba, setAba] = useState<Aba>("financeiro");
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDoAtalho("mes"));
  const [fornecedorId, setFornecedorId] = useState("");
  const [produtoId, setProdutoId] = useState("");
  const [categoriaId, setCategoriaId] = useState("");
  const [status, setStatus] = useState("");
  const [numeroPedido, setNumeroPedido] = useState("");
  const [exportando, setExportando] = useState<"pdf" | "excel" | null>(null);
  const [erroExportar, setErroExportar] = useState<string | null>(null);
  const numeroAtrasado = useAtrasado(numeroPedido);

  const filtros = {
    de: periodo.de,
    ate: periodo.ate,
    fornecedor_id: fornecedorId || undefined,
    produto_id: produtoId || undefined,
    categoria_id: categoriaId || undefined,
    status: status || undefined,
    numero: numeroAtrasado.trim() || undefined,
  };
  const consulta = useConsulta<unknown>(FUNCAO[aba], filtros);
  const dados = consulta.dados;

  const descricaoFiltros = [
    fornecedorId && `Fornecedor: ${fornecedores.get(fornecedorId)?.nome}`,
    produtoId && `Produto: ${produtos.get(produtoId)?.nome}`,
    categoriaId && `Categoria: ${categorias.get(categoriaId)?.nome}`,
    status && `Status: ${PEDIDO_STATUS_LABEL[status as PedidoStatus]}`,
    numeroAtrasado.trim() && `Pedido: ${numeroAtrasado.trim()}`,
  ].filter(Boolean) as string[];

  function montarRelatorio(): Relatorio | null {
    if (!dados) return null;
    const base = {
      titulo: TITULO[aba],
      empresa: empresa.dados?.nome || "DEU SEDE!",
      periodo: `${dataBR(periodo.de)} a ${dataBR(periodo.ate)}`,
      filtros: descricaoFiltros,
    };
    if (aba === "financeiro") {
      const f = dados as Financeiro;
      return {
        ...base,
        observacao: f.somente_itens ? "Com filtro de produto/categoria: valores somente dos itens filtrados (sem frete)." : undefined,
        resumo: [
          ["Total comprado", moeda(f.resumo.total_comprado)],
          ["Pedidos (compras realizadas)", String(f.resumo.qtd_pedidos)],
          ["Valor médio dos pedidos", moeda(f.resumo.valor_medio)],
          ["Total de fretes", moeda(f.resumo.total_fretes)],
          ["Total de descontos", moeda(f.resumo.total_descontos)],
          ["Valor já recebido", moeda(f.resumo.total_recebido)],
        ],
        tabelas: [
          {
            titulo: "Comparação mensal",
            colunas: [{ titulo: "Mês" }, { titulo: "Pedidos", formato: "numero" }, { titulo: "Produtos", formato: "moeda" }, { titulo: "Fretes", formato: "moeda" }, { titulo: "Total", formato: "moeda" }],
            linhas: f.por_mes.map((m) => [mesCurto(m.mes), m.pedidos, m.total_itens, m.fretes, m.total_pedidos]),
            totais: ["Total", f.resumo.qtd_pedidos, f.resumo.total_itens, f.resumo.total_fretes, f.resumo.total_comprado],
          },
          {
            titulo: "Total por fornecedor",
            colunas: [{ titulo: "Fornecedor" }, { titulo: "Pedidos", formato: "numero" }, { titulo: "Fretes", formato: "moeda" }, { titulo: "Descontos", formato: "moeda" }, { titulo: "Total", formato: "moeda" }],
            linhas: f.por_fornecedor.map((x) => [x.fornecedor_nome, x.pedidos, x.fretes, x.descontos, x.total]),
            totais: ["Total", f.resumo.qtd_pedidos, f.resumo.total_fretes, f.resumo.total_descontos, f.resumo.total_comprado],
          },
        ],
      };
    }
    if (aba === "fornecedores") {
      const l = dados as LinhaFornecedor[];
      return {
        ...base,
        resumo: [["Total comprado no período", moeda(l.reduce((s, x) => s + Number(x.total_comprado), 0))]],
        tabelas: [
          {
            titulo: "Fornecedores",
            colunas: [
              { titulo: "Fornecedor" },
              { titulo: "Situação" },
              { titulo: "Total comprado", formato: "moeda" },
              { titulo: "Pedidos", formato: "numero" },
              { titulo: "Última compra", formato: "data" },
              { titulo: "Mais comprados" },
              { titulo: "Melhor preço em", formato: "numero" },
              { titulo: "Variação de preço", formato: "percentual" },
            ],
            linhas: l.map((x) => [x.fornecedor_nome, x.ativo ? "Ativo" : "Inativo", x.total_comprado, x.qtd_pedidos, x.ultima_compra, x.produtos_mais_comprados || null, x.produtos_com_melhor_preco, x.variacao_media_pct]),
            totais: ["Total", null, l.reduce((s, x) => s + Number(x.total_comprado), 0), l.reduce((s, x) => s + Number(x.qtd_pedidos), 0), null, null, null, null],
          },
        ],
      };
    }
    if (aba === "produtos") {
      const l = dados as LinhaProduto[];
      return {
        ...base,
        resumo: [["Total gasto no período", moeda(l.reduce((s, x) => s + Number(x.total_gasto), 0))]],
        tabelas: [
          {
            titulo: "Produtos",
            colunas: [
              { titulo: "Produto" },
              { titulo: "Categoria" },
              { titulo: "Unidades", formato: "numero" },
              { titulo: "Embalagens", formato: "numero" },
              { titulo: "Total gasto", formato: "moeda" },
              { titulo: "Último preço/un", formato: "moeda4" },
              { titulo: "Menor preço/un", formato: "moeda4" },
              { titulo: "Maior preço/un", formato: "moeda4" },
              { titulo: "Variação", formato: "percentual" },
              { titulo: "Melhor fornecedor" },
              { titulo: "Melhor preço/un", formato: "moeda4" },
            ],
            linhas: l.map((x) => [x.produto_nome, x.categoria_nome, x.unidades_compradas, x.embalagens_compradas, x.total_gasto, x.ultimo_preco_unitario, x.menor_preco_unitario, x.maior_preco_unitario, x.variacao_pct, x.melhor_fornecedor, x.melhor_preco_unitario]),
            totais: ["Total", null, l.reduce((s, x) => s + Number(x.unidades_compradas), 0), l.reduce((s, x) => s + Number(x.embalagens_compradas), 0), l.reduce((s, x) => s + Number(x.total_gasto), 0), null, null, null, null, null, null],
          },
        ],
      };
    }
    const r = dados as RelPedidos;
    return {
      ...base,
      resumo: PEDIDO_STATUS.filter((s) => r.por_status[s]).map((s) => [
        PEDIDO_STATUS_LABEL[s],
        `${r.por_status[s]!.quantidade} · ${moeda(r.por_status[s]!.valor)}`,
      ]),
      tabelas: [
        {
          titulo: "Pedidos",
          colunas: [{ titulo: "Número" }, { titulo: "Data", formato: "data" }, { titulo: "Fornecedor" }, { titulo: "WhatsApp" }, { titulo: "Status" }, { titulo: "Compra realizada" }, { titulo: "Previsão", formato: "data" }, { titulo: "Condição de pagamento" }, { titulo: "Itens", formato: "numero" }, { titulo: "Valor bruto", formato: "moeda" }, { titulo: "Descontos", formato: "moeda" }, { titulo: "Desconto geral", formato: "moeda" }, { titulo: "Frete", formato: "moeda" }, { titulo: "Total", formato: "moeda" }, { titulo: "Recebido", formato: "moeda" }, { titulo: "Pendente", formato: "numero" }, { titulo: "Observações" }, { titulo: "Enviado em", formato: "data" }, { titulo: "Concluído em", formato: "data" }, { titulo: "Cancelado em", formato: "data" }, { titulo: "Motivo do cancelamento" }, { titulo: "Criado em", formato: "data" }],
          linhas: r.linhas.map((p) => [p.numero_formatado, p.data_pedido, p.fornecedor_nome, p.fornecedor_whatsapp, PEDIDO_STATUS_LABEL[p.status], p.compra_realizada ? "Sim" : "Não", p.previsao_entrega, p.condicao_pagamento, p.qtd_itens, p.valor_bruto, p.total_descontos, p.desconto_geral, p.frete, p.valor_total, p.valor_recebido_itens, p.quantidade_pendente, p.observacoes, p.enviado_em, p.concluido_em, p.cancelado_em, p.motivo_cancelamento, p.created_at]),
          totais: ["Total", null, null, null, null, null, null, null, r.linhas.reduce((s, p) => s + Number(p.qtd_itens), 0), r.linhas.reduce((s, p) => s + Number(p.valor_bruto), 0), r.linhas.reduce((s, p) => s + Number(p.total_descontos), 0), r.linhas.reduce((s, p) => s + Number(p.desconto_geral), 0), r.linhas.reduce((s, p) => s + Number(p.frete), 0), r.linhas.reduce((s, p) => s + Number(p.valor_total), 0), r.linhas.reduce((s, p) => s + Number(p.valor_recebido_itens), 0), r.linhas.reduce((s, p) => s + Number(p.quantidade_pendente), 0), null, null, null, null, null, null],
        },
      ],
    };
  }

  async function exportar(tipo: "pdf" | "excel") {
    const rel = montarRelatorio();
    if (!rel) return;
    setExportando(tipo);
    setErroExportar(null);
    try {
      await (tipo === "pdf" ? exportarPdf(rel) : exportarExcel(rel));
    } catch (e) {
      setErroExportar(`Não foi possível exportar: ${(e as Error).message}`);
    } finally {
      setExportando(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Compras realizadas (pedidos enviados ao fornecedor)."
        actions={
          <>
            <Button variant="contorno" onClick={() => exportar("pdf")} disabled={!dados || exportando !== null}>
              <FileText className="size-4" /> {exportando === "pdf" ? "Gerando…" : "PDF"}
            </Button>
            <Button variant="contorno" onClick={() => exportar("excel")} disabled={!dados || exportando !== null}>
              <FileSpreadsheet className="size-4" /> {exportando === "excel" ? "Gerando…" : "Excel"}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3">
        <Segmentado<Aba>
          rotulo="Tipo de relatório"
          valor={aba}
          aoMudar={setAba}
          opcoes={[
            { valor: "financeiro", rotulo: "Financeiro" },
            { valor: "fornecedores", rotulo: "Fornecedores" },
            { valor: "produtos", rotulo: "Produtos" },
            { valor: "pedidos", rotulo: "Pedidos" },
          ]}
        />
        <FiltroPeriodo valor={periodo} aoMudar={setPeriodo} />
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <Select value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} aria-label="Fornecedor">
            <option value="">Todos os fornecedores</option>
            {(cad?.fornecedores ?? []).map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Select>
          <Select value={produtoId} onChange={(e) => setProdutoId(e.target.value)} aria-label="Produto">
            <option value="">Todos os produtos</option>
            {(cad?.produtos ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
          <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} aria-label="Categoria">
            <option value="">Todas as categorias</option>
            {(cad?.categorias ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status do pedido">
            <option value="">Todos os status</option>
            {PEDIDO_STATUS.map((s) => (
              <option key={s} value={s}>
                {PEDIDO_STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Input placeholder="Nº do pedido" aria-label="Número do pedido" value={numeroPedido} onChange={(e) => setNumeroPedido(e.target.value)} />
        </div>
      </div>

      {erroExportar && <Aviso tom="erro" className="mb-4">{erroExportar}</Aviso>}
      {consulta.erro && <Aviso tom="erro">{consulta.erro}</Aviso>}
      {!dados && !consulta.erro && <Carregando />}
      {dados !== undefined && aba === "financeiro" && <VerFinanceiro f={dados as Financeiro} />}
      {dados !== undefined && aba === "fornecedores" && <VerFornecedores linhas={dados as LinhaFornecedor[]} />}
      {dados !== undefined && aba === "produtos" && <VerProdutos linhas={dados as LinhaProduto[]} />}
      {dados !== undefined && aba === "pedidos" && <VerPedidos r={dados as RelPedidos} />}
    </>
  );
}

function Tile({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-linha bg-superficie px-4 py-3">
      <p className="text-xs font-medium tracking-wide text-texto-suave uppercase">{rotulo}</p>
      <p className="mt-1 text-xl font-bold text-verde tabular-nums">{valor}</p>
    </div>
  );
}

function VerFinanceiro({ f }: { f: Financeiro }) {
  if (!f?.resumo) return null;
  return (
    <div className="grid gap-5">
      {f.somente_itens && <Aviso tom="info">Com filtro de produto ou categoria, os valores são só dos itens filtrados (frete não entra).</Aviso>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Tile rotulo="Total comprado" valor={moeda(f.resumo.total_comprado)} />
        <Tile rotulo="Pedidos" valor={String(f.resumo.qtd_pedidos)} />
        <Tile rotulo="Valor médio" valor={moeda(f.resumo.valor_medio)} />
        <Tile rotulo="Fretes" valor={moeda(f.resumo.total_fretes)} />
        <Tile rotulo="Descontos" valor={moeda(f.resumo.total_descontos)} />
        <Tile rotulo="Já recebido" valor={moeda(f.resumo.total_recebido)} />
      </div>
      <Secao titulo="Comparação mensal" semPadding>
        <Tabela>
          <thead>
            <tr>
              <th>Mês</th>
              <th className="num">Pedidos</th>
              <th className="num">Produtos</th>
              <th className="num">Fretes</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {f.por_mes.length === 0 && (
              <tr>
                <td colSpan={5} className="text-texto-suave">Nenhuma compra no período.</td>
              </tr>
            )}
            {f.por_mes.map((m) => (
              <tr key={m.mes}>
                <td>{mesCurto(m.mes)}</td>
                <td className="num">{m.pedidos}</td>
                <td className="num">{moeda(m.total_itens)}</td>
                <td className="num">{moeda(m.fretes)}</td>
                <td className="num font-semibold">{moeda(m.total_pedidos)}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      </Secao>
      <Secao titulo="Total por fornecedor" semPadding>
        <Tabela>
          <thead>
            <tr>
              <th>Fornecedor</th>
              <th className="num">Pedidos</th>
              <th className="num">Fretes</th>
              <th className="num">Descontos</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {f.por_fornecedor.map((x) => (
              <tr key={x.fornecedor_id}>
                <td>
                  <Link to={rota("fornecedores", x.fornecedor_id)} className="font-medium text-verde hover:underline">
                    {x.fornecedor_nome}
                  </Link>
                </td>
                <td className="num">{x.pedidos}</td>
                <td className="num">{moeda(x.fretes)}</td>
                <td className="num">{moeda(x.descontos)}</td>
                <td className="num font-semibold">{moeda(x.total)}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      </Secao>
    </div>
  );
}

function VerFornecedores({ linhas }: { linhas: LinhaFornecedor[] }) {
  if (!Array.isArray(linhas)) return null;
  return (
    <Secao titulo="Fornecedores" descricao="Total comprado, quantidade de pedidos e evolução dos preços no período." semPadding>
      <Tabela>
        <thead>
          <tr>
            <th>Fornecedor</th>
            <th>Situação</th>
            <th className="num">Total comprado</th>
            <th className="num">Pedidos</th>
            <th>Última compra</th>
            <th>Mais comprados</th>
            <th className="num">Melhor preço em</th>
            <th className="num">Variação</th>
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 && (
            <tr>
              <td colSpan={8} className="text-texto-suave">Sem movimento no período.</td>
            </tr>
          )}
          {linhas.map((x) => (
            <tr key={x.fornecedor_id}>
              <td>
                <Link to={rota("fornecedores", x.fornecedor_id)} className="font-medium text-verde hover:underline">
                  {x.fornecedor_nome}
                </Link>
              </td>
              <td>{x.ativo ? "Ativo" : "Inativo"}</td>
              <td className="num font-semibold">{moeda(x.total_comprado)}</td>
              <td className="num">{x.qtd_pedidos}</td>
              <td>{dataBR(x.ultima_compra)}</td>
              <td className="max-w-64 truncate" title={x.produtos_mais_comprados}>{x.produtos_mais_comprados || "—"}</td>
              <td className="num">
                {x.produtos_com_melhor_preco} {x.produtos_com_melhor_preco === 1 ? "produto" : "produtos"}
              </td>
              <td className="num">{percentual(x.variacao_media_pct)}</td>
            </tr>
          ))}
        </tbody>
      </Tabela>
    </Secao>
  );
}

function VerProdutos({ linhas }: { linhas: LinhaProduto[] }) {
  if (!Array.isArray(linhas)) return null;
  return (
    <Secao titulo="Produtos" descricao="Quantidades compradas, faixa de preço por unidade no período e melhor preço atual." semPadding>
      <Tabela>
        <thead>
          <tr>
            <th>Produto</th>
            <th className="num">Unidades</th>
            <th className="num">Embalagens</th>
            <th className="num">Total gasto</th>
            <th className="num">Último/un</th>
            <th className="num">Menor/un</th>
            <th className="num">Maior/un</th>
            <th className="num">Variação</th>
            <th>Melhor fornecedor</th>
            <th className="num">Melhor preço/un</th>
          </tr>
        </thead>
        <tbody>
          {linhas.length === 0 && (
            <tr>
              <td colSpan={10} className="text-texto-suave">Sem movimento no período.</td>
            </tr>
          )}
          {linhas.map((x) => (
            <tr key={x.produto_id}>
              <td>
                <Link to={rota("produtos", x.produto_id)} className="font-medium text-verde hover:underline">
                  {x.produto_nome}
                </Link>
                <span className="block text-xs text-texto-suave">{x.categoria_nome}</span>
              </td>
              <td className="num">{numero(x.unidades_compradas)}</td>
              <td className="num">{numero(x.embalagens_compradas)}</td>
              <td className="num font-semibold">{moeda(x.total_gasto)}</td>
              <td className="num">{moedaUnitaria(x.ultimo_preco_unitario)}</td>
              <td className="num">{moedaUnitaria(x.menor_preco_unitario)}</td>
              <td className="num">{moedaUnitaria(x.maior_preco_unitario)}</td>
              <td className="num">{percentual(x.variacao_pct)}</td>
              <td>{x.melhor_fornecedor ?? "—"}</td>
              <td className="num">{moedaUnitaria(x.melhor_preco_unitario)}</td>
            </tr>
          ))}
        </tbody>
      </Tabela>
    </Secao>
  );
}

function VerPedidos({ r }: { r: RelPedidos }) {
  if (!r?.linhas) return null;
  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {PEDIDO_STATUS.map((s) => (
          <div key={s} className="rounded-xl border border-linha bg-superficie px-4 py-3">
            <p className="text-xs font-medium text-texto-suave">{PEDIDO_STATUS_LABEL[s]}</p>
            <p className="text-xl font-bold text-verde tabular-nums">{r.por_status[s]?.quantidade ?? 0}</p>
            <p className="text-xs text-texto-suave tabular-nums">{moeda(r.por_status[s]?.valor ?? 0)}</p>
          </div>
        ))}
      </div>
      <Secao titulo="Pedidos do período" semPadding>
        <Tabela>
          <thead>
            <tr>
              <th>Número</th>
              <th>Data</th>
              <th>Fornecedor</th>
              <th>Status</th>
              <th className="num">Total</th>
              <th className="num">Recebido</th>
            </tr>
          </thead>
          <tbody>
            {r.linhas.length === 0 && (
              <tr>
                <td colSpan={6} className="text-texto-suave">Nenhum pedido no período.</td>
              </tr>
            )}
            {r.linhas.flatMap((p) => [
              <tr key={p.id}>
                <td>
                  <Link to={rota("pedidos", p.id)} className="font-medium text-verde hover:underline">
                    {p.numero_formatado}
                  </Link>
                </td>
                <td>{dataBR(p.data_pedido)}</td>
                <td>{p.fornecedor_nome}</td>
                <td>
                  <StatusPedido status={p.status} />
                </td>
                <td className="num">{moeda(p.valor_total)}</td>
                <td className="num">{moeda(p.valor_recebido_itens)}</td>
              </tr>,
              <tr key={`${p.id}-detalhes`}>
                <td colSpan={6} className="bg-offwhite/40 text-xs text-texto-suave">
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <span>Previsão: {dataBR(p.previsao_entrega)}</span>
                    <span>Pagamento: {p.condicao_pagamento || "—"}</span>
                    <span>Itens: {p.qtd_itens}</span>
                    <span>Bruto: {moeda(p.valor_bruto)}</span>
                    <span>Descontos: {moeda(p.total_descontos)}</span>
                    <span>Desconto geral: {moeda(p.desconto_geral)}</span>
                    <span>Frete: {moeda(p.frete)}</span>
                    <span>Pendente: {numero(p.quantidade_pendente)}</span>
                    <span>Compra realizada: {p.compra_realizada ? "Sim" : "Não"}</span>
                    {p.fornecedor_whatsapp && <span>WhatsApp: {p.fornecedor_whatsapp}</span>}
                    {p.enviado_em && <span>Enviado: {dataBR(p.enviado_em)}</span>}
                    {p.concluido_em && <span>Concluído: {dataBR(p.concluido_em)}</span>}
                    {p.cancelado_em && <span>Cancelado: {dataBR(p.cancelado_em)}</span>}
                    {p.observacoes && <span>Observações: {p.observacoes}</span>}
                    {p.motivo_cancelamento && <span>Motivo do cancelamento: {p.motivo_cancelamento}</span>}
                    <span>Criado: {dataBR(p.created_at)}</span>
                  </div>
                </td>
              </tr>
            ])}
          </tbody>
        </Tabela>
      </Secao>
    </div>
  );
}
