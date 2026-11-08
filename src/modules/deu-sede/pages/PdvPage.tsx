import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Minus, Plus, Printer, ScanBarcode, Trash2 } from "lucide-react";
import { Button } from "@/modules/deu-sede/components/ui/button";
import { Badge } from "@/modules/deu-sede/components/ui/badge";
import { Aviso, Carregando, Vazio } from "@/modules/deu-sede/components/ui/aviso";
import { CampoBusca } from "@/modules/deu-sede/components/ui/filtros";
import { Campo, Input, Select } from "@/modules/deu-sede/components/ui/input";
import { Confirmar, Dialogo } from "@/modules/deu-sede/components/ui/dialogo";
import { Secao } from "@/modules/deu-sede/components/ui/secao";
import { FiltroPeriodo } from "@/modules/deu-sede/components/FiltroPeriodo";
import { chamar, executar, useConsulta } from "@/modules/deu-sede/data/cliente";
import type { FormaPagamento, ProdutoPdv, ResumoVendas, Venda, VendaResumo } from "@/modules/deu-sede/data/tipos";
import { FORMAS_PAGAMENTO, precoItem, precoTabela, subtotalItem, totaisCarrinho, type ItemCarrinho } from "@/modules/deu-sede/domain/pdv";
import { periodoDoAtalho, type Periodo } from "@/modules/deu-sede/domain/periodo";
import { contemBusca, dataHoraBR, descreverEmbalagem, descreverQuantidade, lerDecimal, moeda, numero, paraCampo } from "@/modules/deu-sede/domain/formatos";
import { DEU_SEDE_BASE } from "@/modules/deu-sede/config/modules";
import { useSenha } from "@/modules/deu-sede/senha";
import { cn } from "@/lib/utils";

const ROTULO_FORMA = Object.fromEntries(FORMAS_PAGAMENTO.map((f) => [f.valor, f.rotulo])) as Record<FormaPagamento, string>;

