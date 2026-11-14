import { useMemo, useState } from "react";
import { ChevronDown, EyeOff, Eye, Package, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Button, LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Aviso, Carregando, Vazio } from "@/modules/deu-sede/components/ui/aviso";
import { CampoBusca } from "@/modules/deu-sede/components/ui/filtros";
import { Campo, Input, Interruptor, Select } from "@/modules/deu-sede/components/ui/input";
import { Confirmar } from "@/modules/deu-sede/components/ui/dialogo";
import { PrecoVendaDialogo } from "@/modules/deu-sede/components/PrecoVendaDialogo";
import { rota } from "@/modules/deu-sede/config/modules";
import { chamar, executar, invalidar, useConsulta } from "@/modules/deu-sede/data/cliente";
import { useCadastros } from "@/modules/deu-sede/data/hooks";
import type { Embalagem, ItemEstoque, Produto } from "@/modules/deu-sede/data/tipos";
import { arredondar, contemBusca, descreverEmbalagem, descreverVolume, lerDecimal, moeda, moedaUnitaria, numero } from "@/modules/deu-sede/domain/formatos";
import { cn } from "@/lib/utils";

type FiltroStatus = "ativos" | "inativos" | "todos";
type FiltroEstoque = "todos" | "com" | "sem" | "abaixo";
/** Onde a margem de venda é aplicada: todos os ativos, uma categoria ou os marcados. */
type EscopoMargem = "todos" | "categoria" | "selecionados";

const semPrecoDeVenda = (p: Produto) => p.preco_venda === null && p.preco_venda_embalagem === null;

/** Venda da embalagem fechada: o preço próprio dela ou unidade × quantidade. */
function vendaEmbalagem(p: Produto): number | null {
  if (p.preco_venda_embalagem !== null) return Number(p.preco_venda_embalagem);
  return p.preco_venda === null ? null : arredondar(Number(p.preco_venda) * p.unidades_por_embalagem);
}

/** Margem atual sobre o custo (%), ou null sem preço de venda ou sem custo. */
function margemAtual(p: Produto, custoUn: number | null): number | null {
  if (p.preco_venda === null || custoUn === null || custoUn <= 0) return null;
  return (Number(p.preco_venda) / custoUn - 1) * 100;
}

interface LinhaProduto {
  p: Produto;
  categoria: string;
  estoque: ItemEstoque | undefined;
  /** custo por unidade (valor da embalagem ÷ unidades) */
  menorCusto: number | null;
  /** custo da embalagem e qual embalagem (a do preço do fornecedor ou a do produto) */
  custoEmbalagem: number | null;
  embalagemCusto: { tipo: Embalagem; unidades: number };
  fornecedores: number;
}

// "CX", "FD", "PCT"… para o custo da embalagem na linha.
function rotuloEmbalagemCurto(tipo: Embalagem): string {
  return ({ caixa: "cx", fardo: "fd", pack: "pct", engradado: "eng", garrafao: "gf", unidade: "un" } as Record<string, string>)[tipo] ?? tipo;
}

