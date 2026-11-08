import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Scale, ShoppingCart, Trash2 } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Button } from "@/modules/deu-sede/components/ui/button";
import { Badge } from "@/modules/deu-sede/components/ui/badge";
import { Aviso, Carregando, Vazio } from "@/modules/deu-sede/components/ui/aviso";
import { Input, Select } from "@/modules/deu-sede/components/ui/input";
import { Secao, Tabela } from "@/modules/deu-sede/components/ui/secao";
import { rota } from "@/modules/deu-sede/config/modules";
import { useConsulta } from "@/modules/deu-sede/data/cliente";
import { useCadastros } from "@/modules/deu-sede/data/hooks";
import { adicionarAMontagem } from "@/modules/deu-sede/data/montagem";
import type { Oferta } from "@/modules/deu-sede/data/tipos";
import {
  custoOferta,
  melhorCombinacao,
  montarAlternativa,
  ofertasValidas,
  tudoDeUmFornecedor,
  type Alternativa,
  type CustoItem,
  type Desejo,
} from "@/modules/deu-sede/domain/comparacao";
import { arredondar, dataBR, descreverEmbalagem, lerDecimal, moeda, moedaUnitaria, numero, percentual } from "@/modules/deu-sede/domain/formatos";
import { cn } from "@/lib/utils";

