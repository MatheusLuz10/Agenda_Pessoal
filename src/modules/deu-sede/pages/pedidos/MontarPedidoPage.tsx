import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CircleCheck, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Button, LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Badge } from "@/modules/deu-sede/components/ui/badge";
import { Aviso, Carregando, Vazio } from "@/modules/deu-sede/components/ui/aviso";
import { Campo, Input, Select, Textarea } from "@/modules/deu-sede/components/ui/input";
import { Confirmar } from "@/modules/deu-sede/components/ui/dialogo";
import { Secao } from "@/modules/deu-sede/components/ui/secao";
import { BotaoColarLista, ColarListaDialog, type CandidatoLista } from "@/modules/deu-sede/components/ColarListaDialog";
import { rota } from "@/modules/deu-sede/config/modules";
import { executar, useConsulta } from "@/modules/deu-sede/data/cliente";
import { useCadastros, useEnvio } from "@/modules/deu-sede/data/hooks";
import { lerMontagem, limparMontagem, novaMontagem, salvarMontagem, type ConfigFornecedor, type Montagem } from "@/modules/deu-sede/data/montagem";
import type { Embalagem, Oferta, PedidoResumo } from "@/modules/deu-sede/data/tipos";
import { arredondar, dataBR, descreverEmbalagem, lerDecimal, moeda, moedaUnitaria, numero, paraCampo } from "@/modules/deu-sede/domain/formatos";

// Uma forma de comprar o produto: preço de cotação recebida ou preço atual.
interface Opcao {
  chave: string;
  produto_id: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  tipo_embalagem: Embalagem;
  unidades_por_embalagem: number;
  preco_embalagem: number;
  desconto_por_embalagem: number;
  preco_unitario: number;
  descricao: string;
  vencida: boolean;
  cotacao_item_id?: string;
}

