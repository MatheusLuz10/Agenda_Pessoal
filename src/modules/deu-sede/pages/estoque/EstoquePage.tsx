import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, PackagePlus, Warehouse } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Button, LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Aviso, Carregando, Vazio } from "@/modules/deu-sede/components/ui/aviso";
import { CampoBusca, Segmentado } from "@/modules/deu-sede/components/ui/filtros";
import { Select } from "@/modules/deu-sede/components/ui/input";
import { Planilha } from "@/modules/deu-sede/components/ui/planilha";
import { Secao, Tabela } from "@/modules/deu-sede/components/ui/secao";
import { MovimentoEstoqueDialog } from "@/modules/deu-sede/components/MovimentoEstoqueDialog";
import { NotaEntradaDialogo } from "@/modules/deu-sede/components/NotaEntradaDialogo";
import { rota } from "@/modules/deu-sede/config/modules";
import { useConsulta } from "@/modules/deu-sede/data/cliente";
import { useCadastros } from "@/modules/deu-sede/data/hooks";
import type { EntradaNotaResumo, ItemEstoque, MovimentoEstoque } from "@/modules/deu-sede/data/tipos";
import { contemBusca, dataBR, dataHoraBR, descreverEmbalagem, descreverQuantidade, moeda, moedaUnitaria, numero } from "@/modules/deu-sede/domain/formatos";
import { useSenha } from "@/modules/deu-sede/senha";
import { cn } from "@/lib/utils";

type Aba = "saldo" | "movimentos" | "entradas" | "registrar";
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
            { valor: "registrar", rotulo: "Entrada / saída" },
            { valor: "entradas", rotulo: "Entradas por nota" },
          ]}
        />
      </div>
      {aba === "saldo" && <Saldo />}
      {aba === "movimentos" && <Movimentos />}
      {aba === "registrar" && <RegistrarMovimentacao />}
      {aba === "entradas" && <Entradas />}
    </>
  );
}

function RegistrarMovimentacao() {
  const { dados, erro } = useConsulta<ItemEstoque[]>("estoque");
  const { pedirSenha } = useSenha();
  const [produtoId, setProdutoId] = useState("");
  const [movendo, setMovendo] = useState<ItemEstoque | null>(null);
  const produto = dados?.find((e) => e.produto_id === produtoId) ?? null;

  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;

  return (
    <div className="grid max-w-2xl gap-4 rounded-xl border border-linha bg-superficie p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-bold text-verde">Registrar entrada ou saída</h2>
        <p className="mt-1 text-sm text-texto-suave">Escolha o produto e informe a quantidade. O movimento ficará no histórico e atualizará o saldo.</p>
      </div>
      <Select value={produtoId} onChange={(e) => setProdutoId(e.target.value)} aria-label="Produto">
        <option value="">Selecione um produto</option>
        {dados.filter((e) => e.ativo).sort((a, b) => a.produto_nome.localeCompare(b.produto_nome, "pt-BR")).map((e) => (
          <option key={e.produto_id} value={e.produto_id}>{e.produto_nome}</option>
        ))}
      </Select>
      {produto && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-offwhite/60 p-3">
          <div>
            <p className="font-semibold text-verde">Saldo atual</p>
            <p className="text-sm text-texto-suave">{descreverQuantidade(produto.saldo_unidades, produto.unidades_por_embalagem, produto.tipo_embalagem)}</p>
          </div>
          <Button onClick={async () => { if (await pedirSenha("estoque_ajuste")) setMovendo(produto); }}>
            Entrada / saída
          </Button>
        </div>
      )}
      <Secao titulo="Movimentos recentes" semPadding>
        <MovimentosDoProduto produtoId={produtoId} />
      </Secao>
      {movendo && <MovimentoEstoqueDialog item={movendo} aoFechar={() => setMovendo(null)} />}
    </div>
  );
}

function MovimentosDoProduto({ produtoId }: { produtoId: string }) {
  const { dados, erro } = useConsulta<MovimentoEstoque[]>("movimentos_estoque", { limite: 200 });
  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;
  return <ListaMovimentos movimentos={dados.filter((m) => !produtoId || m.produto_id === produtoId).slice(0, 20)} />;
}

const alternar = (conjunto: Set<string>, id: string) => {
  const novo = new Set(conjunto);
  if (novo.has(id)) novo.delete(id);
  else novo.add(id);
  return novo;
};