export function PdvPage() {
  const [aba, setAba] = useState<"vender" | "vendas">("vender");
  return (
    <div className="relative isolate flex h-full min-h-0 flex-col overflow-hidden bg-fundo">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden">
        <div className="relative h-[20rem] w-[22rem] overflow-hidden">
          <img
            src="/imagem%20ponto/Banner%20promocional%20de%20bebidas%20geladas.png"
            alt=""
            className="absolute left-0 top-1/2 h-full max-w-none -translate-y-1/2 opacity-[0.035] mix-blend-multiply dark:mix-blend-screen"
          />
        </div>
      </div>
      <header className="relative z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-linha bg-superficie px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            to={DEU_SEDE_BASE}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-verde hover:bg-offwhite"
            aria-label="Voltar ao DEU SEDE"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-widest text-texto-suave uppercase">DEU SEDE!</p>
            <h1 className="truncate text-xl font-bold leading-tight text-verde">Ponto de venda</h1>
          </div>
        </div>
        <div className="flex shrink-0 rounded-xl bg-offwhite p-1" role="tablist" aria-label="Seções do PDV">
          {([
            ["vender", "Vender"],
            ["vendas", "Vendas"],
          ] as const).map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={aba === valor}
              onClick={() => setAba(valor)}
              className={cn(
                "h-9 rounded-lg px-4 text-sm font-semibold transition-colors",
                aba === valor ? "bg-verde text-creme shadow-sm" : "text-texto-suave hover:text-verde",
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </header>
      {aba === "vender" ? <Vender /> : <div className="relative z-20 min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><Vendas /></div>}
    </div>
  );
}

function Vender() {
  const { dados: produtos, erro: erroProdutos } = useConsulta<ProdutoPdv[]>("pdv_produtos");
  const { pedirSenha } = useSenha();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [desconto, setDesconto] = useState("");
  const [descontoLiberado, setDescontoLiberado] = useState(false);
  const [forma, setForma] = useState<FormaPagamento>("dinheiro");
  const [recebido, setRecebido] = useState("");
  const [cliente, setCliente] = useState("");
  const [chave, setChave] = useState(() => crypto.randomUUID());
  const [finalizando, setFinalizando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [comprovante, setComprovante] = useState<Venda | null>(null);
  const [editandoPreco, setEditandoPreco] = useState<ItemCarrinho | null>(null);
  const carrinhoRef = useRef<HTMLDivElement>(null);

  const categorias = useMemo(() => [...new Map((produtos ?? []).map((p) => [p.categoria_id, p.categoria_nome])).entries()], [produtos]);
  const filtrados = useMemo(
    () =>
      (produtos ?? [])
        .filter((p) => contemBusca(busca, p.nome, p.codigo, p.marca) && (!categoria || p.categoria_id === categoria))
        .sort((a, b) => Number(Number(b.saldo_unidades) > 0) - Number(Number(a.saldo_unidades) > 0))
        .slice(0, 60),
    [produtos, busca, categoria],
  );
  const t = totaisCarrinho(carrinho, lerDecimal(desconto) ?? 0, forma, lerDecimal(recebido));

  function adicionar(p: ProdutoPdv, unidade: "unidade" | "embalagem") {
    setErro(null);
    setCarrinho((c) => {
      const i = c.find((x) => x.produto.produto_id === p.produto_id && x.unidade_venda === unidade && x.preco_manual === null);
      if (i) return c.map((x) => (x === i ? { ...x, quantidade: x.quantidade + 1 } : x));
      return [...c, { chave: crypto.randomUUID(), produto: p, unidade_venda: unidade, quantidade: 1, preco_manual: null }];
    });
  }
  const mudar = (chaveItem: string, c: Partial<ItemCarrinho>) => setCarrinho((xs) => xs.map((x) => (x.chave === chaveItem ? { ...x, ...c } : x)));

  function aoTeclarBusca(e: React.KeyboardEvent) {
    if (e.key !== "Enter") return;
    const codigo = (produtos ?? []).find((p) => p.codigo && p.codigo.toLowerCase() === busca.trim().toLowerCase());
    const alvo = codigo ?? (filtrados.length === 1 ? filtrados[0] : null);
    if (alvo) {
      adicionar(alvo, "unidade");
      setBusca("");
    }
  }

  async function finalizar() {
    if (carrinho.length === 0) return setErro("Adicione produtos ao carrinho.");
    if (t.semPreco.length) return setErro(`Sem preço de venda: ${t.semPreco.map((i) => i.produto.nome).join(", ")}. Cadastre o preço ou digite no item.`);
    if (t.semSaldo.length)
      return setErro(
        `Estoque insuficiente: ${t.semSaldo.map((s) => `${s.produto.nome} (saldo ${numero(s.produto.saldo_unidades)} un)`).join(", ")}.`,
      );
    const rec = lerDecimal(recebido);
    if (forma === "dinheiro" && rec !== null && rec < t.total) return setErro("Valor recebido menor que o total.");
    setFinalizando(true);
    setErro(null);
    try {
      const venda = await executar<Venda>("registrar_venda", {
        chave_idempotencia: chave,
        forma_pagamento: forma,
        valor_recebido: forma === "dinheiro" ? rec : null,
        desconto: t.desconto,
        cliente,
        itens: carrinho.map((i) => ({
          produto_id: i.produto.produto_id,
          unidade_venda: i.unidade_venda,
          quantidade: i.quantidade,
          preco_unitario: i.preco_manual,
        })),
      });
      setComprovante(venda);
      setCarrinho([]);
      setDesconto("");
      setDescontoLiberado(false);
      setRecebido("");
      setCliente("");
      setChave(crypto.randomUUID());
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setFinalizando(false);
    }
  }

  if (erroProdutos) return <Aviso tom="erro">{erroProdutos}</Aviso>;
  if (!produtos) return <Carregando />;

  return (
    <div className="relative z-20 grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden lg:grid-cols-[13rem_minmax(0,1fr)_24rem] lg:grid-rows-1">
      <nav className="border-b border-linha bg-superficie px-3 py-2 lg:overflow-y-auto lg:border-r lg:border-b-0 lg:px-3 lg:py-5" aria-label="Categorias de produtos">
        <p className="hidden px-3 pb-3 text-xs font-bold tracking-widest text-texto-suave uppercase lg:block">Categorias</p>
        <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {[["", "Todas"], ...categorias].map(([id, nome]) => (
            <li key={id || "todas"}>
              <button
                type="button"
                aria-pressed={categoria === id}
                onClick={() => setCategoria(id)}
                className={cn(
                  "h-10 whitespace-nowrap rounded-lg px-3 text-left text-sm font-medium transition-colors lg:w-full",
                  categoria === id ? "bg-amarelo/60 text-verde" : "text-texto-suave hover:bg-offwhite hover:text-verde",
                )}
              >
                {nome}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="grid min-h-0 overflow-y-auto lg:contents">
        {/* ---------- Produtos ---------- */}
        <section className="flex min-w-0 flex-col gap-3 p-3 sm:p-4 lg:min-h-0 lg:overflow-y-auto">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative sm:flex-1" onKeyDown={aoTeclarBusca}>
              <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Produto ou código (Enter adiciona)" />
            </div>
          </div>
          {filtrados.length === 0 ? (
            <Vazio icone={ScanBarcode} titulo="Nenhum produto encontrado" />
          ) : (
            <ul className="grid content-start gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filtrados.map((p) => {
                const pu = precoTabela(p, "unidade");
                const pe = p.unidades_por_embalagem > 1 ? precoTabela(p, "embalagem") : null;
                const semSaldo = Number(p.saldo_unidades) <= 0;
                return (
                  <li key={p.produto_id} className={cn("flex flex-col gap-2 rounded-xl border bg-superficie p-3", semSaldo ? "border-linha opacity-60" : "border-linha")}>
                    <div className="min-w-0">
                      <p className="text-sm leading-tight font-semibold text-verde">{p.nome}</p>
                      <p className="text-xs text-texto-suave">
                        Estoque: {descreverQuantidade(p.saldo_unidades, p.unidades_por_embalagem, p.tipo_embalagem)}
                      </p>
                    </div>
                    <div className="mt-auto flex flex-wrap gap-1.5">
                      <Button size="sm" variant={semSaldo ? "contorno" : "primario"} onClick={() => adicionar(p, "unidade")} disabled={semSaldo}>
                        <Plus className="size-3.5" /> 1 un {pu !== null ? `· ${moeda(pu)}` : ""}
                      </Button>
                      {p.unidades_por_embalagem > 1 && (
                        <Button size="sm" variant="contorno" onClick={() => adicionar(p, "embalagem")} disabled={Number(p.saldo_unidades) < p.unidades_por_embalagem}>
                          <Plus className="size-3.5" /> {descreverEmbalagem(p.tipo_embalagem, p.unidades_por_embalagem).toLowerCase()} {pe !== null ? `· ${moeda(pe)}` : ""}
                        </Button>
                      )}
                    </div>
                    {pu === null && <span className="text-xs font-medium text-marrom">Sem preço de venda cadastrado</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ---------- Carrinho ---------- */}
        <div ref={carrinhoRef} className="border-t border-linha bg-superficie p-3 sm:p-4 lg:min-h-0 lg:overflow-y-auto lg:border-t-0 lg:border-l">
        <Secao titulo="Carrinho" descricao={carrinho.length ? `${carrinho.length} ${carrinho.length === 1 ? "item" : "itens"}` : "Toque nos produtos para adicionar."}>
          <ul className="flex flex-col gap-2">
            {carrinho.map((i) => {
              const preco = precoItem(i);
              return (
                <li key={i.chave} className="rounded-xl border border-linha p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm leading-tight font-medium text-verde">{i.produto.nome}</span>
                    <button type="button" aria-label={`Tirar ${i.produto.nome}`} className="text-texto-suave hover:text-perigo" onClick={() => setCarrinho((c) => c.filter((x) => x.chave !== i.chave))}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <div className="flex items-center rounded-lg border border-linha">
                      <button type="button" aria-label="Menos" className="flex size-9 items-center justify-center" onClick={() => i.quantidade > 1 && mudar(i.chave, { quantidade: i.quantidade - 1 })}>
                        <Minus className="size-4" />
                      </button>
                      <input
                        aria-label={`Quantidade de ${i.produto.nome}`}
                        inputMode="decimal"
                        maxLength={80}
                        className="h-9 w-12 border-x border-linha text-center text-sm"
                        value={paraCampo(i.quantidade)}
                        onChange={(e) => {
                          const q = lerDecimal(e.target.value);
                          if (q !== null && !Number.isNaN(q) && q > 0) mudar(i.chave, { quantidade: q });
                        }}
                      />
                      <button type="button" aria-label="Mais" className="flex size-9 items-center justify-center" onClick={() => mudar(i.chave, { quantidade: i.quantidade + 1 })}>
                        <Plus className="size-4" />
                      </button>
                    </div>
                    {i.produto.unidades_por_embalagem > 1 && (
                      <Select
                        aria-label="Vender por"
                        className="h-9 w-auto text-sm"
                        value={i.unidade_venda}
                        onChange={(e) => mudar(i.chave, { unidade_venda: e.target.value as "unidade" | "embalagem", preco_manual: null })}
                      >
                        <option value="unidade">un</option>
                        <option value="embalagem">{descreverEmbalagem(i.produto.tipo_embalagem, i.produto.unidades_por_embalagem).toLowerCase()}</option>
                      </Select>
                    )}
                    <button
                      type="button"
                      className="ml-auto text-right text-sm"
                      onClick={async () => (await pedirSenha("pdv_desconto")) && setEditandoPreco(i)}
                      title="Alterar o preço (pede senha)"
                    >
                      <span className={cn("block font-semibold", preco === null ? "text-perigo" : "text-verde")}>
                        {preco === null ? "Definir preço" : moeda(subtotalItem(i))}
                      </span>
                      {preco !== null && (
                        <span className="block text-xs text-texto-suave">
                          {moeda(preco)} {i.preco_manual !== null && "(manual)"}
                        </span>
                      )}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex flex-col gap-3">
            {descontoLiberado ? (
              <Campo rotulo="Desconto (R$)">{(id) => <Input id={id} inputMode="decimal" value={desconto} onChange={(e) => setDesconto(e.target.value)} />}</Campo>
            ) : (
              <button
                type="button"
                className="self-start text-sm font-medium text-marrom underline"
                onClick={async () => (await pedirSenha("pdv_desconto")) && setDescontoLiberado(true)}
              >
                Dar desconto
              </button>
            )}
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Forma de pagamento">
              {FORMAS_PAGAMENTO.map((f) => (
                <button
                  key={f.valor}
                  type="button"
                  role="radio"
                  aria-checked={forma === f.valor}
                  onClick={() => setForma(f.valor)}
                  className={cn(
                    "h-11 rounded-xl border text-sm font-medium",
                    forma === f.valor ? "border-verde bg-verde text-creme" : "border-linha bg-superficie text-verde",
                  )}
                >
                  {f.rotulo}
                </button>
              ))}
            </div>
            {forma === "dinheiro" && (
              <Campo rotulo="Valor recebido (R$)" ajuda={t.troco !== null ? `Troco: ${moeda(t.troco)}` : undefined}>
                {(id) => <Input id={id} inputMode="decimal" value={recebido} onChange={(e) => setRecebido(e.target.value)} />}
              </Campo>
            )}
            <Campo rotulo="Cliente (opcional)">{(id) => <Input id={id} value={cliente} onChange={(e) => setCliente(e.target.value)} />}</Campo>
            <dl className="grid gap-1 rounded-xl bg-offwhite/60 p-3 text-sm">
              <div className="flex justify-between"><dt>Subtotal</dt><dd className="tabular-nums">{moeda(t.subtotal)}</dd></div>
              {t.desconto > 0 && <div className="flex justify-between"><dt>Desconto</dt><dd className="tabular-nums">− {moeda(t.desconto)}</dd></div>}
              <div className="flex justify-between text-lg font-bold text-verde"><dt>Total</dt><dd className="tabular-nums">{moeda(t.total)}</dd></div>
              {t.troco !== null && <div className="flex justify-between font-semibold text-sucesso"><dt>Troco</dt><dd className="tabular-nums">{moeda(t.troco)}</dd></div>}
            </dl>
            {t.semSaldo.length > 0 && (
              <Aviso tom="atencao">Estoque insuficiente: {t.semSaldo.map((s) => s.produto.nome).join(", ")}.</Aviso>
            )}
            {erro && <Aviso tom="erro">{erro}</Aviso>}
            <Button size="lg" onClick={finalizar} disabled={finalizando || carrinho.length === 0}>
              {finalizando ? "Finalizando…" : `Finalizar venda · ${moeda(t.total)}`}
            </Button>
          </div>
        </Secao>
        </div>
      </div>

      {/* Celular: atalho fixo para o carrinho */}
      {carrinho.length > 0 && (
        <button
          type="button"
          onClick={() => carrinhoRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="fixed inset-x-4 bottom-4 z-20 flex h-12 items-center justify-between rounded-xl bg-verde px-4 font-semibold text-creme shadow-lg lg:hidden"
        >
          <span>Carrinho ({carrinho.length})</span>
          <span className="tabular-nums">{moeda(t.total)}</span>
        </button>
      )}

      {editandoPreco && (
        <PrecoManual
          item={editandoPreco}
          aoFechar={() => setEditandoPreco(null)}
          aoSalvar={(p) => {
            mudar(editandoPreco.chave, { preco_manual: p });
            setEditandoPreco(null);
          }}
        />
      )}
      {comprovante && <Comprovante venda={comprovante} aoFechar={() => setComprovante(null)} />}
    </div>
  );
}

function PrecoManual({ item, aoFechar, aoSalvar }: { item: ItemCarrinho; aoFechar: () => void; aoSalvar: (p: number | null) => void }) {
  const [valor, setValor] = useState(paraCampo(precoItem(item), 2));
  const [erro, setErro] = useState<string | null>(null);
  const tabela = precoTabela(item.produto, item.unidade_venda);
  return (
    <Dialogo
      aberto
      titulo="Preço deste item"
      aoFechar={aoFechar}
      rodape={
        <>
          {tabela !== null && (
            <Button variant="contorno" onClick={() => aoSalvar(null)}>
              Usar preço cadastrado ({moeda(tabela)})
            </Button>
          )}
          <Button
            data-principal
            onClick={() => {
              const p = lerDecimal(valor);
              if (p === null || Number.isNaN(p) || p < 0) return setErro("Preço inválido.");
              aoSalvar(p);
            }}
          >
            Aplicar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-texto">{item.produto.nome}</p>
        <Campo rotulo={`Preço por ${item.unidade_venda === "unidade" ? "unidade" : descreverEmbalagem(item.produto.tipo_embalagem, item.produto.unidades_por_embalagem).toLowerCase()} (R$)`}>
          {(id) => <Input id={id} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />}
        </Campo>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Dialogo>
  );
}

function textoComprovante(v: Venda): string {
  const l: string[] = [];
  l.push(v.empresa?.nome || "DEU SEDE!");
  if (v.empresa?.cnpj) l.push(`CNPJ ${v.empresa.cnpj}`);
  l.push(`Venda ${v.numero_formatado} · ${dataHoraBR(v.created_at)}`);
  l.push("--------------------------------");
  for (const i of v.itens) {
    l.push(i.produto_nome);
    l.push(`  ${numero(i.quantidade)} ${i.unidade_venda === "unidade" ? "un" : `x${i.unidades_por_item}`} x ${moeda(i.preco_unitario)} = ${moeda(i.subtotal)}`);
  }
  l.push("--------------------------------");
  l.push(`Subtotal: ${moeda(v.subtotal)}`);
  if (Number(v.desconto) > 0) l.push(`Desconto: - ${moeda(v.desconto)}`);
  l.push(`TOTAL: ${moeda(v.total)}`);
  l.push(`Pagamento: ${ROTULO_FORMA[v.forma_pagamento]}`);
  if (v.valor_recebido !== null) l.push(`Recebido: ${moeda(v.valor_recebido)} · Troco: ${moeda(v.troco)}`);
  if (v.status === "cancelada") l.push(`VENDA CANCELADA: ${v.motivo_cancelamento}`);
  l.push("Não é documento fiscal.");
  return l.join("\n");
}

function imprimir(v: Venda) {
  const janela = window.open("", "_blank", "width=380,height=600");
  if (!janela) return;
  const pre = janela.document.createElement("pre");
  pre.textContent = textoComprovante(v);
  pre.style.cssText = "font: 12px/1.4 monospace; margin: 8px; white-space: pre-wrap;";
  janela.document.title = v.numero_formatado;
  janela.document.body.appendChild(pre);
  janela.focus();
  janela.print();
}

function Comprovante({ venda, aoFechar }: { venda: Venda; aoFechar: () => void }) {
  return (
    <Dialogo
      aberto
      titulo={venda.status === "cancelada" ? `Venda ${venda.numero_formatado} (cancelada)` : `Venda ${venda.numero_formatado} concluída`}
      aoFechar={aoFechar}
      rodape={
        <>
          <Button variant="contorno" onClick={() => imprimir(venda)}>
            <Printer className="size-4" /> Imprimir
          </Button>
          <Button data-principal onClick={aoFechar}>
            {venda.status === "cancelada" ? "Fechar" : "Nova venda"}
          </Button>
        </>
      }
    >
      <pre className="rounded-xl bg-offwhite/60 p-3 font-mono text-xs whitespace-pre-wrap text-verde">{textoComprovante(venda)}</pre>
    </Dialogo>
  );
}

function Vendas() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDoAtalho("hoje"));
  const filtro = { de: periodo.de, ate: periodo.ate };
  const resumo = useConsulta<ResumoVendas>("resumo_vendas", filtro);
  const lista = useConsulta<VendaResumo[]>("listar_vendas", filtro);
  const { pedirSenha } = useSenha();
  const [cancelar, setCancelar] = useState<VendaResumo | null>(null);
  const [ver, setVer] = useState<Venda | null>(null);
  const r = resumo.dados;

  return (
    <div className="grid gap-4">
      <FiltroPeriodo valor={periodo} aoMudar={setPeriodo} comHoje />
      {(resumo.erro || lista.erro) && <Aviso tom="erro">{resumo.erro ?? lista.erro}</Aviso>}
      {r && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile rotulo="Total vendido" valor={moeda(r.total)} destaque />
            <Tile rotulo="Vendas" valor={String(r.qtd_vendas)} />
            <Tile rotulo="Ticket médio" valor={moeda(r.ticket_medio)} />
            <Tile rotulo="Margem estimada" valor={moeda(r.margem)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Secao titulo="Por forma de pagamento">
              <ul className="flex flex-col gap-1.5 text-sm">
                {FORMAS_PAGAMENTO.filter((f) => r.por_forma[f.valor]).map((f) => (
                  <li key={f.valor} className="flex justify-between">
                    <span>{f.rotulo}</span>
                    <strong className="tabular-nums">{moeda(r.por_forma[f.valor])}</strong>
                  </li>
                ))}
                {Object.keys(r.por_forma).length === 0 && <li className="text-texto-suave">Nenhuma venda no período.</li>}
                {r.canceladas > 0 && <li className="text-texto-suave">{r.canceladas} venda(s) cancelada(s), fora do total.</li>}
              </ul>
            </Secao>
            <Secao titulo="Mais vendidos">
              <ol className="flex flex-col gap-1.5 text-sm">
                {r.mais_vendidos.map((p, i) => (
                  <li key={p.produto_id} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {i + 1}. {p.produto_nome}
                    </span>
                    <span className="shrink-0 text-texto-suave tabular-nums">
                      {numero(p.unidades)} un · {moeda(p.total)}
                    </span>
                  </li>
                ))}
                {r.mais_vendidos.length === 0 && <li className="text-texto-suave">—</li>}
              </ol>
            </Secao>
          </div>
        </>
      )}
      <Secao titulo="Vendas do período" semPadding>
        {!lista.dados && !lista.erro && <Carregando />}
        {lista.dados && lista.dados.length === 0 && <p className="px-5 pb-4 text-sm text-texto-suave">Nenhuma venda no período.</p>}
        {lista.dados && lista.dados.length > 0 && (
          <ul className="divide-y divide-linha">
            {lista.dados.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <button type="button" className="min-w-0 text-left" onClick={async () => setVer(await chamar<Venda>("obter_venda", { id: v.id }))}>
                  <span className="block font-medium text-verde">
                    {v.numero_formatado} · {ROTULO_FORMA[v.forma_pagamento]} {v.status === "cancelada" && <Badge tone="perigo">Cancelada</Badge>}
                  </span>
                  <span className="text-sm text-texto-suave">
                    {dataHoraBR(v.created_at)} · {v.qtd_itens} {v.qtd_itens === 1 ? "item" : "itens"}
                    {v.cliente && ` · ${v.cliente}`}
                  </span>
                </button>
                <span className="flex items-center gap-2">
                  <strong className={cn("tabular-nums", v.status === "cancelada" ? "text-texto-suave line-through" : "text-verde")}>{moeda(v.total)}</strong>
                  {v.status === "concluida" && (
                    <Button size="sm" variant="fantasma" onClick={async () => (await pedirSenha("cancelar_venda")) && setCancelar(v)}>
                      Cancelar
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Secao>
      <Confirmar
        aberto={cancelar !== null}
        titulo={`Cancelar a venda ${cancelar?.numero_formatado ?? ""}?`}
        mensagem="Os produtos voltam para o estoque e a venda sai dos totais. A venda continua registrada como cancelada."
        pedirMotivo
        rotuloMotivo="Motivo do cancelamento"
        perigo
        textoConfirmar="Cancelar venda"
        aoFechar={() => setCancelar(null)}
        aoConfirmar={async (motivo) => {
          await executar("cancelar_venda", { id: cancelar!.id, motivo });
        }}
      />
      {ver && <Comprovante venda={ver} aoFechar={() => setVer(null)} />}
    </div>
  );
}

function Tile({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className={destaque ? "rounded-xl bg-verde px-4 py-3" : "rounded-xl border border-linha bg-superficie px-4 py-3"}>
      <p className={destaque ? "text-xs font-medium tracking-wide text-ouro uppercase" : "text-xs font-medium tracking-wide text-texto-suave uppercase"}>{rotulo}</p>
      <p className={destaque ? "mt-1 text-2xl font-bold text-creme tabular-nums" : "mt-1 text-xl font-bold text-verde tabular-nums"}>{valor}</p>
    </div>
  );
}