export function ComparacaoPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { dados: cad, produtos } = useCadastros();
  const { dados: todas, erro } = useConsulta<Oferta[]>("ofertas_comparacao");
  const iniciais = (params.get("produtos") ?? params.get("produto") ?? "").split(",").filter(Boolean);
  // quantidade desejada, na embalagem padrão do produto
  const [quantidades, setQuantidades] = useState<Record<string, string>>(() => Object.fromEntries(iniciais.map((id) => [id, "1"])));
  const [incluirVencidas, setIncluirVencidas] = useState(false);
  const [escolhaManual, setEscolhaManual] = useState<Record<string, string>>({});
  const [alternativaEscolhida, setAlternativaEscolhida] = useState<string>("melhor");
  const [adicionar, setAdicionar] = useState("");

  const selecionados = Object.keys(quantidades);
  const comOfertas = useMemo(() => [...new Set((todas ?? []).map((o) => o.produto_id))], [todas]);

  const desejos: Desejo[] = useMemo(
    () =>
      Object.entries(quantidades)
        .map(([id, texto]) => {
          const q = lerDecimal(texto) ?? 0;
          return { produto_id: id, unidades: Math.max(0, Number.isNaN(q) ? 0 : q) * (produtos.get(id)?.unidades_por_embalagem ?? 1) };
        })
        .filter((d) => d.unidades > 0),
    [quantidades, produtos],
  );

  const ofertas = useMemo(
    () => ofertasValidas((todas ?? []).filter((o) => quantidades[o.produto_id] !== undefined), incluirVencidas),
    [todas, quantidades, incluirVencidas],
  );

  const melhor = useMemo(() => melhorCombinacao(desejos, ofertas), [desejos, ofertas]);
  const fornecedoresComOferta = [...new Map(ofertas.map((o) => [o.fornecedor_id, o.fornecedor_nome])).entries()];
  const porFornecedor = fornecedoresComOferta.map(([id, nome]) => ({ id, nome, alt: tudoDeUmFornecedor(id, desejos, ofertas) }));

  const manual: Alternativa = useMemo(() => {
    const escolhas: Record<string, CustoItem> = {};
    for (const d of desejos) {
      const id = escolhaManual[d.produto_id] ?? melhor.escolhas[d.produto_id]?.oferta.cotacao_item_id;
      const o = ofertas.find((x) => x.cotacao_item_id === id && x.produto_id === d.produto_id);
      if (o) escolhas[d.produto_id] = custoOferta(o, d.unidades);
    }
    return montarAlternativa(escolhas, desejos);
  }, [desejos, escolhaManual, melhor, ofertas]);

  const alternativas: { chave: string; titulo: string; alt: Alternativa }[] = [
    { chave: "melhor", titulo: "Melhor combinação (com frete)", alt: melhor },
    ...porFornecedor.map((f) => ({ chave: `f:${f.id}`, titulo: `Tudo de ${f.nome}`, alt: f.alt })),
    { chave: "manual", titulo: "Minha escolha", alt: manual },
  ];
  const escolhida = alternativas.find((a) => a.chave === alternativaEscolhida) ?? alternativas[0];

  function levarParaPedido() {
    const alt = escolhida.alt;
    adicionarAMontagem(
      Object.values(alt.escolhas).map((c) => ({ produto_id: c.oferta.produto_id, unidades: c.unidades, opcao: `cot:${c.oferta.cotacao_item_id}` })),
      Object.fromEntries(
        alt.porFornecedor.map((g) => [
          g.fornecedor_id,
          {
            frete: g.frete ? String(g.frete).replace(".", ",") : "",
            desconto_geral: g.descontoGeral ? String(g.descontoGeral).replace(".", ",") : "",
            condicao_pagamento: g.itens[0]?.oferta.condicao_pagamento ?? "",
          },
        ]),
      ),
    );
    navigate(rota("pedidos", "montar-comparacao"));
  }

  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (!todas || !cad) return <Carregando />;

  const disponiveisParaAdicionar = comOfertas.filter((id) => quantidades[id] === undefined && produtos.get(id));

  return (
    <>
      <PageHeader
        title="Comparação de preços"
        description="Compara o mesmo produto entre fornecedores pelo preço por unidade, com frete e descontos das cotações recebidas."
      />

      {todas.length === 0 ? (
        <Vazio icone={Scale} titulo="Ainda não há cotações recebidas">
          Registre cotações dos fornecedores e marque como recebidas para comparar os preços aqui.
        </Vazio>
      ) : (
        <div className="grid gap-5">
          <Secao titulo="O que você quer comprar" descricao="Quantidade na embalagem padrão de cada produto.">
            <div className="flex flex-col gap-2">
              {selecionados.map((id) => {
                const p = produtos.get(id);
                const q = lerDecimal(quantidades[id]) ?? 0;
                return (
                  <div key={id} className="flex flex-wrap items-center gap-2 rounded-xl border border-linha p-2 pl-3">
                    <span className="min-w-0 flex-1 font-medium text-verde">{p?.nome ?? "Produto"}</span>
                    <Input
                      aria-label={`Quantidade de ${p?.nome}`}
                      inputMode="decimal"
                      className="w-24"
                      value={quantidades[id]}
                      onChange={(e) => setQuantidades((x) => ({ ...x, [id]: e.target.value }))}
                    />
                    <span className="text-sm text-texto-suave">
                      {p ? descreverEmbalagem(p.tipo_embalagem, p.unidades_por_embalagem) : ""} = {numero(q * (p?.unidades_por_embalagem ?? 1))} un
                    </span>
                    <Button
                      variant="fantasma"
                      size="icone"
                      aria-label={`Tirar ${p?.nome}`}
                      onClick={() =>
                        setQuantidades((x) => {
                          const n = { ...x };
                          delete n[id];
                          return n;
                        })
                      }
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                );
              })}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select value={adicionar} onChange={(e) => setAdicionar(e.target.value)} aria-label="Produto para comparar">
                  <option value="">Adicionar produto com cotação…</option>
                  {disponiveisParaAdicionar.map((id) => (
                    <option key={id} value={id}>
                      {produtos.get(id)?.nome}
                    </option>
                  ))}
                </Select>
                <Button
                  variant="secundario"
                  disabled={!adicionar}
                  onClick={() => {
                    setQuantidades((x) => ({ ...x, [adicionar]: "1" }));
                    setAdicionar("");
                  }}
                >
                  Adicionar
                </Button>
                <Button
                  variant="contorno"
                  disabled={disponiveisParaAdicionar.length === 0}
                  onClick={() => setQuantidades((x) => ({ ...x, ...Object.fromEntries(disponiveisParaAdicionar.map((id) => [id, "1"])) }))}
                >
                  Todos
                </Button>
              </div>
              <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-verde">
                <input type="checkbox" className="size-5 accent-verde" checked={incluirVencidas} onChange={(e) => setIncluirVencidas(e.target.checked)} />
                Incluir cotações vencidas
              </label>
            </div>
          </Secao>

          {desejos.map((d) => {
            const p = produtos.get(d.produto_id);
            const lista = ofertas
              .filter((o) => o.produto_id === d.produto_id)
              .map((o) => ({ o, c: custoOferta(o, d.unidades) }))
              .sort((a, b) => a.c.subtotal - b.c.subtotal);
            const vencidasOcultas = !incluirVencidas && (todas ?? []).some((o) => o.produto_id === d.produto_id && o.vencida);
            const menorUnit = lista.length ? Math.min(...lista.map((x) => Number(x.o.preco_unitario))) : null;
            const melhorSubtotal = lista[0]?.c.subtotal ?? null;
            const escolhaAtual = manual.escolhas[d.produto_id]?.oferta.cotacao_item_id;
            return (
              <Secao
                key={d.produto_id}
                titulo={p?.nome ?? "Produto"}
                descricao={`${numero(d.unidades)} unidades desejadas`}
                semPadding
              >
                {lista.length === 0 ? (
                  <p className="px-5 pb-4 text-sm text-texto-suave">
                    Sem preço registrado {vencidasOcultas ? "(há cotações vencidas — marque “Incluir cotações vencidas”)" : "em cotações recebidas"}.
                  </p>
                ) : (
                  <Tabela>
                    <thead>
                      <tr>
                        <th>Minha escolha</th>
                        <th>Fornecedor</th>
                        <th>Embalagem</th>
                        <th className="num">Preço/emb.</th>
                        <th className="num">Por unidade</th>
                        <th className="num">Precisa</th>
                        <th className="num">Total</th>
                        <th className="num">Diferença</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map(({ o, c }) => {
                        const dif = melhorSubtotal !== null ? arredondar(c.subtotal - melhorSubtotal) : 0;
                        return (
                          <tr key={o.cotacao_item_id}>
                            <td>
                              <input
                                type="radio"
                                className="size-5 accent-verde"
                                name={`escolha-${d.produto_id}`}
                                aria-label={`Escolher ${o.fornecedor_nome}`}
                                checked={escolhaAtual === o.cotacao_item_id}
                                onChange={() => {
                                  setEscolhaManual((x) => ({ ...x, [d.produto_id]: o.cotacao_item_id }));
                                  setAlternativaEscolhida("manual");
                                }}
                              />
                            </td>
                            <td>
                              <span className="font-medium text-verde">{o.fornecedor_nome}</span>
                              <span className="block text-xs text-texto-suave">
                                <Link to={rota("cotacoes", o.cotacao_id)} className="underline">
                                  {o.cotacao_numero}
                                </Link>{" "}
                                · {dataBR(o.data_cotacao)} {o.vencida && <Badge tone="perigo">Vencida</Badge>}
                                {Number(o.frete) > 0 && ` · frete ${moeda(o.frete)}`}
                              </span>
                            </td>
                            <td>{descreverEmbalagem(o.tipo_embalagem, o.unidades_por_embalagem)}</td>
                            <td className="num">{moeda(o.preco_embalagem)}</td>
                            <td className="num">
                              {moedaUnitaria(o.preco_unitario)}{" "}
                              {Number(o.preco_unitario) === menorUnit && <Badge tone="verde">Melhor preço</Badge>}
                            </td>
                            <td className="num">
                              {numero(c.embalagens)} emb.
                              {c.unidades !== d.unidades && <span className="block text-xs text-texto-suave">{numero(c.unidades)} un</span>}
                            </td>
                            <td className="num">{moeda(c.subtotal)}</td>
                            <td className="num">{dif > 0 ? `+ ${moeda(dif)} (${percentual((dif / (melhorSubtotal || 1)) * 100)})` : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Tabela>
                )}
              </Secao>
            );
          })}

          {desejos.length > 0 && (
            <Secao
              titulo="Alternativas de compra"
              descricao="Total com frete e descontos gerais (uma vez por fornecedor). Escolha uma e leve para o Montar Pedido."
            >
              <div className="grid gap-3 md:grid-cols-2">
                {alternativas.map((a) => {
                  const diferenca = arredondar(a.alt.total - melhor.total);
                  const completa = a.alt.semPreco.length === 0;
                  return (
                    <label
                      key={a.chave}
                      className={cn(
                        "flex cursor-pointer flex-col gap-2 rounded-xl border p-4",
                        alternativaEscolhida === a.chave ? "border-amarelo bg-amarelo/10" : "border-linha",
                      )}
                    >
                      <span className="flex items-start gap-2">
                        <input
                          type="radio"
                          name="alternativa"
                          className="mt-1 size-5 accent-verde"
                          checked={alternativaEscolhida === a.chave}
                          onChange={() => setAlternativaEscolhida(a.chave)}
                        />
                        <span className="flex-1">
                          <span className="block font-semibold text-verde">{a.titulo}</span>
                          <span className="text-2xl font-bold text-verde tabular-nums">{moeda(a.alt.total)}</span>{" "}
                          {a.chave !== "melhor" && completa && diferenca > 0 && (
                            <span className="text-sm font-medium text-marrom">+ {moeda(diferenca)} que a melhor</span>
                          )}
                          {a.chave !== "melhor" && completa && diferenca <= 0 && <Badge tone="verde">Igual à melhor</Badge>}
                        </span>
                      </span>
                      <span className="text-sm text-texto-suave">
                        Produtos {moeda(a.alt.itens)} · Frete {moeda(a.alt.fretes)}
                        {a.alt.descontosGerais > 0 && ` · Descontos − ${moeda(a.alt.descontosGerais)}`}
                      </span>
                      <ul className="text-sm text-texto">
                        {a.alt.porFornecedor.map((g) => (
                          <li key={g.fornecedor_id}>
                            {g.fornecedor_nome}: {g.itens.length} {g.itens.length === 1 ? "produto" : "produtos"} · {moeda(g.total)}
                          </li>
                        ))}
                      </ul>
                      {!completa && (
                        <span className="text-sm font-medium text-perigo">
                          Sem preço para: {a.alt.semPreco.map((id) => produtos.get(id)?.nome).join(", ")}
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              <div className="mt-4 flex justify-end">
                <Button onClick={levarParaPedido} disabled={Object.keys(escolhida.alt.escolhas).length === 0}>
                  <ShoppingCart className="size-4" /> Levar para Montar Pedido
                </Button>
              </div>
            </Secao>
          )}
        </div>
      )}
    </>
  );
}
