import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EyeOff, Eye, Package, Pencil, Plus, Trash2, X } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Button, LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Badge } from "@/modules/deu-sede/components/ui/badge";
import { Aviso, Carregando, Vazio } from "@/modules/deu-sede/components/ui/aviso";
import { CampoBusca } from "@/modules/deu-sede/components/ui/filtros";
import { Select } from "@/modules/deu-sede/components/ui/input";
import { Confirmar } from "@/modules/deu-sede/components/ui/dialogo";
import { Planilha } from "@/modules/deu-sede/components/ui/planilha";
import { rota } from "@/modules/deu-sede/config/modules";
import { executar, useConsulta } from "@/modules/deu-sede/data/cliente";
import { useCadastros } from "@/modules/deu-sede/data/hooks";
import type { ItemEstoque, Produto } from "@/modules/deu-sede/data/tipos";
import { contemBusca, descreverEmbalagem, descreverVolume, moedaUnitaria, numero } from "@/modules/deu-sede/domain/formatos";

type FiltroStatus = "ativos" | "inativos" | "todos";
type FiltroEstoque = "todos" | "com" | "sem" | "abaixo";

interface LinhaProduto {
  p: Produto;
  categoria: string;
  estoque: ItemEstoque | undefined;
  menorCusto: number | null;
  fornecedores: number;
}