function Saldo() {
  const { dados, erro } = useConsulta<ItemEstoque[]>("estoque");
  const { dados: cad } = useCadastros();
  const { pedirSenha } = useSenha();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("com_saldo");
  const [movendo, setMovendo] = useState<ItemEstoque | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

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
        // lista enxuta (sem rolagem para o lado): tocar no produto mostra o resto
        <div className="overflow-hidden rounded-xl border border-linha bg-superficie">
          <div className="flex items-center gap-3 border-b border-linha bg-fundo px-3 py-2 text-xs font-semibold tracking-wide text-texto-suave uppercase">
            <span className="flex-1">Produto</span>
            <span className="text-right">Saldo</span>
            <span className="w-5" />
          </div>
          <ul className="divide-y divide-linha" aria-label="Saldo de estoque por produto">
            {lista
              .slice()
              .sort((a, b) => a.produto_nome.localeCompare(b.produto_nome, "pt-BR"))
              .map((e) => {
                const aberto = abertos.has(e.produto_id);
                const saldo = Number(e.saldo_unidades);
                const situacao = saldo < 0 ? "negativo" : e.abaixo_minimo ? "abaixo" : saldo === 0 ? "zerado" : "ok";
                return (
                  <li
                    key={e.produto_id}
                    className={cn(situacao === "abaixo" && "shadow-[inset_4px_0_0_var(--color-amarelo)]", situacao === "negativo" && "shadow-[inset_4px_0_0_var(--color-perigo)]")}
                  >
                    <button
                      type="button"
                      aria-expanded={aberto}
                      aria-label={`${e.produto_nome}: ${aberto ? "esconder" : "ver"} informações`}
                      onClick={() => setAbertos((x) => alternar(x, e.produto_id))}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold break-words text-verde">{e.produto_nome}</span>
                        <span className="block text-xs text-texto-suave">
                          {[e.codigo, descreverEmbalagem(e.tipo_embalagem, e.unidades_por_embalagem)].filter(Boolean).join(" · ")}
                          {situacao === "abaixo" && <span className="font-semibold text-marrom"> · abaixo do mínimo</span>}
                          {situacao === "negativo" && <span className="font-semibold text-perigo"> · negativo</span>}
                        </span>
                      </span>
                      <span className="shrink-0 text-right tabular-nums">
                        <span className={cn("block font-bold", saldo < 0 ? "text-perigo" : saldo === 0 ? "text-texto-suave" : "text-verde")}>
                          {descreverQuantidade(e.saldo_unidades, e.unidades_por_embalagem, e.tipo_embalagem)}
                        </span>
                        {e.unidades_por_embalagem > 1 && saldo !== 0 && <span className="block text-xs text-texto-suave">{numero(saldo)} un</span>}
                      </span>
                      <ChevronDown className={cn("size-5 shrink-0 text-texto-suave transition-transform", aberto && "rotate-180")} />
                    </button>
                    {aberto && (
                      <div className="border-t border-linha/60 bg-fundo px-3 py-3">
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                          {(
                            [
                              ["Categoria", e.categoria_nome],
                              ["Saldo em unidades", `${numero(saldo)} un`],
                              ["Mínimo", e.estoque_minimo === null ? "—" : `${numero(e.estoque_minimo)} emb.`],
                              ["Último custo/un", moedaUnitaria(e.ultimo_custo_unitario)],
                              ["Valor em estoque", moeda(e.valor_estimado)],
                              ["Última entrada", dataBR(e.ultima_entrada)],
                              ["Situação", situacao === "negativo" ? "Negativo" : situacao === "abaixo" ? "Abaixo do mínimo" : situacao === "zerado" ? "Sem estoque" : "OK"],
                            ] as const
                          ).map(([rotulo, valor]) => (
                            <div key={rotulo} className="min-w-0">
                              <dt className="text-xs text-texto-suave">{rotulo}</dt>
                              <dd className="font-medium break-words text-verde">{valor}</dd>
                            </div>
                          ))}
                        </dl>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="contorno"
                            onClick={async () => {
                              if (await pedirSenha("estoque_ajuste")) setMovendo(e);
                            }}
                          >
                            Entrada / saída
                          </Button>
                          <LinkBotao to={rota("produtos", e.produto_id)} variant="contorno" size="sm">
                            Ver produto
                          </LinkBotao>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
          </ul>
          <p className="border-t border-linha bg-fundo px-3 py-2 text-sm text-texto-suave">
            {lista.length} {lista.length === 1 ? "produto" : "produtos"} · {numero(lista.reduce((s, e) => s + Number(e.saldo_unidades), 0))} un ·{" "}
            {moeda(lista.reduce((s, e) => s + Number(e.valor_estimado), 0))}
          </p>
        </div>
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
  entrada_manual: "Entrada manual",
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
  const [aberta, setAberta] = useState<string | null>(null);
  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;
  if (dados.length === 0)
    return (
      <Vazio icone={PackagePlus} titulo="Nenhuma entrada por nota ainda">
        As notas sem pedido (balcão, entrega avulsa) aparecem aqui depois de registradas.
      </Vazio>
    );
  return (
    <>
    <p className="mb-2 text-sm text-texto-suave">Toque numa nota para ver os produtos, as quantidades e a lista colada.</p>
    <Planilha<EntradaNotaResumo>
      rotulo="Entradas por nota (sem pedido)"
      linhas={dados}
      chave={(n) => n.id}
      aoAbrir={(n) => setAberta(n.id)}
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
    <NotaEntradaDialogo id={aberta} aoFechar={() => setAberta(null)} />
    </>
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
