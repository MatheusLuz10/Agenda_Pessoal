import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PackagePlus, Warehouse } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Button, LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Badge } from "@/modules/deu-sede/components/ui/badge";
import { Aviso, Carregando, Vazio } from "@/modules/deu-sede/components/ui/aviso";
import { CampoBusca, Segmentado } from "@/modules/deu-sede/components/ui/filtros";
import { Select } from "@/modules/deu-sede/components/ui/input";
import { Planilha } from "@/modules/deu-sede/components/ui/planilha";
import { Tabela } from "@/modules/deu-sede/components/ui/secao";
import { MovimentoEstoqueDialog } from "@/modules/deu-sede/components/MovimentoEstoqueDialog";
import { rota } from "@/modules/deu-sede/config/modules";
import { useConsulta } from "@/modules/deu-sede/data/cliente";
import { useCadastros } from "@/modules/deu-sede/data/hooks";
import type { EntradaNotaResumo, ItemEstoque, MovimentoEstoque } from "@/modules/deu-sede/data/tipos";
import { contemBusca, dataBR, dataHoraBR, descreverEmbalagem, descreverQuantidade, moeda, moedaUnitaria, numero } from "@/modules/deu-sede/domain/formatos";
import { useSenha } from "@/modules/deu-sede/senha";

type Aba = "saldo" | "movimentos" | "entradas";
type Filtro = "com_saldo" | "abaixo" | "todos";

export function EstoquePage() {
  const [aba, setAba] = useState<Aba>("saldo");
  return (
    <>
      <PageHeader
        title="Estoque"
        description="Saldo de cada produto. Entra pelo recebimento de pedidos e pela entrada de notas; sai pelas vendas do PDV e por saídas/ajustes."
        actions={
          <LinkBotao to={rota("estoque", "entrada")}>
            <PackagePlus className="size-4" /> Entrada por nota
          </LinkBotao>
        }
      />
      <div className="mb-4">
        <Segmentado<Aba>
          rotulo="Visão"
          valor={aba}
          aoMudar={setAba}
          opcoes={[
            { valor: "saldo", rotulo: "Saldo" },
            { valor: "movimentos", rotulo: "Movimentações" },
            { valor: "entradas", rotulo: "Entradas por nota" },
          ]}
        />
      </div>
      {aba === "saldo" && <Saldo />}
      {aba === "movimentos" && <Movimentos />}
      {aba === "entradas" && <Entradas />}
    </>
  );
}

