import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, EyeOff, Eye, Package, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Button, LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Aviso, Carregando, Vazio } from "@/modules/deu-sede/components/ui/aviso";
import { CampoBusca } from "@/modules/deu-sede/components/ui/filtros";
import { Campo, Input, Select } from "@/modules/deu-sede/components/ui/input";
import { Confirmar } from "@/modules/deu-sede/components/ui/dialogo";
import { BotaoColarLista, ColarListaDialog, type CandidatoLista, type LinhaAplicada } from "@/modules/deu-sede/components/ColarListaDialog";
import { rota } from "@/modules/deu-sede/config/modules";
import { chamar, executar, invalidar, useConsulta } from "@/modules/deu-sede/data/cliente";
import { useCadastros } from "@/modules/deu-sede/data/hooks";
import { cadastrarProdutosNovos } from "@/modules/deu-sede/data/produtosNovos";
import type { Cadastros, Embalagem, ItemEstoque, Produto } from "@/modules/deu-sede/data/tipos";
import { arredondar, contemBusca, descreverEmbalagem, descreverVolume, lerDecimal, moeda, moedaUnitaria, numero } from "@/modules/deu-sede/domain/formatos";
import { cn } from "@/lib/utils";

type FiltroStatus = "ativos" | "inativos" | "todos";
type FiltroEstoque = "todos" | "com" | "sem" | "abaixo";

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
// Caixas de marcar para desativar/excluir vários de uma vez. "Colar lista"
// cadastra produtos e guarda o preço do fornecedor (sem mexer no estoque).
export function ProdutosPage() {
  const { dados, erro, categorias, fornecedores, vinculosPorProduto } = useCadastros();
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
  const [colar, setColar] = useState(false);
  const [fornecedorEscolhido, setFornecedorLista] = useState("");
  const [precificando, setPrecificando] = useState(false);
  const [margem, setMargem] = useState("30");

  const estoquePorProduto = useMemo(() => new Map((estoque.dados ?? []).map((e) => [e.produto_id, e])), [estoque.dados]);

  const todas: LinhaProduto[] = useMemo(
    () =>
      (dados?.produtos ?? [])
        .map((p) => {
          const precos = (vinculosPorProduto.get(p.id) ?? []).filter((v) => v.ativo && v.preco_unitario !== null);
          const e = estoquePorProduto.get(p.id);
          const melhor = precos.length ? precos.reduce((a, b) => (Number(b.preco_unitario) < Number(a.preco_unitario) ? b : a)) : null;
          const custoUn = melhor ? Number(melhor.preco_unitario) : e?.ultimo_custo_unitario != null ? Number(e.ultimo_custo_unitario) : null;
          const embalagemCusto = melhor
            ? { tipo: melhor.tipo_embalagem, unidades: melhor.unidades_por_embalagem }
            : { tipo: p.tipo_embalagem, unidades: p.unidades_por_embalagem };
          return {
            p,
            categoria: categorias.get(p.categoria_id)?.nome ?? "—",
            estoque: e,
            // menor preço atual entre os fornecedores; sem fornecedor com preço,
            // o custo da última entrada (nota colada ou recebimento)
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

  // Fornecedor da lista colada: com um só fornecedor ativo, já vem escolhido.
  const fornecedoresAtivos = (dados?.fornecedores ?? []).filter((f) => f.ativo);
  const fornecedorLista = fornecedorEscolhido || (fornecedoresAtivos.length === 1 ? fornecedoresAtivos[0].id : "");

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

  // Preço de venda dos marcados = custo por unidade + margem (%). Produto sem
  // custo (sem preço de fornecedor nem entrada) fica de fora e é avisado.
  async function aplicarMargem() {
    const m = lerDecimal(margem);
    if (m === null || Number.isNaN(m) || m < 0) throw new Error("Informe a margem em % (ex.: 30).");
    let feitos = 0;
    const semCusto: string[] = [];
    try {
      for (const l of marcados) {
        if (l.menorCusto === null) {
          semCusto.push(l.p.nome);
          continue;
        }
        await chamar("salvar_produto", { ...l.p, preco_venda: arredondar(l.menorCusto * (1 + m / 100)), preco_venda_embalagem: null });
        feitos++;
      }
    } finally {
      invalidar();
    }
    const fora = semCusto.length
      ? ` Ficaram de fora ${semCusto.length} sem custo: ${semCusto.slice(0, 5).join(", ")}${semCusto.length > 5 ? "…" : ""}.`
      : "";
    setResultado({ tom: semCusto.length ? "atencao" : "sucesso", texto: `${feitos} ${feitos === 1 ? "preço de venda definido" : "preços de venda definidos"} (custo + ${numero(m)}%).${fora}` });
    setSelecionados(new Set());
    setPrecificando(false);
  }

  // Lista de preços colada: cadastra o que não existe e guarda o preço de
  // cada linha como preço atual do fornecedor (o Montar pedido usa esse
  // preço). Não mexe no estoque.
  async function aplicarLista(itens: LinhaAplicada[]) {
    if (!fornecedorLista) throw new Error("Escolha o fornecedor da lista.");
    const embalagens = itens.map((it) =>
      it.embalagem ?? (it.novo ? { tipo: it.novo.tipo_embalagem as Embalagem, unidades: it.novo.unidades_por_embalagem } : null),
    );
    const novos = itens.filter((it) => it.novo).length;
    const prontos = await cadastrarProdutosNovos(itens);
    const cad = await chamar<Cadastros>("cadastros");
    let precos = 0;
    try {
      for (let i = 0; i < prontos.length; i++) {
        const it = prontos[i];
        const prod = cad.produtos.find((x) => x.id === it.candidatoId);
        if (!prod || it.valorUnitario === null) continue;
        const emb = embalagens[i] ?? { tipo: prod.tipo_embalagem, unidades: prod.unidades_por_embalagem };
        const v = cad.fornecedor_produtos.find(
          (x) => x.fornecedor_id === fornecedorLista && x.produto_id === prod.id && x.tipo_embalagem === emb.tipo && x.unidades_por_embalagem === emb.unidades,
        );
        await chamar("salvar_fornecedor_produto", {
          id: v?.id,
          fornecedor_id: fornecedorLista,
          produto_id: prod.id,
          codigo_no_fornecedor: v?.codigo_no_fornecedor ?? null,
          tipo_embalagem: emb.tipo,
          unidades_por_embalagem: emb.unidades,
          preco_atual: it.valorUnitario,
          ativo: true,
        });
        precos++;
      }
    } finally {
      invalidar();
    }
    const nomeForn = fornecedores.get(fornecedorLista)?.nome ?? "fornecedor";
    setResultado({
      tom: "sucesso",
      texto: `${novos} ${novos === 1 ? "produto novo cadastrado" : "produtos novos cadastrados"} e ${precos} ${precos === 1 ? "preço guardado" : "preços guardados"} para ${nomeForn}.`,
    });
  }

  const candidatos: CandidatoLista[] = (dados?.produtos ?? [])
    .filter((p) => p.ativo)
    .map((p) => {
      const v = (vinculosPorProduto.get(p.id) ?? []).find((x) => x.fornecedor_id === fornecedorLista && x.ativo);
      return {
        id: p.id,
        nome: p.nome,
        rotulo: p.nome,
        codigos: [p.codigo, v?.codigo_no_fornecedor],
        unidadesPorEmbalagem: v?.unidades_por_embalagem ?? p.unidades_por_embalagem,
        precoReferencia: v?.preco_atual ?? null,
      };
    });

  return (
    <>
      <PageHeader
        title="Produtos"
        description="Toque no produto para ver tudo. Cole a lista de preços do fornecedor para cadastrar de uma vez."
        actions={
          <>
            <BotaoColarLista aoClicar={() => setColar(true)} />
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
          Toque em “Colar lista” para cadastrar os produtos com os preços do fornecedor, ou em “Novo produto”.
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
              <Button variant="contorno" size="sm" onClick={() => setPrecificando(true)}>
                <Tag className="size-4" /> Preço de venda
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
                <span className="w-24 text-right sm:w-28">Custo</span>
                <span className="w-5" />
              </div>
              <ul className="divide-y divide-linha">
                {lista.map((l) => {
                  const { p } = l;
                  const aberto = abertos.has(p.id);
                  const saldo = Number(l.estoque?.saldo_unidades ?? 0);
                  return (
                    <li key={p.id} className={cn(selecionados.has(p.id) && "bg-offwhite")}>
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <input
                          type="checkbox"
                          className="size-5 shrink-0 accent-verde"
                          aria-label={`Selecionar ${p.nome}`}
                          checked={selecionados.has(p.id)}
                          onChange={() => setSelecionados((s) => alternar(s, p.id))}
                        />
                        <button
                          type="button"
                          aria-expanded={aberto}
                          aria-label={`${p.nome}: ${aberto ? "esconder" : "ver"} informações`}
                          onClick={() => setAbertos((s) => alternar(s, p.id))}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
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
                          <span className="w-24 shrink-0 text-right tabular-nums sm:w-28">
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
                          <ChevronDown className={cn("size-5 shrink-0 text-texto-suave transition-transform", aberto && "rotate-180")} />
                        </button>
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
                                  `Venda ${descreverEmbalagem(p.tipo_embalagem, p.unidades_por_embalagem).toLowerCase()}`,
                                  p.preco_venda_embalagem !== null
                                    ? moeda(p.preco_venda_embalagem)
                                    : p.preco_venda !== null
                                      ? moeda(arredondar(Number(p.preco_venda) * p.unidades_por_embalagem))
                                      : "—",
                                ],
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

      <ColarListaDialog
        aberto={colar}
        titulo="Colar lista de preços"
        explicacao="Cole a lista do fornecedor (por exemplo, gerada por IA a partir da foto). Os produtos que não existirem são cadastrados e o preço de cada linha fica guardado como preço do fornecedor. O estoque não muda."
        topo={
          fornecedoresAtivos.length === 0 ? (
            <Aviso tom="atencao">
              Para guardar os preços, cadastre antes o fornecedor.{" "}
              <Link to={rota("fornecedores", "novo")} className="font-semibold underline">
                Cadastrar fornecedor
              </Link>
            </Aviso>
          ) : (
            <Campo rotulo="Fornecedor da lista" obrigatorio>
              {(id) => (
                <Select id={id} value={fornecedorLista} onChange={(e) => setFornecedorLista(e.target.value)}>
                  <option value="">Escolha…</option>
                  {fornecedoresAtivos.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </Select>
              )}
            </Campo>
          )
        }
        candidatos={candidatos}
        categoriasNovos={dados?.categorias}
        rotuloReferencia="Preço atual"
        aoFechar={() => setColar(false)}
        aoAplicar={aplicarLista}
      />
      <Confirmar
        aberto={precificando}
        titulo={`Preço de venda de ${marcados.length} ${marcados.length === 1 ? "produto" : "produtos"}`}
        mensagem={
          <div className="flex flex-col gap-3">
            <p>O preço de venda por unidade (usado no PDV) vira o custo por unidade mais a margem.</p>
            <Campo rotulo="Margem sobre o custo (%)">
              {(id) => <Input id={id} inputMode="decimal" value={margem} onChange={(e) => setMargem(e.target.value)} className="w-32" />}
            </Campo>
            {(() => {
              const ex = marcados.find((l) => l.menorCusto !== null);
              const m = lerDecimal(margem);
              if (!ex || m === null || Number.isNaN(m)) return null;
              return (
                <p className="text-sm text-texto-suave">
                  Ex.: {ex.p.nome}: custo {moedaUnitaria(ex.menorCusto)}/un + {numero(m)}% = <strong className="text-verde">{moeda(arredondar(ex.menorCusto! * (1 + m / 100)))}/un</strong>
                </p>
              );
            })()}
            {marcados.some((l) => l.menorCusto === null) && (
              <p className="text-sm text-marrom">
                {marcados.filter((l) => l.menorCusto === null).length} sem custo ficam de fora (cole a lista de preços do fornecedor antes).
              </p>
            )}
          </div>
        }
        textoConfirmar="Definir preços"
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