// Produtos em lista enxuta (nome, código, estoque e custo), sem rolagem
// lateral: tocar no produto abre o resto das informações e as ações.
// Caixas de marcar para desativar/excluir vários de uma vez. "sem preço"
// abre o preço de venda ali mesmo. (O "Colar lista" fica só na entrada de
// estoque: Entrada por nota e Conferir entrega.)
export function ProdutosPage() {
  const { dados, erro, categorias, vinculosPorProduto } = useCadastros();
  const estoque = useConsulta<ItemEstoque[]>("estoque");
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [status, setStatus] = useState<FiltroStatus>("ativos");
  const [filtroEstoque, setFiltroEstoque] = useState<FiltroEstoque>("todos");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [excluindo, setExcluindo] = useState<string[] | null>(null);
  const [resultado, setResultado] = useState<{ tom: "sucesso" | "atencao"; texto: string } | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  // produto do "sem preço" tocado: abre o preço de venda rápido
  const [precoDe, setPrecoDe] = useState<LinhaProduto | null>(null);
  const [precificando, setPrecificando] = useState(false);
  const [margem, setMargem] = useState("30");
  const [escopoMargem, setEscopoMargem] = useState<EscopoMargem>("todos");
  const [categoriaMargem, setCategoriaMargem] = useState("");
  const [soSemPreco, setSoSemPreco] = useState(false);

  const estoquePorProduto = useMemo(() => new Map((estoque.dados ?? []).map((e) => [e.produto_id, e])), [estoque.dados]);

  const todas: LinhaProduto[] = useMemo(
    () =>
      (dados?.produtos ?? [])
        .map((p) => {
          const precos = (vinculosPorProduto.get(p.id) ?? []).filter((v) => v.ativo && v.preco_unitario !== null);
          const e = estoquePorProduto.get(p.id);
          const melhor = precos.length ? precos.reduce((a, b) => (Number(b.preco_unitario) < Number(a.preco_unitario) ? b : a)) : null;
          const custoUn = melhor
            ? Number(melhor.preco_unitario)
            : e?.ultimo_custo_unitario != null
              ? Number(e.ultimo_custo_unitario)
              : p.custo_referencia != null
                ? Number(p.custo_referencia)
                : null;
          const embalagemCusto = melhor
            ? { tipo: melhor.tipo_embalagem, unidades: melhor.unidades_por_embalagem }
            : { tipo: p.tipo_embalagem, unidades: p.unidades_por_embalagem };
          return {
            p,
            categoria: categorias.get(p.categoria_id)?.nome ?? "—",
            estoque: e,
            // menor preço atual entre os fornecedores; sem fornecedor com preço,
            // o custo da última entrada (nota colada ou recebimento); sem ela,
            // o preço de custo do cadastro
            menorCusto: custoUn,
            custoEmbalagem: melhor?.preco_atual != null ? Number(melhor.preco_atual) : custoUn === null ? null : arredondar(custoUn * embalagemCusto.unidades),
            embalagemCusto,
            fornecedores: (vinculosPorProduto.get(p.id) ?? []).filter((v) => v.ativo).length,
          };
        })
        .sort((a, b) => a.p.nome.localeCompare(b.p.nome, "pt-BR")),
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
  const marcados = todas.filter(({ p }) => selecionados.has(p.id));
  const algumAtivo = marcados.some(({ p }) => p.ativo);
  const todosMarcados = lista.length > 0 && lista.every(({ p }) => selecionados.has(p.id));

  function limparFiltros() {
    setBusca("");
    setCategoria("");
    setStatus("ativos");
    setFiltroEstoque("todos");
  }

  const alternar = (conjunto: Set<string>, id: string) => {
    const novo = new Set(conjunto);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    return novo;
  };

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

  // Margem de venda: preço de venda por unidade = custo por unidade + margem
  // (%), em todos os produtos ativos, numa categoria ou nos marcados. Produto
  // sem custo (sem preço de fornecedor nem entrada) fica de fora e é avisado.
  const alvoMargem = (
    escopoMargem === "selecionados"
      ? marcados
      : todas.filter((l) => l.p.ativo && (escopoMargem === "todos" || (!!categoriaMargem && l.p.categoria_id === categoriaMargem)))
  ).filter((l) => !soSemPreco || semPrecoDeVenda(l.p));
  const alvoComCusto = alvoMargem.filter((l) => l.menorCusto !== null);
  const alvoSemCusto = alvoMargem.filter((l) => l.menorCusto === null);
  const alvoTrocaPreco = alvoComCusto.filter((l) => !semPrecoDeVenda(l.p)).length;

  function abrirMargem(escopo: EscopoMargem) {
    setResultado(null);
    setEscopoMargem(escopo);
    if (escopo === "categoria" && !categoriaMargem) setCategoriaMargem(categoria);
    setPrecificando(true);
  }

  async function aplicarMargem() {
    const m = lerDecimal(margem);
    if (m === null || Number.isNaN(m) || m < 0) throw new Error("Informe a margem em % (ex.: 30).");
    if (escopoMargem === "categoria" && !categoriaMargem) throw new Error("Escolha a categoria.");
    if (alvoComCusto.length === 0) throw new Error("Nenhum produto com custo para calcular o preço.");
    let feitos = 0;
    try {
      // alguns de cada vez, para não demorar com centenas de produtos
      for (let i = 0; i < alvoComCusto.length; i += 6) {
        await Promise.all(
          alvoComCusto.slice(i, i + 6).map(async (l) => {
            await chamar("salvar_produto", { ...l.p, preco_venda: arredondar(l.menorCusto! * (1 + m / 100)), preco_venda_embalagem: null });
            feitos++;
          }),
        );
      }
    } finally {
      invalidar();
    }
    const onde =
      escopoMargem === "categoria" ? ` na categoria ${categorias.get(categoriaMargem)?.nome ?? ""}` : escopoMargem === "todos" ? " em todos os produtos ativos" : "";
    const fora = alvoSemCusto.length
      ? ` Ficaram de fora ${alvoSemCusto.length} sem custo: ${alvoSemCusto
          .slice(0, 5)
          .map((l) => l.p.nome)
          .join(", ")}${alvoSemCusto.length > 5 ? "…" : ""}.`
      : "";
    setResultado({
      tom: alvoSemCusto.length ? "atencao" : "sucesso",
      texto: `Margem de ${numero(m)}% aplicada${onde}: ${feitos} ${feitos === 1 ? "preço de venda definido" : "preços de venda definidos"}.${fora}`,
    });
    if (escopoMargem === "selecionados") setSelecionados(new Set());
    setPrecificando(false);
  }

  return (
    <>
      <PageHeader
        title="Produtos"
        description="Toque no produto para ver tudo. Em “sem preço”, toque para definir o preço de venda."
        actions={
          <>
            {!!dados?.produtos.length && (
              <Button variant="contorno" onClick={() => abrirMargem(selecionados.size ? "selecionados" : categoria ? "categoria" : "todos")}>
                <Tag className="size-4" /> Margem de venda
              </Button>
            )}
            <LinkBotao to={rota("produtos", "novo")}>
              <Plus className="size-4" /> Novo produto
            </LinkBotao>
          </>
        }
      />

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!dados && !erro && <Carregando />}
      {resultado && dados?.produtos.length === 0 && <Aviso tom={resultado.tom}>{resultado.texto}</Aviso>}

      {dados && dados.produtos.length === 0 && (
        <Vazio icone={Package} titulo="Nenhum produto cadastrado">
          Toque em “Novo produto”, ou dê entrada de uma nota em Estoque → Entrada por nota: os produtos que não existirem são cadastrados na hora.
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
              <Button variant="contorno" size="sm" onClick={() => abrirMargem("selecionados")}>
                <Tag className="size-4" /> Margem de venda
              </Button>
              <Button variant="contorno" size="sm" onClick={alternarAtivo}>
                {algumAtivo ? <EyeOff className="size-4" /> : <Eye className="size-4" />} {algumAtivo ? "Desativar" : "Reativar"}
              </Button>
              <Button
                variant="perigo"
                size="sm"
                onClick={() => {
                  setResultado(null);
                  setExcluindo([...selecionados]);
                }}
              >
                <Trash2 className="size-4" /> Excluir
              </Button>
              <Button variant="fantasma" size="sm" onClick={() => setSelecionados(new Set())}>
                Limpar seleção
              </Button>
            </div>
          ) : (
            <p className="text-sm text-texto-suave">
              {lista.length} {lista.length === 1 ? "produto" : "produtos"}
            </p>
          )}

          {lista.length === 0 ? (
            <Vazio icone={Package} titulo="Nenhum produto encontrado">
              Mude a busca ou os filtros.
            </Vazio>
          ) : (
            <div className="overflow-hidden rounded-xl border border-linha bg-superficie">
              <div className="flex items-center gap-3 border-b border-linha bg-fundo px-3 py-2 text-xs font-semibold tracking-wide text-texto-suave uppercase">
                <input
                  type="checkbox"
                  className="size-5 shrink-0 accent-verde"
                  aria-label="Selecionar todos os produtos da lista"
                  checked={todosMarcados}
                  onChange={() => setSelecionados(todosMarcados ? new Set() : new Set(lista.map(({ p }) => p.id)))}
                />
                <span className="flex-1">Produto</span>
                <span className="hidden w-20 text-right sm:block">Estoque</span>
                <span className="hidden w-28 text-right sm:block">Custo</span>
                <span className="w-24 text-right sm:w-28">Venda</span>
                <span className="w-5" />
              </div>
              <ul className="divide-y divide-linha">
                {lista.map((l) => {
                  const { p } = l;
                  const aberto = abertos.has(p.id);
                  const saldo = Number(l.estoque?.saldo_unidades ?? 0);
                  return (
                    <li key={p.id} className={cn(selecionados.has(p.id) && "bg-offwhite")}>
                      {/* A linha toda abre as informações (botão por baixo do
                          conteúdo); a caixa de marcar e o "sem preço" ficam por
                          cima e respondem ao toque deles. */}
                      <div className="relative flex items-center gap-3 px-3 py-2.5">
                        <button
                          type="button"
                          aria-expanded={aberto}
                          aria-label={`${p.nome}: ${aberto ? "esconder" : "ver"} informações`}
                          onClick={() => setAbertos((s) => alternar(s, p.id))}
                          className="absolute inset-0 w-full"
                        />
                        <input
                          type="checkbox"
                          className="relative size-5 shrink-0 accent-verde"
                          aria-label={`Selecionar ${p.nome}`}
                          checked={selecionados.has(p.id)}
                          onChange={() => setSelecionados((s) => alternar(s, p.id))}
                        />
                        <span className="pointer-events-none flex min-w-0 flex-1 items-center gap-3 text-left">
                          <span className="min-w-0 flex-1">
                            <span className={cn("block font-semibold break-words", p.ativo ? "text-verde" : "text-texto-suave")}>{p.nome}</span>
                            <span className="block text-xs text-texto-suave">
                              {[p.codigo, descreverEmbalagem(p.tipo_embalagem, p.unidades_por_embalagem), !p.ativo && "Inativo"].filter(Boolean).join(" · ")}
                              <span className="sm:hidden"> · estoque {numero(saldo)} un</span>
                            </span>
                          </span>
                          <span className={cn("hidden w-20 shrink-0 text-right font-semibold tabular-nums sm:block", saldo < 0 ? "text-perigo" : "text-verde")}>
                            {numero(saldo)} <span className="text-xs font-normal text-texto-suave">un</span>
                          </span>
                          <span className="hidden w-28 shrink-0 text-right tabular-nums sm:block">
                            <span className="block font-semibold text-verde">
                              {moedaUnitaria(l.menorCusto)}
                              {l.menorCusto !== null && <span className="text-xs font-normal text-texto-suave">/un</span>}
                            </span>
                            {l.custoEmbalagem !== null && l.embalagemCusto.unidades > 1 && (
                              <span className="block text-xs text-texto-suave">
                                {moeda(l.custoEmbalagem)}/{rotuloEmbalagemCurto(l.embalagemCusto.tipo)} {l.embalagemCusto.unidades}
                              </span>
                            )}
                          </span>
                          {(() => {
                            const vendaEmb = vendaEmbalagem(p);
                            return (
                              <span className="w-24 shrink-0 text-right tabular-nums sm:w-28">
                                {p.preco_venda !== null ? (
                                  <span className="block font-semibold text-verde">
                                    {moeda(p.preco_venda)}
                                    <span className="text-xs font-normal text-texto-suave">/un</span>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setPrecoDe(l)}
                                    aria-label={`Definir o preço de venda de ${p.nome}`}
                                    title="Definir o preço de venda"
                                    className="pointer-events-auto relative inline-flex h-8 items-center gap-1 rounded-lg border border-amarelo bg-amarelo/15 px-2 text-xs font-semibold text-marrom hover:bg-amarelo/30"
                                  >
                                    <Pencil className="size-3.5 shrink-0" /> sem preço
                                  </button>
                                )}
                                {vendaEmb !== null && p.unidades_por_embalagem > 1 && (
                                  <span className="hidden text-xs text-texto-suave sm:block">
                                    {moeda(vendaEmb)}/{rotuloEmbalagemCurto(p.tipo_embalagem)} {p.unidades_por_embalagem}
                                  </span>
                                )}
                                {/* no celular o custo fica embaixo da venda (sem coluna própria) */}
                                <span className="block text-xs text-texto-suave sm:hidden">custo {moedaUnitaria(l.menorCusto)}</span>
                              </span>
                            );
                          })()}
                          <ChevronDown className={cn("size-5 shrink-0 text-texto-suave transition-transform", aberto && "rotate-180")} />
                        </span>
                      </div>
                      {aberto && (
                        <div className="border-t border-linha/60 bg-fundo px-3 py-3 sm:pl-11">
                          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                            {(
                              [
                                ["Categoria", l.categoria],
                                ["Marca", p.marca || "—"],
                                ["Volume", descreverVolume(p.volume_por_unidade, p.unidade_medida) || "—"],
                                ["Embalagem", descreverEmbalagem(p.tipo_embalagem, p.unidades_por_embalagem)],
                                ["Estoque", `${numero(saldo)} un · ${numero(l.estoque?.saldo_embalagens ?? 0, 2)} emb.`],
                                ["Mínimo", p.estoque_minimo === null ? "—" : `${numero(p.estoque_minimo)} emb.${l.estoque?.abaixo_minimo ? " (abaixo)" : ""}`],
                                [
                                  `Custo ${descreverEmbalagem(l.embalagemCusto.tipo, l.embalagemCusto.unidades).toLowerCase()}`,
                                  l.custoEmbalagem === null ? "—" : moeda(l.custoEmbalagem),
                                ],
                                ["Custo por unidade", l.menorCusto === null ? "—" : `${moedaUnitaria(l.menorCusto)}${l.embalagemCusto.unidades > 1 ? ` (÷ ${l.embalagemCusto.unidades})` : ""}`],
                                ["Venda por unidade", moedaUnitaria(p.preco_venda)],
                                [
                                  "Margem",
                                  (() => {
                                    const mg = margemAtual(p, l.menorCusto);
                                    // inteiro: o preço vai a centavos, então 25% pode voltar como 25,07%
                                    return mg === null ? "—" : `${numero(mg, 0)}%`;
                                  })(),
                                ],
                                [`Venda ${descreverEmbalagem(p.tipo_embalagem, p.unidades_por_embalagem).toLowerCase()}`, moeda(vendaEmbalagem(p))],
                                ["Fornecedores", numero(l.fornecedores)],
                                ["Situação", p.ativo ? "Ativo" : "Inativo"],
                              ] as const
                            ).map(([rotulo, valor]) => (
                              <div key={rotulo} className="min-w-0">
                                <dt className="text-xs text-texto-suave">{rotulo}</dt>
                                <dd className="font-medium break-words text-verde">{valor}</dd>
                              </div>
                            ))}
                          </dl>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <LinkBotao to={rota("produtos", p.id)} variant="contorno" size="sm">
                              Ver tudo
                            </LinkBotao>
                            <LinkBotao to={rota("produtos", p.id, "editar")} variant="contorno" size="sm">
                              <Pencil className="size-4" /> Editar
                            </LinkBotao>
                            <Button
                              variant="fantasma"
                              size="sm"
                              className="text-perigo"
                              onClick={() => {
                                setResultado(null);
                                setExcluindo([p.id]);
                              }}
                            >
                              <Trash2 className="size-4" /> Excluir
                            </Button>
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      <PrecoVendaDialogo
        produto={precoDe?.p ?? null}
        custoUnitario={precoDe?.menorCusto ?? null}
        aoFechar={() => setPrecoDe(null)}
        aoSalvar={(p) => setResultado({ tom: "sucesso", texto: `Preço de venda de ${p.nome}: ${moeda(p.preco_venda)} por unidade.` })}
      />
      <Confirmar
        aberto={precificando}
        titulo="Margem de venda"
        mensagem={
          <div className="flex flex-col gap-3">
            <p>O preço de venda por unidade (usado no PDV) vira o custo por unidade mais a margem.</p>
            <Campo rotulo="Aplicar em">
              {(id) => (
                <Select id={id} value={escopoMargem} onChange={(e) => setEscopoMargem(e.target.value as EscopoMargem)}>
                  <option value="todos">Todos os produtos ativos</option>
                  <option value="categoria">Uma categoria</option>
                  {marcados.length > 0 && (
                    <option value="selecionados">
                      {marcados.length} {marcados.length === 1 ? "produto selecionado" : "produtos selecionados"}
                    </option>
                  )}
                </Select>
              )}
            </Campo>
            {escopoMargem === "categoria" && (
              <Campo rotulo="Categoria">
                {(id) => (
                  <Select id={id} value={categoriaMargem} onChange={(e) => setCategoriaMargem(e.target.value)}>
                    <option value="">Escolha…</option>
                    {(dados?.categorias ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </Select>
                )}
              </Campo>
            )}
            <Campo rotulo="Margem sobre o custo (%)">
              {(id) => <Input id={id} inputMode="decimal" value={margem} onChange={(e) => setMargem(e.target.value)} className="w-32" />}
            </Campo>
            <Interruptor ligado={soSemPreco} aoMudar={setSoSemPreco} rotulo="Só nos produtos sem preço de venda" />
            {(() => {
              const ex = alvoComCusto[0];
              const m = lerDecimal(margem);
              if (!ex || m === null || Number.isNaN(m)) return null;
              return (
                <p className="text-sm text-texto-suave">
                  Ex.: {ex.p.nome}: custo {moedaUnitaria(ex.menorCusto)}/un + {numero(m)}% = <strong className="text-verde">{moeda(arredondar(ex.menorCusto! * (1 + m / 100)))}/un</strong>
                </p>
              );
            })()}
            {(escopoMargem !== "categoria" || categoriaMargem) && (
              <p className="text-sm font-medium text-verde">
                {alvoComCusto.length} {alvoComCusto.length === 1 ? "produto recebe" : "produtos recebem"} o preço
                {alvoTrocaPreco > 0 && ` (${alvoTrocaPreco} já ${alvoTrocaPreco === 1 ? "tinha preço e será trocado" : "tinham preço e serão trocados"})`}.
              </p>
            )}
            {alvoSemCusto.length > 0 && (
              <p className="text-sm text-marrom">
                {alvoSemCusto.length} sem custo {alvoSemCusto.length === 1 ? "fica" : "ficam"} de fora (dê entrada da nota ou informe o preço de custo no produto antes).
              </p>
            )}
          </div>
        }
        textoConfirmar="Aplicar margem"
        aoFechar={() => setPrecificando(false)}
        aoConfirmar={aplicarMargem}
      />
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