// Produtos como planilha de aplicativo de estoque: um produto por linha,
// filtros no topo, seleção de vários para excluir/desativar de uma vez e
// editar/excluir direto na linha.
export function ProdutosPage() {
  const navigate = useNavigate();
  const { dados, erro, categorias, vinculosPorProduto } = useCadastros();
  const estoque = useConsulta<ItemEstoque[]>("estoque");
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [status, setStatus] = useState<FiltroStatus>("ativos");
  const [filtroEstoque, setFiltroEstoque] = useState<FiltroEstoque>("todos");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [excluindo, setExcluindo] = useState<string[] | null>(null);
  const [resultado, setResultado] = useState<{ tom: "sucesso" | "atencao"; texto: string } | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const estoquePorProduto = useMemo(() => new Map((estoque.dados ?? []).map((e) => [e.produto_id, e])), [estoque.dados]);

  const todas: LinhaProduto[] = useMemo(
    () =>
      (dados?.produtos ?? []).map((p) => {
        const precos = (vinculosPorProduto.get(p.id) ?? []).filter((v) => v.ativo && v.preco_unitario !== null);
        const e = estoquePorProduto.get(p.id);
        return {
          p,
          categoria: categorias.get(p.categoria_id)?.nome ?? "—",
          estoque: e,
          // menor preço atual entre os fornecedores; sem fornecedor com preço,
          // o custo da última entrada (nota colada ou recebimento)
          menorCusto: precos.length
            ? Math.min(...precos.map((v) => Number(v.preco_unitario)))
            : e?.ultimo_custo_unitario != null
              ? Number(e.ultimo_custo_unitario)
              : null,
          fornecedores: (vinculosPorProduto.get(p.id) ?? []).filter((v) => v.ativo).length,
        };
      }),
    [dados, categorias, vinculosPorProduto, estoquePorProduto],
  );

  const lista = useMemo(
    () =>
      todas.filter(({ p, estoque: e }) => {
        const saldo = Number(e?.saldo_unidades ?? 0);
        return (
          contemBusca(busca, p.nome, p.marca, p.codigo) &&
          (!categoria || p.categoria_id === categoria) &&
          (status === "todos" || p.ativo === (status === "ativos")) &&
          (filtroEstoque === "todos" ||
            (filtroEstoque === "com" && saldo > 0) ||
            (filtroEstoque === "sem" && saldo <= 0) ||
            (filtroEstoque === "abaixo" && !!e?.abaixo_minimo))
        );
      }),
    [todas, busca, categoria, status, filtroEstoque],
  );

  const filtrando = busca !== "" || categoria !== "" || status !== "ativos" || filtroEstoque !== "todos";
  const temMarca = todas.some(({ p }) => p.marca);
  const marcados = todas.filter(({ p }) => selecionados.has(p.id));
  const algumAtivo = marcados.some(({ p }) => p.ativo);

  function limparFiltros() {
    setBusca("");
    setCategoria("");
    setStatus("ativos");
    setFiltroEstoque("todos");
  }

  async function confirmarExclusao() {
    if (!excluindo) return;
    const r = await executar<{ excluidos: string[]; inativados: string[] }>("excluir_produtos", { ids: excluindo });
    const partes: string[] = [];
    if (r.excluidos.length) partes.push(`${r.excluidos.length} ${r.excluidos.length === 1 ? "produto excluído" : "produtos excluídos"}.`);
    if (r.inativados.length)
      partes.push(
        `${r.inativados.length} ${r.inativados.length === 1 ? "foi desativado" : "foram desativados"} porque já ${r.inativados.length === 1 ? "tem" : "têm"} histórico (compras, estoque, vendas ou preço registrado): ${r.inativados.join(", ")}.`,
      );
    setResultado({ tom: r.inativados.length ? "atencao" : "sucesso", texto: partes.join(" ") || "Nada a excluir." });
    setSelecionados(new Set());
    setExcluindo(null);
  }

  async function alternarAtivo() {
    setErroAcao(null);
    const ativo = !algumAtivo;
    try {
      for (const { p } of marcados) {
        if (p.ativo !== ativo) await executar("definir_ativo", { tabela: "produtos", id: p.id, ativo });
      }
      setResultado({ tom: "sucesso", texto: `${marcados.length} ${marcados.length === 1 ? "produto" : "produtos"} ${ativo ? "reativado(s)" : "desativado(s)"}.` });
      setSelecionados(new Set());
    } catch (e) {
      setErroAcao((e as Error).message);
    }
  }

  return (
    <>
      <PageHeader
        title="Produtos"
        description="Cadastro central: um produto por linha, com estoque, custo e preço de venda."
        actions={
          <LinkBotao to={rota("produtos", "novo")}>
            <Plus className="size-4" /> Novo produto
          </LinkBotao>
        }
      />

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!dados && !erro && <Carregando />}

      {dados && dados.produtos.length === 0 && (
        <Vazio icone={Package} titulo="Nenhum produto cadastrado">
          Cadastre os produtos que a DEU SEDE! compra, ou cole a lista de uma nota em Estoque → Entrada por nota.
        </Vazio>
      )}

      {dados && dados.produtos.length > 0 && (
        <div className="grid gap-3">
          {/* Filtros */}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_12rem_10rem_12rem_auto]">
            <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Pesquisar nome, marca ou código" className="sm:col-span-2 lg:col-span-1" />
            <Select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
              <option value="">Todas as categorias</option>
              {dados.categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value as FiltroStatus)} aria-label="Situação">
              <option value="ativos">Ativos</option>
              <option value="inativos">Inativos</option>
              <option value="todos">Ativos e inativos</option>
            </Select>
            <Select value={filtroEstoque} onChange={(e) => setFiltroEstoque(e.target.value as FiltroEstoque)} aria-label="Estoque">
              <option value="todos">Qualquer estoque</option>
              <option value="com">Com estoque</option>
              <option value="sem">Sem estoque</option>
              <option value="abaixo">Abaixo do mínimo</option>
            </Select>
            {filtrando && (
              <Button variant="fantasma" onClick={limparFiltros}>
                <X className="size-4" /> Limpar filtros
              </Button>
            )}
          </div>

          {resultado && <Aviso tom={resultado.tom}>{resultado.texto}</Aviso>}
          {erroAcao && <Aviso tom="erro">{erroAcao}</Aviso>}

          {/* Barra de seleção */}
          {selecionados.size > 0 ? (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amarelo bg-offwhite px-3 py-2" role="region" aria-label="Produtos selecionados">
              <span className="mr-auto font-semibold text-verde">
                {selecionados.size} {selecionados.size === 1 ? "selecionado" : "selecionados"}
              </span>
              {marcados.length === 1 && (
                <LinkBotao to={rota("produtos", marcados[0].p.id, "editar")} variant="contorno" size="sm">
                  <Pencil className="size-4" /> Editar
                </LinkBotao>
              )}
              <Button variant="contorno" size="sm" onClick={alternarAtivo}>
                {algumAtivo ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {algumAtivo ? "Desativar" : "Reativar"}
              </Button>
              <Button variant="perigo" size="sm" onClick={() => { setResultado(null); setExcluindo([...selecionados]); }}>
                <Trash2 className="size-4" /> Excluir
              </Button>
              <Button variant="fantasma" size="sm" onClick={() => setSelecionados(new Set())}>
                Limpar seleção
              </Button>
            </div>
          ) : (
            <p className="text-sm text-texto-suave">
              {lista.length} {lista.length === 1 ? "produto" : "produtos"}
              {lista.length > 0 && " · marque as caixas para editar, desativar ou excluir vários de uma vez"}
            </p>
          )}

          {lista.length === 0 ? (
            <Vazio icone={Package} titulo="Nenhum produto encontrado">
              Mude a busca ou os filtros.
            </Vazio>
          ) : (
            <Planilha<LinhaProduto>
              rotulo="Produtos"
              linhas={lista}
              chave={(l) => l.p.id}
              nomeLinha={(l) => l.p.nome}
              selecionados={selecionados}
              aoSelecionar={setSelecionados}
              aoAbrir={(l) => navigate(rota("produtos", l.p.id))}
              ordemInicial={{ chave: "produto", sentido: 1 }}
              destaqueLinha={(l) => (l.p.ativo ? undefined : "text-texto-suave [&_td]:opacity-80")}
              colunas={[
                {
                  chave: "produto",
                  rotulo: "Produto",
                  fixa: true,
                  larguraMax: "max-w-[9rem] sm:max-w-[20rem]",
                  titulo: (l) => l.p.nome,
                  ordenar: (l) => l.p.nome,
                  celula: (l) => (
                    <Link to={rota("produtos", l.p.id)} onClick={(e) => e.stopPropagation()} className="font-semibold text-verde hover:underline">
                      {l.p.nome}
                    </Link>
                  ),
                },
                { chave: "codigo", rotulo: "Código", ordenar: (l) => l.p.codigo, celula: (l) => l.p.codigo || <span className="text-texto-suave">—</span> },
                { chave: "categoria", rotulo: "Categoria", ordenar: (l) => l.categoria, celula: (l) => l.categoria },
                ...(temMarca
                  ? [{ chave: "marca", rotulo: "Marca", ordenar: (l: LinhaProduto) => l.p.marca, celula: (l: LinhaProduto) => l.p.marca || <span className="text-texto-suave">—</span> }]
                  : []),
                {
                  chave: "volume",
                  rotulo: "Volume",
                  ordenar: (l) => l.p.volume_por_unidade,
                  celula: (l) => descreverVolume(l.p.volume_por_unidade, l.p.unidade_medida) || <span className="text-texto-suave">—</span>,
                },
                {
                  chave: "embalagem",
                  rotulo: "Embalagem",
                  ordenar: (l) => l.p.unidades_por_embalagem,
                  celula: (l) => descreverEmbalagem(l.p.tipo_embalagem, l.p.unidades_por_embalagem),
                },
                {
                  chave: "estoque_un",
                  rotulo: "Estoque un",
                  num: true,
                  ordenar: (l) => Number(l.estoque?.saldo_unidades ?? 0),
                  classe: (l) => (Number(l.estoque?.saldo_unidades ?? 0) < 0 ? "font-semibold text-perigo" : "font-semibold text-verde"),
                  celula: (l) => numero(l.estoque?.saldo_unidades ?? 0),
                },
                {
                  chave: "estoque_emb",
                  rotulo: "Estoque emb.",
                  num: true,
                  ordenar: (l) => Number(l.estoque?.saldo_embalagens ?? 0),
                  celula: (l) => numero(l.estoque?.saldo_embalagens ?? 0, 2),
                },
                {
                  chave: "minimo",
                  rotulo: "Mín. emb.",
                  num: true,
                  ordenar: (l) => l.p.estoque_minimo,
                  celula: (l) =>
                    l.p.estoque_minimo === null ? (
                      <span className="text-texto-suave">—</span>
                    ) : (
                      <span className={l.estoque?.abaixo_minimo ? "font-semibold text-marrom" : undefined}>{numero(l.p.estoque_minimo)}</span>
                    ),
                },
                { chave: "custo", rotulo: "Custo/un", num: true, ordenar: (l) => l.menorCusto, celula: (l) => moedaUnitaria(l.menorCusto) },
                { chave: "venda", rotulo: "Venda/un", num: true, ordenar: (l) => l.p.preco_venda, celula: (l) => moedaUnitaria(l.p.preco_venda) },
                { chave: "fornecedores", rotulo: "Fornec.", num: true, ordenar: (l) => l.fornecedores, celula: (l) => numero(l.fornecedores) },
                {
                  chave: "situacao",
                  rotulo: "Situação",
                  ordenar: (l) => (l.p.ativo ? 1 : 0),
                  celula: (l) => (l.p.ativo ? <span className="text-sucesso">Ativo</span> : <Badge tone="perigo">Inativo</Badge>),
                },
                {
                  chave: "acoes",
                  rotulo: "",
                  fixaDireita: true,
                  celula: (l) => (
                    <span className="flex items-center gap-1">
                      <Link
                        to={rota("produtos", l.p.id, "editar")}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Editar ${l.p.nome}`}
                        title="Editar"
                        className="flex size-9 items-center justify-center rounded-lg text-verde hover:bg-amarelo/30"
                      >
                        <Pencil className="size-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setResultado(null);
                          setExcluindo([l.p.id]);
                        }}
                        aria-label={`Excluir ${l.p.nome}`}
                        title="Excluir"
                        className="flex size-9 items-center justify-center rounded-lg text-perigo hover:bg-perigo/10"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </span>
                  ),
                },
              ]}
              totais={{
                produto: `${lista.length} ${lista.length === 1 ? "produto" : "produtos"}`,
                estoque_un: numero(lista.reduce((s, l) => s + Number(l.estoque?.saldo_unidades ?? 0), 0)),
              }}
            />
          )}
        </div>
      )}

      <Confirmar
        aberto={!!excluindo}
        perigo
        titulo={excluindo && excluindo.length > 1 ? `Excluir ${excluindo.length} produtos?` : "Excluir produto?"}
        mensagem={
          <div className="flex flex-col gap-2">
            {excluindo && excluindo.length <= 5 && (
              <ul className="list-disc pl-5 font-medium text-verde">
                {excluindo.map((id) => (
                  <li key={id}>{todas.find((l) => l.p.id === id)?.p.nome}</li>
                ))}
              </ul>
            )}
            <p>
              Produto que já tem histórico (compras, estoque, vendas ou preço registrado) não pode ser apagado para não perder o passado: ele será
              <strong> desativado</strong> e sai das listas. Os outros são excluídos de vez.
            </p>
          </div>
        }
        textoConfirmar="Excluir"
        aoFechar={() => setExcluindo(null)}
        aoConfirmar={confirmarExclusao}
      />
    </>
  );
}