export function MontarPedidoPage() {
  const { dados: cad, produtos, fornecedores, erro } = useCadastros();
  const ofertas = useConsulta<Oferta[]>("ofertas_comparacao");
  const [montagem, setMontagem] = useState<Montagem>(() => lerMontagem());
  const [entradas, setEntradas] = useState<Record<string, string>>({});
  const [adicionar, setAdicionar] = useState("");
  const [colarAberto, setColarAberto] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [gerados, setGerados] = useState<PedidoResumo[] | null>(null);
  const envio = useEnvio();

  // Rascunho salvo no aparelho a cada mudança.
  useEffect(() => salvarMontagem(montagem), [montagem]);

  const opcoesPorProduto = useMemo(() => {
    const mapa = new Map<string, Opcao[]>();
    const add = (o: Opcao) => mapa.set(o.produto_id, [...(mapa.get(o.produto_id) ?? []), o]);
    for (const o of ofertas.dados ?? []) {
      if (!o.fornecedor_ativo) continue;
      add({
        chave: `cot:${o.cotacao_item_id}`,
        produto_id: o.produto_id,
        fornecedor_id: o.fornecedor_id,
        fornecedor_nome: o.fornecedor_nome,
        tipo_embalagem: o.tipo_embalagem,
        unidades_por_embalagem: o.unidades_por_embalagem,
        preco_embalagem: Number(o.preco_embalagem),
        desconto_por_embalagem: Number(o.quantidade_embalagens) > 0 ? Number(o.desconto_valor) / Number(o.quantidade_embalagens) : 0,
        preco_unitario: Number(o.preco_unitario),
        descricao: `cotação ${o.cotacao_numero} de ${dataBR(o.data_cotacao)}`,
        vencida: o.vencida,
        cotacao_item_id: o.cotacao_item_id,
      });
    }
    for (const v of cad?.fornecedor_produtos ?? []) {
      const f = fornecedores.get(v.fornecedor_id);
      if (!v.ativo || v.preco_atual === null || !f?.ativo) continue;
      add({
        chave: `atual:${v.id}`,
        produto_id: v.produto_id,
        fornecedor_id: v.fornecedor_id,
        fornecedor_nome: f.nome,
        tipo_embalagem: v.tipo_embalagem,
        unidades_por_embalagem: v.unidades_por_embalagem,
        preco_embalagem: Number(v.preco_atual),
        desconto_por_embalagem: 0,
        preco_unitario: Number(v.preco_unitario),
        descricao: `preço atual (${v.preco_atualizado_em ? dataBR(v.preco_atualizado_em) : "sem data"})`,
        vencida: false,
      });
    }
    for (const lista of mapa.values()) lista.sort((a, b) => Number(a.vencida) - Number(b.vencida) || a.preco_unitario - b.preco_unitario);
    return mapa;
  }, [ofertas.dados, cad, fornecedores]);

  const opcaoDe = (chave: string) => [...opcoesPorProduto.values()].flat().find((o) => o.chave === chave);
  const melhorOpcao = (produtoId: string) => opcoesPorProduto.get(produtoId)?.[0];

  // Linhas calculadas (quantidade na embalagem da opção escolhida).
  const linhas = montagem.itens.map((it) => {
    const opcao = opcaoDe(it.opcao) ?? melhorOpcao(it.produto_id);
    const unidadesEmb = opcao?.unidades_por_embalagem ?? produtos.get(it.produto_id)?.unidades_por_embalagem ?? 1;
    const quantidade = arredondar(it.unidades / unidadesEmb, 3);
    const bruto = opcao ? arredondar(quantidade * opcao.preco_embalagem) : 0;
    const desconto = opcao ? arredondar(opcao.desconto_por_embalagem * quantidade) : 0;
    return { it, opcao, quantidade, subtotal: arredondar(bruto - desconto), desconto };
  });

  const grupos = useMemo(() => {
    const mapa = new Map<string, { fornecedor_id: string; nome: string; linhas: typeof linhas; subtotal: number }>();
    for (const l of linhas) {
      if (!l.opcao) continue;
      const g = mapa.get(l.opcao.fornecedor_id) ?? { fornecedor_id: l.opcao.fornecedor_id, nome: l.opcao.fornecedor_nome, linhas: [], subtotal: 0 };
      g.linhas.push(l);
      g.subtotal = arredondar(g.subtotal + l.subtotal);
      mapa.set(l.opcao.fornecedor_id, g);
    }
    return [...mapa.values()];
  }, [linhas]);

  const config = (fid: string): ConfigFornecedor => montagem.fornecedores[fid] ?? {};
  const totalGrupo = (g: (typeof grupos)[number]) =>
    arredondar(g.subtotal + (lerDecimal(config(g.fornecedor_id).frete) || 0) - (lerDecimal(config(g.fornecedor_id).desconto_geral) || 0));
  const totalGeral = arredondar(grupos.reduce((s, g) => s + totalGrupo(g), 0));
  const semPreco = linhas.filter((l) => !l.opcao);

  function atualizar(m: Partial<Montagem>) {
    // qualquer mudança na lista vira um lote novo (um novo pedido)
    setMontagem((x) => ({ ...x, ...m, lote_id: crypto.randomUUID() }));
  }
  function mudarItem(chave: string, campos: Partial<Montagem["itens"][number]>) {
    atualizar({ itens: montagem.itens.map((i) => (i.chave === chave ? { ...i, ...campos } : i)) });
  }
  function mudarConfig(fid: string, campos: ConfigFornecedor) {
    atualizar({ fornecedores: { ...montagem.fornecedores, [fid]: { ...config(fid), ...campos } } });
  }

  function adicionarProduto(produtoId: string, unidades?: number) {
    const p = produtos.get(produtoId);
    if (!p) return;
    const opcao = melhorOpcao(produtoId);
    const u = unidades ?? (opcao?.unidades_por_embalagem ?? p.unidades_por_embalagem);
    const existente = montagem.itens.find((i) => i.produto_id === produtoId);
    if (existente) mudarItem(existente.chave, { unidades: u });
    else atualizar({ itens: [...montagem.itens, { chave: crypto.randomUUID(), produto_id: produtoId, unidades: u, opcao: opcao?.chave ?? "" }] });
  }

  function validar(): string | null {
    if (montagem.itens.length === 0) return "Adicione ao menos um produto.";
    if (semPreco.length) return `Sem preço para: ${semPreco.map((l) => produtos.get(l.it.produto_id)?.nome).join(", ")}. Registre uma cotação ou o preço atual do fornecedor.`;
    if (linhas.some((l) => !(l.quantidade > 0))) return "Informe a quantidade de todos os produtos.";
    for (const g of grupos) {
      for (const [rot, campo] of [["Frete", "frete"], ["Desconto", "desconto_geral"]] as const) {
        const v = lerDecimal(config(g.fornecedor_id)[campo]);
        if (v !== null && (Number.isNaN(v) || v < 0)) return `${rot} inválido para ${g.nome}.`;
      }
    }
    return null;
  }

  // Erros aparecem na própria janela de confirmação; o lote_id garante que
  // repetir o envio não duplica pedidos.
  async function gerar() {
    const resultado = await executar<{ pedidos: PedidoResumo[] }>("gerar_pedidos", {
        lote_id: montagem.lote_id,
        itens: linhas.map((l) => ({
          fornecedor_id: l.opcao!.fornecedor_id,
          produto_id: l.it.produto_id,
          cotacao_item_id: l.opcao!.cotacao_item_id,
          tipo_embalagem: l.opcao!.tipo_embalagem,
          unidades_por_embalagem: l.opcao!.unidades_por_embalagem,
          quantidade_embalagens: l.quantidade,
          preco_embalagem: l.opcao!.preco_embalagem,
          desconto_valor: 0,
        })),
        fornecedores: grupos.map((g) => ({
          fornecedor_id: g.fornecedor_id,
          frete: lerDecimal(config(g.fornecedor_id).frete) ?? 0,
          desconto_geral: lerDecimal(config(g.fornecedor_id).desconto_geral) ?? 0,
          condicao_pagamento: config(g.fornecedor_id).condicao_pagamento,
          previsao_entrega: config(g.fornecedor_id).previsao_entrega || null,
          observacoes: config(g.fornecedor_id).observacoes,
        })),
    });
    setGerados(resultado.pedidos);
    limparMontagem();
    setMontagem(novaMontagem());
  }

  if (erro || ofertas.erro) return <Aviso tom="erro">{erro ?? ofertas.erro}</Aviso>;
  if (!cad || !ofertas.dados) return <Carregando />;

  if (gerados) {
    return (
      <>
        <PageHeader title="Pedidos gerados" />
        <Aviso tom="sucesso" className="mb-4">
          {gerados.length === 1 ? "1 pedido gerado e aprovado." : `${gerados.length} pedidos gerados e aprovados — um por fornecedor.`} Agora envie
          cada um ao fornecedor pelo WhatsApp.
        </Aviso>
        <ul className="grid gap-2 sm:grid-cols-2">
          {gerados.map((p) => (
            <li key={p.id}>
              <Link to={rota("pedidos", p.id)} className="flex flex-col gap-1 rounded-xl border border-linha bg-superficie p-4 hover:border-amarelo">
                <span className="flex items-center gap-2 font-semibold text-verde">
                  <CircleCheck className="size-5 text-sucesso" /> {p.numero_formatado} · {p.fornecedor_nome}
                </span>
                <span className="text-sm text-texto-suave">
                  {p.qtd_itens} {p.qtd_itens === 1 ? "produto" : "produtos"} · {moeda(p.valor_total)} · abrir para enviar pelo WhatsApp
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex gap-2">
          <Button variant="contorno" onClick={() => setGerados(null)}>
            Montar outro pedido
          </Button>
          <LinkBotao to={rota("pedidos")} variant="secundario">
            Ver pedidos
          </LinkBotao>
        </div>
      </>
    );
  }

  const candidatos: CandidatoLista[] = (cad.produtos ?? [])
    .filter((p) => p.ativo)
    .map((p) => ({
      id: p.id,
      nome: p.nome,
      rotulo: p.nome,
      codigos: [p.codigo, ...(cad.fornecedor_produtos.filter((v) => v.produto_id === p.id).map((v) => v.codigo_no_fornecedor))],
      unidadesPorEmbalagem: p.unidades_por_embalagem,
    }));

  return (
    <>
      <PageHeader
        title="Montar pedido pela comparação"
        description="Monte a lista de compras e escolha o fornecedor de cada produto. Itens de fornecedores diferentes viram pedidos separados."
        actions={<BotaoColarLista aoClicar={() => setColarAberto(true)} />}
      />
      <div className="grid gap-5">
        <Secao titulo="Lista de compras">
          {montagem.itens.length === 0 ? (
            <Vazio icone={ShoppingCart} titulo="Lista vazia">
              Adicione produtos abaixo, cole uma lista ou traga uma escolha da Comparação de preços.
            </Vazio>
          ) : (
            <ul className="flex flex-col gap-3">
              {linhas.map(({ it, opcao, quantidade, subtotal }) => {
                const p = produtos.get(it.produto_id);
                const opcoes = opcoesPorProduto.get(it.produto_id) ?? [];
                return (
                  <li key={it.chave} className="rounded-xl border border-linha p-3">
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <Link to={rota("produtos", it.produto_id)} className="font-semibold text-verde hover:underline">
                        {p?.nome}
                      </Link>
                      <Button
                        variant="fantasma"
                        size="icone"
                        aria-label={`Tirar ${p?.nome}`}
                        onClick={() => atualizar({ itens: montagem.itens.filter((i) => i.chave !== it.chave) })}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {opcoes.length === 0 ? (
                      <Aviso tom="atencao">Sem preço registrado. Registre uma cotação ou o preço atual de um fornecedor.</Aviso>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
                        <Campo rotulo="Comprar de">
                          {(id) => (
                            <Select
                              id={id}
                              value={opcao?.chave ?? ""}
                              onChange={(e) => {
                                const nova = opcaoDe(e.target.value);
                                // mantém as unidades, arredondando para embalagens inteiras
                                const u = nova ? Math.ceil(it.unidades / nova.unidades_por_embalagem - 1e-9) * nova.unidades_por_embalagem : it.unidades;
                                setEntradas((x) => ({ ...x, [it.chave]: "" }));
                                mudarItem(it.chave, { opcao: e.target.value, unidades: u });
                              }}
                            >
                              {opcoes.map((o) => (
                                <option key={o.chave} value={o.chave}>
                                  {o.fornecedor_nome} — {moeda(o.preco_embalagem)} / {descreverEmbalagem(o.tipo_embalagem, o.unidades_por_embalagem)} (
                                  {moedaUnitaria(o.preco_unitario)}/un) · {o.descricao}
                                  {o.vencida ? " · VENCIDA" : ""}
                                </option>
                              ))}
                            </Select>
                          )}
                        </Campo>
                        <Campo rotulo={`Qtd. (${opcao ? descreverEmbalagem(opcao.tipo_embalagem, opcao.unidades_por_embalagem).toLowerCase() : "emb."})`}>
                          {(id) => (
                            <Input
                              id={id}
                              inputMode="decimal"
                              value={entradas[it.chave] || paraCampo(quantidade)}
                              onChange={(e) => {
                                setEntradas((x) => ({ ...x, [it.chave]: e.target.value }));
                                const q = lerDecimal(e.target.value);
                                if (q !== null && !Number.isNaN(q) && q >= 0) mudarItem(it.chave, { unidades: q * (opcao?.unidades_por_embalagem ?? 1) });
                              }}
                            />
                          )}
                        </Campo>
                      </div>
                    )}
                    {opcao && (
                      <p className="mt-2 flex flex-wrap gap-x-4 text-sm text-texto-suave">
                        <span>
                          Subtotal: <strong className="text-verde">{moeda(subtotal)}</strong>
                        </span>
                        <span>{numero(it.unidades)} unidades</span>
                        {opcao.vencida && <Badge tone="perigo">Cotação vencida — confirme o preço</Badge>}
                        {opcoes[0] && opcao.chave !== opcoes[0].chave && !opcoes[0].vencida && opcoes[0].preco_unitario < opcao.preco_unitario && (
                          <span className="text-marrom">Há opção mais barata por unidade ({opcoes[0].fornecedor_nome})</span>
                        )}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Select value={adicionar} onChange={(e) => setAdicionar(e.target.value)} aria-label="Produto para adicionar">
              <option value="">Escolha um produto para adicionar…</option>
              {cad.produtos
                .filter((p) => p.ativo && !montagem.itens.some((i) => i.produto_id === p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                    {opcoesPorProduto.has(p.id) ? "" : " (sem preço)"}
                  </option>
                ))}
            </Select>
            <Button
              variant="secundario"
              disabled={!adicionar}
              onClick={() => {
                adicionarProduto(adicionar);
                setAdicionar("");
              }}
            >
              <Plus className="size-4" /> Adicionar
            </Button>
          </div>
        </Secao>

        {grupos.length > 0 && (
          <Secao titulo="Conferência por fornecedor" descricao={`Serão gerados ${grupos.length} ${grupos.length === 1 ? "pedido" : "pedidos"} independentes.`}>
            <div className="grid gap-4">
              {grupos.map((g) => (
                <div key={g.fornecedor_id} className="rounded-xl border border-linha p-4">
                  <p className="mb-2 font-semibold text-verde">{g.nome}</p>
                  <ul className="mb-3 text-sm">
                    {g.linhas.map((l) => (
                      <li key={l.it.chave} className="flex justify-between gap-3 border-b border-linha/60 py-1.5 last:border-0">
                        <span>
                          {numero(l.quantidade)} × {descreverEmbalagem(l.opcao!.tipo_embalagem, l.opcao!.unidades_por_embalagem)} ·{" "}
                          {produtos.get(l.it.produto_id)?.nome} a {moeda(l.opcao!.preco_embalagem)}
                          {l.desconto > 0 && ` (desconto ${moeda(l.desconto)})`}
                        </span>
                        <span className="tabular-nums">{moeda(l.subtotal)}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Campo rotulo="Frete (R$)">
                      {(id) => <Input id={id} inputMode="decimal" placeholder="0,00" value={config(g.fornecedor_id).frete ?? ""} onChange={(e) => mudarConfig(g.fornecedor_id, { frete: e.target.value })} />}
                    </Campo>
                    <Campo rotulo="Desconto geral (R$)">
                      {(id) => <Input id={id} inputMode="decimal" placeholder="0,00" value={config(g.fornecedor_id).desconto_geral ?? ""} onChange={(e) => mudarConfig(g.fornecedor_id, { desconto_geral: e.target.value })} />}
                    </Campo>
                    <Campo rotulo="Condição de pagamento">
                      {(id) => <Input id={id} value={config(g.fornecedor_id).condicao_pagamento ?? ""} onChange={(e) => mudarConfig(g.fornecedor_id, { condicao_pagamento: e.target.value })} />}
                    </Campo>
                    <Campo rotulo="Previsão de entrega">
                      {(id) => <Input id={id} type="date" value={config(g.fornecedor_id).previsao_entrega ?? ""} onChange={(e) => mudarConfig(g.fornecedor_id, { previsao_entrega: e.target.value })} />}
                    </Campo>
                    <Campo rotulo="Observações" className="sm:col-span-2">
                      {(id) => <Textarea id={id} rows={2} value={config(g.fornecedor_id).observacoes ?? ""} onChange={(e) => mudarConfig(g.fornecedor_id, { observacoes: e.target.value })} />}
                    </Campo>
                  </div>
                  <p className="mt-3 flex justify-between border-t border-linha pt-2 font-semibold text-verde">
                    <span>Total do pedido</span>
                    <span className="tabular-nums">{moeda(totalGrupo(g))}</span>
                  </p>
                </div>
              ))}
              <p className="flex justify-between rounded-xl bg-verde px-4 py-3 text-lg font-bold text-creme">
                <span>Total geral da compra</span>
                <span className="tabular-nums">{moeda(totalGeral)}</span>
              </p>
            </div>
          </Secao>
        )}

        {envio.erro && <Aviso tom="erro">{envio.erro}</Aviso>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {montagem.itens.length > 0 && (
            <Button variant="contorno" onClick={() => setMontagem(novaMontagem())}>
              Limpar lista
            </Button>
          )}
          <Button
            size="lg"
            disabled={montagem.itens.length === 0 || envio.enviando}
            onClick={() => {
              const problema = validar();
              if (problema) envio.setErro(problema);
              else setConfirmar(true);
            }}
          >
            <ShoppingCart className="size-5" /> Gerar {grupos.length > 1 ? `${grupos.length} pedidos` : "pedido"}
          </Button>
        </div>
      </div>

      <ColarListaDialog
        aberto={colarAberto}
        titulo="Colar lista de compras"
        explicacao="Cole a lista de produtos e quantidades (na embalagem padrão de cada produto). O fornecedor de cada item é escolhido depois."
        candidatos={candidatos}
        aoFechar={() => setColarAberto(false)}
        aoAplicar={(itens) => {
          let atual = montagem.itens;
          for (const it of itens) {
            const p = produtos.get(it.candidatoId);
            const unidades = (it.quantidade ?? 1) * (p?.unidades_por_embalagem ?? 1);
            const existente = atual.find((i) => i.produto_id === it.candidatoId);
            atual = existente
              ? atual.map((i) => (i.chave === existente.chave ? { ...i, unidades } : i))
              : [...atual, { chave: crypto.randomUUID(), produto_id: it.candidatoId, unidades, opcao: melhorOpcao(it.candidatoId)?.chave ?? "" }];
          }
          setEntradas({});
          atualizar({ itens: atual });
        }}
      />
      <Confirmar
        aberto={confirmar}
        titulo={grupos.length > 1 ? `Gerar ${grupos.length} pedidos?` : "Gerar pedido?"}
        mensagem={
          <>
            <ul className="mb-3 flex flex-col gap-1">
              {grupos.map((g) => (
                <li key={g.fornecedor_id} className="flex justify-between gap-3">
                  <span>{g.nome}</span>
                  <strong className="tabular-nums">{moeda(totalGrupo(g))}</strong>
                </li>
              ))}
              <li className="flex justify-between gap-3 border-t border-linha pt-1 font-bold">
                <span>Total geral</span>
                <span className="tabular-nums">{moeda(totalGeral)}</span>
              </li>
            </ul>
            <p>Os pedidos são criados já aprovados, com os preços congelados. O envio ao fornecedor é feito em seguida, pelo WhatsApp.</p>
          </>
        }
        textoConfirmar="Gerar pedidos"
        aoFechar={() => setConfirmar(false)}
        aoConfirmar={gerar}
      />
    </>
  );
}