function Saldo() {
  const navigate = useNavigate();
  const { dados, erro } = useConsulta<ItemEstoque[]>("estoque");
  const { dados: cad } = useCadastros();
  const { pedirSenha } = useSenha();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("com_saldo");
  const [movendo, setMovendo] = useState<ItemEstoque | null>(null);

  const lista = useMemo(
    () =>
      (dados ?? []).filter(
        (e) =>
          contemBusca(busca, e.produto_nome, e.codigo) &&
          (!categoria || e.categoria_id === categoria) &&
          (filtro === "todos" || (filtro === "abaixo" ? e.abaixo_minimo : Number(e.saldo_unidades) !== 0)),
      ),
    [dados, busca, categoria, filtro],
  );
  const valor = (dados ?? []).reduce((s, e) => s + Number(e.valor_estimado), 0);
  const abaixo = (dados ?? []).filter((e) => e.abaixo_minimo && e.ativo).length;

  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile rotulo="Valor estimado em estoque" valor={moeda(valor)} />
        <Tile rotulo="Produtos com estoque" valor={String(dados.filter((e) => Number(e.saldo_unidades) > 0).length)} />
        <button type="button" onClick={() => setFiltro("abaixo")} className="text-left">
          <Tile rotulo="Abaixo do mínimo" valor={String(abaixo)} alerta={abaixo > 0} />
        </button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Pesquisar produto ou código" className="sm:flex-1" />
        <Select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria" className="sm:w-52">
          <option value="">Todas as categorias</option>
          {(cad?.categorias ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Select>
        <Segmentado<Filtro>
          rotulo="Mostrar"
          valor={filtro}
          aoMudar={setFiltro}
          opcoes={[
            { valor: "com_saldo", rotulo: "Com estoque" },
            { valor: "abaixo", rotulo: "Abaixo do mínimo" },
            { valor: "todos", rotulo: "Todos" },
          ]}
        />
      </div>
      {lista.length === 0 ? (
        <Vazio icone={Warehouse} titulo="Nada para mostrar">
          {filtro === "com_saldo" ? "Nenhum produto com estoque. Registre um recebimento ou uma entrada por nota." : "Mude a busca ou o filtro."}
        </Vazio>
      ) : (
        <Planilha<ItemEstoque>
          rotulo="Saldo de estoque por produto"
          linhas={lista}
          chave={(e) => e.produto_id}
          aoAbrir={(e) => navigate(rota("produtos", e.produto_id))}
          ordemInicial={{ chave: "produto", sentido: 1 }}
          destaqueLinha={(e) => (e.abaixo_minimo ? "[&>td:first-child]:shadow-[inset_4px_0_0_var(--color-amarelo)]" : undefined)}
          colunas={[
            {
              chave: "produto",
              rotulo: "Produto",
              fixa: true,
              larguraMax: "max-w-[11rem] sm:max-w-[20rem]",
              titulo: (e) => e.produto_nome,
              ordenar: (e) => e.produto_nome,
              celula: (e) => (
                <Link to={rota("produtos", e.produto_id)} onClick={(ev) => ev.stopPropagation()} className="font-semibold text-verde hover:underline">
                  {e.produto_nome}
                </Link>
              ),
            },
            { chave: "codigo", rotulo: "Código", ordenar: (e) => e.codigo, celula: (e) => e.codigo || <span className="text-texto-suave">—</span> },
            { chave: "categoria", rotulo: "Categoria", ordenar: (e) => e.categoria_nome, celula: (e) => e.categoria_nome },
            {
              chave: "embalagem",
              rotulo: "Embalagem",
              ordenar: (e) => e.unidades_por_embalagem,
              celula: (e) => descreverEmbalagem(e.tipo_embalagem, e.unidades_por_embalagem),
            },
            {
              chave: "emb",
              rotulo: "Saldo emb.",
              num: true,
              ordenar: (e) => Number(e.saldo_embalagens),
              classe: (e) => (Number(e.saldo_unidades) < 0 ? "font-bold text-perigo" : "font-bold text-verde"),
              celula: (e) => numero(e.saldo_embalagens, 2),
            },
            {
              chave: "un",
              rotulo: "Saldo un",
              num: true,
              ordenar: (e) => Number(e.saldo_unidades),
              classe: (e) => (Number(e.saldo_unidades) < 0 ? "text-perigo" : undefined),
              celula: (e) => numero(e.saldo_unidades),
            },
            {
              chave: "minimo",
              rotulo: "Mínimo emb.",
              num: true,
              ordenar: (e) => e.estoque_minimo,
              celula: (e) => (e.estoque_minimo === null ? <span className="text-texto-suave">—</span> : numero(e.estoque_minimo)),
            },
            { chave: "custo", rotulo: "Últ. custo/un", num: true, ordenar: (e) => e.ultimo_custo_unitario, celula: (e) => moedaUnitaria(e.ultimo_custo_unitario) },
            { chave: "valor", rotulo: "Valor em estoque", num: true, ordenar: (e) => Number(e.valor_estimado), celula: (e) => moeda(e.valor_estimado) },
            { chave: "entrada", rotulo: "Últ. entrada", ordenar: (e) => e.ultima_entrada, celula: (e) => dataBR(e.ultima_entrada) },
            {
              chave: "situacao",
              rotulo: "Situação",
              ordenar: (e) => (Number(e.saldo_unidades) < 0 ? 0 : e.abaixo_minimo ? 1 : Number(e.saldo_unidades) === 0 ? 2 : 3),
              celula: (e) =>
                Number(e.saldo_unidades) < 0 ? (
                  <Badge tone="perigo">Negativo</Badge>
                ) : e.abaixo_minimo ? (
                  <Badge tone="amarelo">Abaixo do mínimo</Badge>
                ) : Number(e.saldo_unidades) === 0 ? (
                  <span className="text-texto-suave">Sem estoque</span>
                ) : (
                  <span className="text-sucesso">OK</span>
                ),
            },
            {
              chave: "acao",
              rotulo: "",
              celula: (e) => (
                <Button
                  size="sm"
                  variant="contorno"
                  onClick={async (ev) => {
                    ev.stopPropagation();
                    if (await pedirSenha("estoque_ajuste")) setMovendo(e);
                  }}
                >
                  Saída / ajuste
                </Button>
              ),
            },
          ]}
          totais={{
            produto: `${lista.length} ${lista.length === 1 ? "produto" : "produtos"}`,
            un: numero(lista.reduce((s, e) => s + Number(e.saldo_unidades), 0)),
            valor: moeda(lista.reduce((s, e) => s + Number(e.valor_estimado), 0)),
          }}
        />
      )}
      {movendo && <MovimentoEstoqueDialog item={movendo} aoFechar={() => setMovendo(null)} />}
    </div>
  );
}

const ORIGEM: Record<MovimentoEstoque["origem"], string> = {
  recebimento: "Recebimento de pedido",
  nota: "Entrada por nota",
  saida_manual: "Saída",
  ajuste_contagem: "Ajuste de contagem",
  estorno_recebimento: "Estorno de recebimento",
  venda: "Venda (PDV)",
  estorno_venda: "Venda cancelada",
};

export function ListaMovimentos({ movimentos, mostrarProduto = true }: { movimentos: MovimentoEstoque[]; mostrarProduto?: boolean }) {
  if (movimentos.length === 0) return <p className="px-5 pb-4 text-sm text-texto-suave">Nenhuma movimentação.</p>;
  return (
    <Tabela>
      <thead>
        <tr>
          <th>Quando</th>
          {mostrarProduto && <th>Produto</th>}
          <th>Origem</th>
          <th className="num">Quantidade</th>
          <th className="num">Saldo depois</th>
        </tr>
      </thead>
      <tbody>
        {movimentos.map((m) => (
          <tr key={m.id}>
            <td className="text-xs">{dataHoraBR(m.created_at)}</td>
            {mostrarProduto && (
              <td>
                <Link to={rota("produtos", m.produto_id)} className="font-medium text-verde hover:underline">
                  {m.produto_nome}
                </Link>
              </td>
            )}
            <td>
              {ORIGEM[m.origem]}{" "}
              {m.pedido_id && (
                <Link to={rota("pedidos", m.pedido_id)} className="text-marrom underline">
                  {m.pedido_numero}
                </Link>
              )}
              {m.nota_entrada_numero && <span className="text-texto-suave">{m.nota_entrada_numero}</span>}
              {m.venda_numero && <span className="text-texto-suave">{m.venda_numero}</span>}
              {m.fornecedor_nome && <span className="block text-xs text-texto-suave">{m.fornecedor_nome}{m.nota_fiscal && ` · NF ${m.nota_fiscal}`}</span>}
              {m.motivo && m.origem !== "venda" && <span className="block text-xs text-texto-suave">{m.motivo}</span>}
            </td>
            <td className={Number(m.quantidade_unidades) < 0 ? "num font-semibold text-perigo" : "num font-semibold text-sucesso"}>
              {Number(m.quantidade_unidades) > 0 ? "+" : ""}
              {numero(m.quantidade_unidades)} un
            </td>
            <td className="num">{descreverQuantidade(m.saldo_apos, m.unidades_por_embalagem, m.tipo_embalagem)}</td>
          </tr>
        ))}
      </tbody>
    </Tabela>
  );
}

function documentoMovimento(m: MovimentoEstoque): string {
  return m.pedido_numero ?? m.nota_entrada_numero ?? m.venda_numero ?? "";
}

function Movimentos() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState("");
  const { dados, erro } = useConsulta<MovimentoEstoque[]>("movimentos_estoque", { limite: 200 });
  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;
  const lista = dados.filter((m) => contemBusca(busca, m.produto_nome, documentoMovimento(m), m.fornecedor_nome, m.motivo, ORIGEM[m.origem]));
  return (
    <div className="grid gap-3">
      <p className="text-sm text-texto-suave">Cada entrada e saída fica registrada para sempre; correções viram um novo ajuste. Últimas 200.</p>
      <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Pesquisar produto, documento, fornecedor ou motivo" />
      {lista.length === 0 ? (
        <Vazio icone={Warehouse} titulo="Nenhuma movimentação">
          {dados.length ? "Mude a busca." : "As entradas e saídas aparecem aqui."}
        </Vazio>
      ) : (
        <Planilha<MovimentoEstoque>
          rotulo="Movimentações de estoque"
          linhas={lista}
          chave={(m) => String(m.id)}
          aoAbrir={(m) => navigate(m.pedido_id ? rota("pedidos", m.pedido_id) : rota("produtos", m.produto_id))}
          ordemInicial={{ chave: "quando", sentido: -1 }}
          colunas={[
            { chave: "quando", rotulo: "Quando", ordenar: (m) => m.created_at, celula: (m) => dataHoraBR(m.created_at) },
            {
              chave: "produto",
              rotulo: "Produto",
              fixa: true,
              larguraMax: "max-w-[11rem] sm:max-w-[18rem]",
              titulo: (m) => m.produto_nome,
              ordenar: (m) => m.produto_nome,
              celula: (m) => <span className="font-medium text-verde">{m.produto_nome}</span>,
            },
            { chave: "origem", rotulo: "Origem", ordenar: (m) => ORIGEM[m.origem], celula: (m) => ORIGEM[m.origem] },
            { chave: "documento", rotulo: "Documento", ordenar: documentoMovimento, celula: (m) => documentoMovimento(m) || <span className="text-texto-suave">—</span> },
            {
              chave: "detalhe",
              rotulo: "Fornecedor / motivo",
              larguraMax: "max-w-[16rem]",
              titulo: (m) => [m.fornecedor_nome, m.nota_fiscal && `NF ${m.nota_fiscal}`, m.origem !== "venda" ? m.motivo : null].filter(Boolean).join(" · "),
              celula: (m) =>
                [m.fornecedor_nome, m.nota_fiscal && `NF ${m.nota_fiscal}`, m.origem !== "venda" ? m.motivo : null].filter(Boolean).join(" · ") || (
                  <span className="text-texto-suave">—</span>
                ),
            },
            {
              chave: "qtd",
              rotulo: "Qtd (un)",
              num: true,
              ordenar: (m) => Number(m.quantidade_unidades),
              classe: (m) => (Number(m.quantidade_unidades) < 0 ? "font-semibold text-perigo" : "font-semibold text-sucesso"),
              celula: (m) => `${Number(m.quantidade_unidades) > 0 ? "+" : ""}${numero(m.quantidade_unidades)}`,
            },
            {
              chave: "saldo",
              rotulo: "Saldo depois",
              num: true,
              ordenar: (m) => Number(m.saldo_apos),
              celula: (m) => descreverQuantidade(m.saldo_apos, m.unidades_por_embalagem, m.tipo_embalagem),
            },
          ]}
        />
      )}
    </div>
  );
}

