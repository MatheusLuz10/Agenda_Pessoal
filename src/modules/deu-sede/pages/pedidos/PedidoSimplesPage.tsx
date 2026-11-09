import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CircleCheck, ClipboardCopy, FileDown, List, MessageCircle, Minus, Plus, ShoppingCart, X } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Button, LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Aviso, Carregando, Vazio } from "@/modules/deu-sede/components/ui/aviso";
import { Campo, Input, Select, Textarea } from "@/modules/deu-sede/components/ui/input";
import { CampoBusca } from "@/modules/deu-sede/components/ui/filtros";
import { Confirmar } from "@/modules/deu-sede/components/ui/dialogo";
import { Secao } from "@/modules/deu-sede/components/ui/secao";
import { rota } from "@/modules/deu-sede/config/modules";
import { chamar, executar, useConsulta } from "@/modules/deu-sede/data/cliente";
import { useCadastros, useEnvio } from "@/modules/deu-sede/data/hooks";
import type { ContaPagar, Embalagem, ItemEstoque, Oferta, PainelFinanceiro, PedidoDetalhe, PedidoResumo, Produto } from "@/modules/deu-sede/data/tipos";
import { arredondar, contemBusca, dataBR, descreverEmbalagem, lerDecimal, moeda, paraCampo } from "@/modules/deu-sede/domain/formatos";
import { erroEscolha, escolhaInicial, payloadEscolha } from "@/modules/deu-sede/domain/financeiro";
import { EscolhaPagamentoCampos } from "@/modules/deu-sede/components/EscolhaPagamento";
import { useSoPedidos } from "@/modules/deu-sede/soPedidos";
import { registrarAtividade } from "@/modules/deu-sede/data/atividades";
import { linkWhatsapp, mensagemPedido, numeroWhatsapp } from "@/modules/deu-sede/domain/whatsapp";
import { gerarPdfPedido } from "@/modules/deu-sede/pedidoPdf";
import { cn } from "@/lib/utils";

// Valor de partida de cada produto para o fornecedor escolhido: preço atual
// do fornecedor > cotação válida dele > custo da última entrada (nota).
interface Base {
  tipo: Embalagem;
  unidades: number;
  preco: number | null;
  origem: string;
  cotacao_item_id?: string;
}

interface Marcado {
  qtd: string;
  /** valor digitado; sem ele vale o valor de partida */
  preco?: string;
}

interface Rascunho {
  fornecedorId: string;
  marcados: Record<string, Marcado>;
  observacoes: string;
}

const CHAVE = "deusede:pedido-simples";

function lerRascunho(): Rascunho {
  try {
    const r = JSON.parse(localStorage.getItem(CHAVE) ?? "null") as Rascunho | null;
    if (r && typeof r.marcados === "object") return { fornecedorId: r.fornecedorId ?? "", marcados: r.marcados, observacoes: r.observacoes ?? "" };
  } catch {
    /* sem rascunho */
  }
  return { fornecedorId: "", marcados: {}, observacoes: "" };
}