function Entradas() {
  const { dados, erro } = useConsulta<EntradaNotaResumo[]>("listar_entradas_nota");
  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;
  if (dados.length === 0)
    return (
      <Vazio icone={PackagePlus} titulo="Nenhuma entrada por nota ainda">
        As notas sem pedido (balcão, entrega avulsa) aparecem aqui depois de registradas.
      </Vazio>
    );
  return (
    <Planilha<EntradaNotaResumo>
      rotulo="Entradas por nota (sem pedido)"
      linhas={dados}
      chave={(n) => n.id}
      ordemInicial={{ chave: "data", sentido: -1 }}
      colunas={[
        { chave: "numero", rotulo: "Nº", fixa: true, ordenar: (n) => n.numero_formatado, celula: (n) => <span className="font-semibold text-verde">{n.numero_formatado}</span> },
        { chave: "data", rotulo: "Data", ordenar: (n) => n.data_entrada, celula: (n) => dataBR(n.data_entrada) },
        {
          chave: "fornecedor",
          rotulo: "Fornecedor",
          larguraMax: "max-w-[16rem]",
          titulo: (n) => n.fornecedor_nome ?? "Sem fornecedor",
          ordenar: (n) => n.fornecedor_nome,
          celula: (n) => n.fornecedor_nome ?? <span className="text-texto-suave">Sem fornecedor</span>,
        },
        { chave: "nf", rotulo: "NF", ordenar: (n) => n.numero_nota, celula: (n) => n.numero_nota || <span className="text-texto-suave">—</span> },
        { chave: "itens", rotulo: "Produtos", num: true, ordenar: (n) => n.qtd_itens, celula: (n) => numero(n.qtd_itens) },
        { chave: "total", rotulo: "Total", num: true, ordenar: (n) => Number(n.total), celula: (n) => moeda(n.total) },
      ]}
      totais={{
        numero: `${dados.length} ${dados.length === 1 ? "nota" : "notas"}`,
        total: moeda(dados.reduce((s, n) => s + Number(n.total), 0)),
      }}
    />
  );
}

function Tile({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className={alerta ? "rounded-xl border border-amarelo bg-amarelo/15 px-4 py-3" : "rounded-xl border border-linha bg-superficie px-4 py-3"}>
      <p className="text-xs font-medium tracking-wide text-texto-suave uppercase">{rotulo}</p>
      <p className="mt-1 text-xl font-bold text-verde tabular-nums">{valor}</p>
    </div>
  );
}