// Montar pedido: escolhe o fornecedor, marca os produtos na lista (nome,
// valor e total), e "Realizar pedido" gera o pedido com a lista para o
// WhatsApp e o PDF.
export function PedidoSimplesPage() {
  const { dados: cad, fornecedores, vinculosPorFornecedor, erro } = useCadastros();
  const ofertas = useConsulta<Oferta[]>("ofertas_comparacao");
  const estoque = useConsulta<ItemEstoque[]>("estoque");
  const [rascunho, setRascunho] = useState<Rascunho>(lerRascunho);
  const [busca, setBusca] = useState("");
  const [soMarcados, setSoMarcados] = useState(false);
  const [lote, setLote] = useState(() => crypto.randomUUID());
  const [confirmar, setConfirmar] = useState(false);
  const [verEscolhidos, setVerEscolhidos] = useState(false);
  const [feito, setFeito] = useState<{ pedido: PedidoDetalhe; conta: ContaPagar | null; erroConta: string | null } | null>(null);
  // pagamento da compra: vai para Contas a pagar (à vista sai do caixa)
  const [pagamento, setPagamento] = useState(escolhaInicial);
  const soPedidos = useSoPedidos();
  const financeiro = useConsulta<PainelFinanceiro>("painel_financeiro", soPedidos === false ? {} : null);
  const envio = useEnvio();
  const { marcados, observacoes } = rascunho;
  // com um só fornecedor ativo, ele já vem escolhido
  const unicoAtivo = cad?.fornecedores.filter((f) => f.ativo);
  const fornecedorId = rascunho.fornecedorId || (unicoAtivo?.length === 1 ? unicoAtivo[0].id : "");

  useEffect(() => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(rascunho));
    } catch {
      /* sem armazenamento: o rascunho só vale nesta tela */
    }
  }, [rascunho]);

  const custoEntrada = useMemo(() => new Map((estoque.dados ?? []).map((e) => [e.produto_id, e.ultimo_custo_unitario])), [estoque.dados]);

  const base = (p: Produto): Base => {
    const v = (vinculosPorFornecedor.get(fornecedorId) ?? []).find((x) => x.produto_id === p.id && x.ativo && x.preco_atual !== null);
    if (v) return { tipo: v.tipo_embalagem, unidades: v.unidades_por_embalagem, preco: Number(v.preco_atual), origem: "preço do fornecedor" };
    const o = (ofertas.dados ?? [])
      .filter((x) => x.fornecedor_id === fornecedorId && x.produto_id === p.id && !x.vencida)
      .sort((a, b) => Number(a.preco_unitario) - Number(b.preco_unitario))[0];
    if (o)
      return {
        tipo: o.tipo_embalagem,
        unidades: o.unidades_por_embalagem,
        preco: Number(o.preco_embalagem),
        origem: `cotação ${o.cotacao_numero}`,
        cotacao_item_id: o.cotacao_item_id,
      };
    const c = custoEntrada.get(p.id);
    if (c !== null && c !== undefined)
      return { tipo: p.tipo_embalagem, unidades: p.unidades_por_embalagem, preco: arredondar(Number(c) * p.unidades_por_embalagem), origem: "último custo" };
    if (p.custo_referencia != null)
      return { tipo: p.tipo_embalagem, unidades: p.unidades_por_embalagem, preco: arredondar(Number(p.custo_referencia) * p.unidades_por_embalagem), origem: "custo do cadastro" };
    return { tipo: p.tipo_embalagem, unidades: p.unidades_por_embalagem, preco: null, origem: "sem preço" };
  };

  // ---- Registros (logs): o que foi marcado, desmarcado e alterado
  const nomeProduto = (id: string) => cad?.produtos.find((x) => x.id === id)?.nome ?? "produto";
  const mudancas = useRef(new Map<string, { de: string; para: string; relogio: ReturnType<typeof setTimeout> }>());
  // quantidade e valor mudam a cada toque: anota uma vez só, quando para de mexer
  function anotarMudanca(id: string, campo: "quantidade" | "valor", de: string, para: string) {
    const chave = `${id}|${campo}`;
    const atual = mudancas.current.get(chave);
    if (atual) clearTimeout(atual.relogio);
    const inicio = atual?.de ?? de;
    const relogio = setTimeout(() => {
      mudancas.current.delete(chave);
      if (inicio === para) return;
      const nome = nomeProduto(id);
      registrarAtividade(
        "pedidos",
        campo === "quantidade" ? "alterou_quantidade" : "alterou_valor",
        `${campo === "quantidade" ? "Quantidade" : "Valor"} de ${nome}: ${inicio || "—"} → ${para || "—"}`,
        { produto_id: id, produto: nome, de: inicio, para },
      );
    }, 1500);
    mudancas.current.set(chave, { de: inicio, para, relogio });
  }
  function anotarMarcacao(id: string, antes: Marcado | undefined, depois: Marcado | null) {
    const nome = nomeProduto(id);
    const forn = fornecedores.get(fornecedorId)?.nome ?? null;
    if (!antes && depois) {
      registrarAtividade("pedidos", "marcou_produto", `Marcou ${nome}`, { produto_id: id, produto: nome, quantidade: depois.qtd, valor: depois.preco ?? null, fornecedor: forn });
    } else if (antes && !depois) {
      registrarAtividade("pedidos", "desmarcou_produto", `Desmarcou ${nome}`, { produto_id: id, produto: nome, quantidade: antes.qtd, fornecedor: forn });
    } else if (antes && depois) {
      if (antes.qtd !== depois.qtd) anotarMudanca(id, "quantidade", antes.qtd, depois.qtd);
      if ((antes.preco ?? "") !== (depois.preco ?? "") && depois.preco !== undefined) anotarMudanca(id, "valor", antes.preco ?? "", depois.preco);
    }
  }

  const mudar = (campos: Partial<Rascunho>) => setRascunho((r) => ({ ...r, ...campos }));
  const marcar = (id: string, m: Marcado | null) => {
    anotarMarcacao(id, marcados[id], m);
    setRascunho((r) => {
      const novos = { ...r.marcados };
      if (m) novos[id] = m;
      else delete novos[id];
      return { ...r, marcados: novos };
    });
  };
  // marca (com 1) ou desmarca de uma vez os produtos que estão na lista
  const marcarVarios = (ids: string[], marcarTodos: boolean) => {
    const mudados = ids.filter((id) => (marcarTodos ? !marcados[id] : !!marcados[id]));
    if (mudados.length)
      registrarAtividade(
        "pedidos",
        marcarTodos ? "marcou_todos" : "desmarcou_todos",
        `${marcarTodos ? "Selecionou" : "Desmarcou"} ${mudados.length} ${mudados.length === 1 ? "produto" : "produtos"} de uma vez${busca ? ` (busca “${busca}”)` : ""}`,
        { produtos: mudados.slice(0, 300).map(nomeProduto), busca: busca || null },
      );
    setRascunho((r) => {
      const novos = { ...r.marcados };
      for (const id of ids) {
        if (!marcarTodos) delete novos[id];
        else if (!novos[id]) novos[id] = { qtd: "1" };
      }
      return { ...r, marcados: novos };
    });
  };

  // abriu a tela (uma vez por visita)
  const abriu = useRef(false);
  useEffect(() => {
    if (abriu.current) return;
    abriu.current = true;
    registrarAtividade("pedidos", "abriu_montar_pedido", "Abriu o Montar pedido");
  }, []);

  if (erro || ofertas.erro || estoque.erro) return <Aviso tom="erro">{erro ?? ofertas.erro ?? estoque.erro}</Aviso>;
  if (!cad || !ofertas.dados || !estoque.dados) return <Carregando />;

  if (feito) return <PedidoRealizado pedido={feito.pedido} conta={feito.conta} erroConta={feito.erroConta} aoVoltar={() => setFeito(null)} />;

  const ativos = cad.produtos.filter((p) => p.ativo).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const linhas = ativos.map((p) => {
    const b = base(p);
    const m = marcados[p.id];
    const preco = m?.preco !== undefined ? lerDecimal(m.preco) : b.preco;
    const qtd = m ? lerDecimal(m.qtd) : null;
    const total = m && preco !== null && qtd !== null && !Number.isNaN(preco) && !Number.isNaN(qtd) ? arredondar(preco * qtd) : null;
    return { p, b, m, preco, qtd, total };
  });
  const visiveis = linhas.filter((l) => (!soMarcados || l.m) && contemBusca(busca, l.p.nome, l.p.codigo, l.p.marca));
  const escolhidas = linhas.filter((l) => l.m);
  const todosVisiveisMarcados = visiveis.length > 0 && visiveis.every((l) => l.m);
  const totalGeral = arredondar(escolhidas.reduce((s, l) => s + (l.total ?? 0), 0));
  const ativosForn = cad.fornecedores.filter((f) => f.ativo);
  const fornecedor = fornecedores.get(fornecedorId);

  function revisar() {
    if (!fornecedorId) return envio.setErro("Escolha o fornecedor do pedido.");
    if (escolhidas.length === 0) return envio.setErro("Marque ao menos um produto.");
    for (const l of escolhidas) {
      if (l.qtd === null || Number.isNaN(l.qtd) || l.qtd <= 0) return envio.setErro(`Informe a quantidade de "${l.p.nome}".`);
      if (l.preco === null || Number.isNaN(l.preco) || l.preco < 0) return envio.setErro(`Informe o valor de "${l.p.nome}".`);
    }
    envio.setErro(null);
    setConfirmar(true);
  }

  async function realizar() {
    const erroPag = erroEscolha(pagamento, totalGeral);
    if (erroPag) throw new Error(erroPag);
    const itensLog = escolhidas.map((l) => ({ produto: l.p.nome, quantidade: l.qtd, valor: l.preco, total: l.total }));
    let r: { pedidos: PedidoResumo[] };
    try {
      r = await executar<{ pedidos: PedidoResumo[] }>("gerar_pedidos", {
        lote_id: lote,
        itens: escolhidas.map((l) => ({
          fornecedor_id: fornecedorId,
          produto_id: l.p.id,
          // a cotação só vale se o valor não foi trocado (com ela o banco usa o preço da cotação)
          cotacao_item_id: l.b.cotacao_item_id && l.preco === l.b.preco ? l.b.cotacao_item_id : undefined,
          tipo_embalagem: l.b.tipo,
          unidades_por_embalagem: l.b.unidades,
          quantidade_embalagens: l.qtd,
          preco_embalagem: l.preco,
          desconto_valor: 0,
        })),
        fornecedores: [{ fornecedor_id: fornecedorId, frete: 0, desconto_geral: 0, observacoes: observacoes.trim() || undefined }],
      });
    } catch (e) {
      registrarAtividade("pedidos", "erro_pedido", `Não conseguiu realizar o pedido: ${(e as Error).message}`, {
        fornecedor: fornecedor?.nome ?? null,
        itens: itensLog,
      });
      throw e;
    }
    // o valor do pedido vai para Contas a pagar; se falhar, o pedido continua
    // feito e a conta pode ser lançada depois pela tela do pedido
    let conta: ContaPagar | null = null;
    let erroConta: string | null = null;
    try {
      conta = await executar<ContaPagar>("lancar_conta_pagar", { pedido_id: r.pedidos[0].id, ...payloadEscolha(pagamento) });
    } catch (e) {
      erroConta = (e as Error).message;
    }
    const pedido = await chamar<PedidoDetalhe>("obter_pedido", { id: r.pedidos[0].id });
    const formaTexto = pagamento.forma === "a_vista" ? "à vista" : `parcelado em ${pagamento.parcelas}x`;
    registrarAtividade(
      "pedidos",
      "realizou_pedido",
      `Realizou o pedido ${pedido.numero_formatado} — ${pedido.fornecedor_nome} — ${moeda(pedido.valor_total)} (${escolhidas.length} ${escolhidas.length === 1 ? "produto" : "produtos"}, ${formaTexto})`,
      {
        pedido_id: pedido.id,
        pedido: pedido.numero_formatado,
        fornecedor: pedido.fornecedor_nome,
        total: pedido.valor_total,
        pagamento: payloadEscolha(pagamento),
        conta_a_pagar: conta ? conta.numero_formatado : erroConta ? `não lançada: ${erroConta}` : null,
        observacoes: observacoes.trim() || null,
        itens: itensLog,
      },
    );
    setFeito({ pedido, conta, erroConta });
    setPagamento(escolhaInicial());
    setLote(crypto.randomUUID());
    setRascunho((x) => ({ ...x, marcados: {}, observacoes: "" }));
    setSoMarcados(false);
  }

  return (
    <>
      <PageHeader title="Montar pedido" description="Escolha o fornecedor, marque os produtos e informe as quantidades. No final, toque em Realizar pedido." />
      <div className="grid gap-5">
        <Secao titulo="Fornecedor">
          {ativosForn.length === 0 ? (
            <Aviso tom="atencao">
              Nenhum fornecedor cadastrado.{" "}
              <Link to={rota("fornecedores", "novo")} className="font-semibold underline">
                Cadastrar fornecedor
              </Link>
            </Aviso>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Fornecedor do pedido" obrigatorio>
                {(id) => (
                  <Select
                    id={id}
                    value={fornecedorId}
                    onChange={(e) => {
                      const nome = fornecedores.get(e.target.value)?.nome;
                      registrarAtividade("pedidos", "escolheu_fornecedor", nome ? `Escolheu o fornecedor ${nome}` : "Tirou o fornecedor", { fornecedor_id: e.target.value || null, fornecedor: nome ?? null });
                      mudar({ fornecedorId: e.target.value });
                    }}
                  >
                    <option value="">Escolha…</option>
                    {ativosForn.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                  </Select>
                )}
              </Campo>
              <Campo rotulo="Observações" ajuda="Opcional. Vai na mensagem e no PDF.">
                {(id) => <Textarea id={id} rows={1} value={observacoes} onChange={(e) => mudar({ observacoes: e.target.value })} />}
              </Campo>
            </div>
          )}
        </Secao>

        <Secao titulo="Produtos" descricao="Valor por embalagem: preço do fornecedor, cotação ou o último custo. Pode trocar o valor na linha.">
          {ativos.length === 0 ? (
            <Vazio icone={ShoppingCart} titulo="Nenhum produto cadastrado">
              Cadastre produtos ou cole a lista de uma nota em Estoque → Entrada por nota.
            </Vazio>
          ) : (
            <>
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Pesquisar produto ou código" className="sm:flex-1" />
                <div className="flex flex-wrap items-center gap-x-4">
                <label className="flex h-11 items-center gap-2 text-sm font-medium text-verde">
                  <input
                    type="checkbox"
                    className="size-5 accent-verde"
                    checked={todosVisiveisMarcados}
                    onChange={() => marcarVarios(visiveis.map((l) => l.p.id), !todosVisiveisMarcados)}
                  />
                  {busca ? `Selecionar os ${visiveis.length} da busca` : "Selecionar todos"}
                </label>
                <label className="flex h-11 items-center gap-2 text-sm font-medium text-verde">
                  <input type="checkbox" className="size-5 accent-verde" checked={soMarcados} onChange={(e) => setSoMarcados(e.target.checked)} />
                  Só os marcados ({escolhidas.length})
                </label>
                </div>
              </div>
              <div className="overflow-hidden rounded-xl border border-linha">
                <div className="hidden grid-cols-[auto_minmax(0,1fr)_7.5rem_9rem_7rem] gap-x-3 border-b border-linha bg-fundo px-3 py-2 text-xs font-semibold tracking-wide text-texto-suave uppercase sm:grid">
                  <span className="w-5" />
                  <span>Produto</span>
                  <span>Valor/emb.</span>
                  <span>Qtd.</span>
                  <span className="text-right">Total</span>
                </div>
                {visiveis.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-texto-suave">Nenhum produto encontrado.</p>
                ) : (
                  <ul className="divide-y divide-linha">
                    {visiveis.map(({ p, b, m, total }) => (
                      <li
                        key={p.id}
                        className={cn(
                          "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_7.5rem_9rem_7rem]",
                          m ? "bg-offwhite" : "bg-superficie",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="size-5 accent-verde"
                          checked={!!m}
                          onChange={(e) => marcar(p.id, e.target.checked ? { qtd: "1" } : null)}
                          aria-label={`Selecionar ${p.nome}`}
                        />
                        <div className="min-w-0">
                          <p className="font-medium break-words text-verde">{p.nome}</p>
                          <p className="text-xs text-texto-suave">
                            {[p.codigo, descreverEmbalagem(b.tipo, b.unidades), b.origem].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <div className="col-start-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:contents">
                          <Input
                            aria-label={`Valor por embalagem de ${p.nome}`}
                            inputMode="decimal"
                            placeholder="R$"
                            className="h-10"
                            value={m?.preco ?? paraCampo(b.preco, 2)}
                            onChange={(e) => marcar(p.id, { qtd: m?.qtd ?? "1", preco: e.target.value })}
                          />
                          <Contador
                            nome={p.nome}
                            valor={m?.qtd ?? ""}
                            aoMudar={(qtd) => marcar(p.id, qtd === null ? null : { ...m, qtd })}
                          />
                          <p
                            className={cn(
                              "col-span-2 text-right font-semibold text-verde tabular-nums sm:col-span-1",
                              total === null && "hidden sm:block",
                            )}
                          >
                            {total === null ? "—" : moeda(total)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </Secao>

        {envio.erro && <Aviso tom="erro">{envio.erro}</Aviso>}
        <div className="sticky bottom-20 z-10 rounded-xl border border-linha bg-superficie shadow-lg lg:bottom-4">
          {/* "Mostrar produtos": confere o que foi marcado antes de realizar o pedido */}
          {verEscolhidos && (
            <div className="border-b border-linha px-3 pt-3 pb-2">
              <p className="mb-1 text-sm font-semibold text-verde">Produtos do pedido</p>
              {escolhidas.length === 0 ? (
                <p className="pb-1 text-sm text-texto-suave">Nenhum produto marcado ainda.</p>
              ) : (
                <ul className="flex max-h-[40vh] flex-col divide-y divide-linha overflow-y-auto sm:max-h-64" aria-label="Produtos do pedido">
                  {escolhidas.map((l) => (
                    <li key={l.p.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                      <span className="min-w-0 break-words text-verde">
                        <strong className="tabular-nums">{l.qtd === null || Number.isNaN(l.qtd) ? "?" : paraCampo(l.qtd)} ×</strong> {l.p.nome}{" "}
                        <span className="text-texto-suave">
                          ({descreverEmbalagem(l.b.tipo, l.b.unidades).toLowerCase()} · {moeda(l.preco)})
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1">
                        <span className="font-semibold text-verde tabular-nums">{moeda(l.total)}</span>
                        <button
                          type="button"
                          aria-label={`Tirar ${l.p.nome} do pedido`}
                          title="Tirar do pedido"
                          className="flex size-8 items-center justify-center rounded-lg text-texto-suave hover:bg-offwhite hover:text-perigo"
                          onClick={() => marcar(l.p.id, null)}
                        >
                          <X className="size-4" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {/* celular: uma linha só (resumo + botão de ícone + Realizar); computador: com os rótulos */}
          <div className="flex items-center justify-between gap-2 p-2 sm:flex-wrap sm:gap-3 sm:p-3">
            <p className="min-w-0 leading-tight text-verde">
              <span className="block text-xs sm:inline sm:text-base">
                {escolhidas.length} {escolhidas.length === 1 ? "produto" : "produtos"}
                <span className="hidden sm:inline"> · </span>
              </span>
              <strong className="text-base tabular-nums sm:text-lg">
                <span className="hidden sm:inline">Total </span>
                {moeda(totalGeral)}
              </strong>
            </p>
            <div className="flex shrink-0 gap-2">
              <Button
                variant="contorno"
                className="h-11 px-3 sm:h-13 sm:px-6 sm:text-base"
                aria-label={verEscolhidos ? "Esconder produtos" : "Mostrar produtos"}
                title={verEscolhidos ? "Esconder produtos" : "Mostrar produtos"}
                aria-expanded={verEscolhidos}
                onClick={() => {
                  if (!verEscolhidos) registrarAtividade("pedidos", "mostrou_produtos", `Abriu a lista dos produtos marcados (${escolhidas.length})`);
                  setVerEscolhidos((v) => !v);
                }}
              >
                <List className="size-5" />
                <span className="hidden sm:inline">{verEscolhidos ? "Esconder produtos" : "Mostrar produtos"}</span>
              </Button>
              <Button className="h-11 px-4 sm:h-13 sm:px-6 sm:text-base" aria-label="Realizar pedido" onClick={revisar} disabled={envio.enviando}>
                <ShoppingCart className="size-5" /> Realizar<span className="hidden sm:inline"> pedido</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <Confirmar
        aberto={confirmar}
        titulo="Realizar pedido?"
        mensagem={
          <>
            <p className="mb-2">
              <strong>{fornecedor?.nome}</strong> · {escolhidas.length} {escolhidas.length === 1 ? "produto" : "produtos"}
            </p>
            <ul className="mb-3 flex max-h-60 flex-col gap-1 overflow-auto">
              {escolhidas.map((l) => (
                <li key={l.p.id} className="flex justify-between gap-3">
                  <span className="min-w-0 break-words">
                    {paraCampo(l.qtd)} × {l.p.nome}
                  </span>
                  <span className="shrink-0 tabular-nums">{moeda(l.total)}</span>
                </li>
              ))}
              <li className="flex justify-between gap-3 border-t border-linha pt-1 font-bold">
                <span>Total</span>
                <span className="tabular-nums">{moeda(totalGeral)}</span>
              </li>
            </ul>
            <div className="mb-3 rounded-xl border border-linha p-3">
              <p className="mb-2 text-sm font-semibold text-verde">Pagamento (vai para Contas a pagar)</p>
              <EscolhaPagamentoCampos valor={pagamento} aoMudar={setPagamento} total={totalGeral} saldoCaixa={financeiro.dados?.saldo_caixa} />
            </div>
            <p>Em seguida aparecem a lista para o WhatsApp e o PDF do pedido.</p>
          </>
        }
        textoConfirmar="Realizar pedido"
        aoFechar={() => setConfirmar(false)}
        aoConfirmar={realizar}
      />
    </>
  );
}

// Quantidade com − e + ao lado (o campo continua editável). "+" num produto
// não marcado já marca com 1; "−" até zero desmarca.
function Contador({ nome, valor, aoMudar }: { nome: string; valor: string; aoMudar: (qtd: string | null) => void }) {
  const n = lerDecimal(valor);
  const atual = n === null || Number.isNaN(n) ? 0 : n;
  const botao =
    "flex size-10 shrink-0 items-center justify-center rounded-xl border border-linha bg-superficie text-verde hover:border-amarelo disabled:opacity-40";
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={botao}
        aria-label={`Diminuir ${nome}`}
        disabled={atual <= 0}
        onClick={() => {
          const novo = arredondar(atual - 1, 3);
          aoMudar(novo <= 0 ? null : paraCampo(novo));
        }}
      >
        <Minus className="size-4" />
      </button>
      <Input
        aria-label={`Quantidade de ${nome}`}
        inputMode="decimal"
        placeholder="0"
        className="h-10 w-12 min-w-0 px-1 text-center"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
      />
      <button type="button" className={botao} aria-label={`Aumentar ${nome}`} onClick={() => aoMudar(paraCampo(arredondar(atual + 1, 3)))}>
        <Plus className="size-4" />
      </button>
    </div>
  );
}

function PedidoRealizado({
  pedido,
  conta,
  erroConta,
  aoVoltar,
}: {
  pedido: PedidoDetalhe;
  conta: ContaPagar | null;
  erroConta: string | null;
  aoVoltar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [perguntar, setPerguntar] = useState(false);
  const mensagem = mensagemPedido(pedido);
  const numero = numeroWhatsapp(pedido.fornecedor?.whatsapp ?? pedido.fornecedor_whatsapp);
  const link = numero ? linkWhatsapp(numero, mensagem) : `https://wa.me/?text=${encodeURIComponent(mensagem)}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      registrarAtividade("pedidos", "copiou_lista", `Copiou a lista do pedido ${pedido.numero_formatado}`, { pedido_id: pedido.id });
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      /* sem área de transferência: a lista continua visível para copiar à mão */
    }
  }

  async function pdf() {
    setGerandoPdf(true);
    try {
      await gerarPdfPedido(pedido);
      registrarAtividade("pedidos", "gerou_pdf", `Gerou o PDF do pedido ${pedido.numero_formatado}`, { pedido_id: pedido.id });
    } finally {
      setGerandoPdf(false);
    }
  }

  return (
    <>
      <PageHeader title="Pedido realizado" />
      <Aviso tom="sucesso" className="mb-4">
        <span className="flex items-center gap-2">
          <CircleCheck className="size-4 shrink-0" /> {pedido.numero_formatado} · {pedido.fornecedor_nome} · {moeda(pedido.valor_total)}
        </span>
      </Aviso>
      {conta && (
        <Aviso tom="info" className="mb-4">
          {conta.forma === "a_vista" ? (
            <>
              Pago à vista: <strong>{moeda(conta.valor_total)}</strong> saiu do caixa
              {conta.saldo_caixa !== undefined && conta.saldo_caixa !== null && (
                <>
                  {" "}
                  (saldo <span className={conta.saldo_caixa < 0 ? "font-semibold text-perigo" : ""}>{moeda(conta.saldo_caixa)}</span>)
                </>
              )}
              .
            </>
          ) : (
            <>
              Lançado em Contas a pagar: {conta.parcelas.length}× de {moeda(conta.parcelas[0]?.valor)}, a 1ª vence em {dataBR(conta.parcelas[0]?.vencimento)}.
            </>
          )}
        </Aviso>
      )}
      {erroConta && (
        <Aviso tom="atencao" className="mb-4">
          O pedido foi feito, mas não entrou em Contas a pagar: {erroConta} Abra o pedido para lançar o pagamento.
        </Aviso>
      )}
      <Secao titulo="Lista para o WhatsApp">
        <pre className="max-h-80 overflow-auto rounded-xl bg-offwhite/60 p-3 text-sm whitespace-pre-wrap text-verde">{mensagem}</pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              registrarAtividade("pedidos", "abriu_whatsapp", `Abriu o WhatsApp para enviar o pedido ${pedido.numero_formatado}`, {
                pedido_id: pedido.id,
                whatsapp: numero ?? "escolher contato",
              });
              if (!enviado) setPerguntar(true);
            }}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-amarelo px-4 font-semibold text-verde hover:bg-ouro"
          >
            <MessageCircle className="size-4" /> Enviar pelo WhatsApp
          </a>
          <Button variant="contorno" onClick={copiar}>
            <ClipboardCopy className="size-4" /> {copiado ? "Lista copiada!" : "Copiar lista"}
          </Button>
          <Button variant="contorno" onClick={pdf} disabled={gerandoPdf}>
            <FileDown className="size-4" /> {gerandoPdf ? "Gerando PDF…" : "Gerar PDF"}
          </Button>
        </div>
        {!numero && <p className="mt-2 text-sm text-texto-suave">O fornecedor não tem WhatsApp cadastrado: o WhatsApp abre para você escolher o contato.</p>}
        {enviado && <p className="mt-2 text-sm font-medium text-sucesso">Pedido marcado como enviado ao fornecedor.</p>}
      </Secao>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="contorno" onClick={aoVoltar}>
          Montar outro pedido
        </Button>
        <LinkBotao to={rota("pedidos", pedido.id)} variant="secundario">
          Abrir o pedido
        </LinkBotao>
      </div>
      <Confirmar
        aberto={perguntar}
        titulo="Você enviou o pedido?"
        mensagem="Confirme depois de mandar a mensagem no WhatsApp. O pedido passa para “Enviado ao fornecedor”."
        textoConfirmar="Sim, enviei"
        aoFechar={() => setPerguntar(false)}
        aoConfirmar={async () => {
          await executar("mudar_status_pedido", { id: pedido.id, status: "enviado" });
          registrarAtividade("pedidos", "marcou_enviado", `Confirmou que enviou o pedido ${pedido.numero_formatado} ao fornecedor`, { pedido_id: pedido.id });
          setEnviado(true);
        }}
      />
    </>
  );
}
