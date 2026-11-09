import { useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronRight, ClipboardList, PackageCheck, Scale, ShoppingCart, TrendingDown, TrendingUp } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Aviso, Carregando } from "@/modules/deu-sede/components/ui/aviso";
import { Secao, Tabela } from "@/modules/deu-sede/components/ui/secao";
import { FiltroPeriodo } from "@/modules/deu-sede/components/FiltroPeriodo";
import { periodoDoAtalho, type Periodo } from "@/modules/deu-sede/domain/periodo";
import { rota } from "@/modules/deu-sede/config/modules";
import { useConsulta } from "@/modules/deu-sede/data/cliente";
import type { Painel, PainelFinanceiro, VariacaoPreco } from "@/modules/deu-sede/data/tipos";
import { dataBR, mesCurto, moeda, moedaUnitaria, numero, percentual } from "@/modules/deu-sede/domain/formatos";

const COR = "var(--color-dado)";

export function DashboardPage() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDoAtalho("mes"));
  const { dados: d, erro } = useConsulta<Painel>("painel", { de: periodo.de, ate: periodo.ate });
  // lucro e caixa (migração 0016); se ainda não existir no banco, o painel segue sem eles
  const { dados: fin } = useConsulta<PainelFinanceiro>("painel_financeiro", { de: periodo.de, ate: periodo.ate });

  return (
    <>
      <PageHeader title="Painel inicial" description="Só pedidos enviados ao fornecedor contam como compra. Orçamentos não entram nos valores." />
      <div className="mb-4">
        <FiltroPeriodo valor={periodo} aoMudar={setPeriodo} />
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!d && !erro && <Carregando />}
      {d && (
        <div className="grid gap-5">
          {fin && (
            <div className="grid gap-2">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Numero rotulo="Lucro total" valor={moeda(fin.lucro_total)} detalhe={`vendas desde o início: ${moeda(fin.vendas_total)}`} destaque />
                <Numero rotulo="Lucro no período" valor={moeda(fin.lucro_periodo)} detalhe={`vendas no período: ${moeda(fin.vendas_periodo)}`} />
                {fin.saldo_caixa !== null && (
                  <Link to={rota("contas")} className="contents">
                    <Numero rotulo="Saldo do caixa" valor={moeda(fin.saldo_caixa)} negativo={fin.saldo_caixa < 0} />
                  </Link>
                )}
                {fin.contas_vencidas !== null && (
                  <Link to={rota("contas")} className="contents">
                    <Numero
                      rotulo="Contas vencidas"
                      valor={moeda(fin.contas_vencidas)}
                      detalhe={`${fin.qtd_contas_vencidas ?? 0} ${fin.qtd_contas_vencidas === 1 ? "parcela" : "parcelas"} · em aberto ${moeda(fin.contas_em_aberto)}`}
                      negativo={(fin.qtd_contas_vencidas ?? 0) > 0}
                    />
                  </Link>
                )}
              </div>
              <p className="text-xs text-texto-suave">
                Lucro = vendas do PDV − custo dos produtos vendidos.
                {fin.itens_sem_custo > 0 && ` ${fin.itens_sem_custo} ${fin.itens_sem_custo === 1 ? "item vendido estava" : "itens vendidos estavam"} sem custo e entram com lucro cheio.`}
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Numero rotulo="Total comprado" valor={moeda(d.total_comprado)} destaque />
            <Numero rotulo="Valor já recebido" valor={moeda(d.total_recebido)} />
            <Numero rotulo="Pedidos realizados" valor={String(d.pedidos_realizados)} />
            <Numero rotulo="Valor médio por pedido" valor={moeda(d.valor_medio_pedido)} />
            <Numero rotulo="Total de fretes" valor={moeda(d.total_frete)} />
            <Numero rotulo="Orçamentos recebidos" valor={String(d.orcamentos_recebidos)} />
            <Numero rotulo="Fornecedores ativos" valor={String(d.fornecedores_ativos)} />
            <Numero rotulo="Descontos obtidos" valor={moeda(d.total_descontos)} />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Atalho para={rota("cotacoes", "nova")} icone={ClipboardList} texto="Nova cotação" />
            <Atalho para={rota("comparacao")} icone={Scale} texto="Comparar preços" />
            <Atalho para={rota("pedidos", "montar")} icone={ShoppingCart} texto="Montar pedido" />
            <Atalho para={rota("recebimentos")} icone={PackageCheck} texto="Conferir entrega" />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Secao titulo="Para fazer" descricao="Situação de agora (não depende do período)." semPadding>
              <ul className="divide-y divide-linha">
                <Pendencia para={rota("cotacoes")} texto="Orçamentos aguardando análise" n={d.orcamentos_aguardando_analise} />
                <Pendencia para={rota("pedidos")} texto="Pedidos aprovados para enviar ao fornecedor" n={d.pedidos_aprovados_nao_enviados} />
                <Pendencia para={rota("pedidos")} texto="Pedidos aguardando confirmação do fornecedor" n={d.pedidos_aguardando_confirmacao} />
                <Pendencia para={rota("recebimentos")} texto="Pedidos aguardando recebimento" n={d.pedidos_aguardando_recebimento} />
                <Pendencia para={rota("recebimentos")} texto="Pedidos parcialmente recebidos" n={d.pedidos_parcialmente_recebidos} />
              </ul>
            </Secao>

            <Secao titulo="Fornecedor com maior volume" semPadding>
              {d.fornecedor_maior_volume ? (
                <Link to={rota("fornecedores", d.fornecedor_maior_volume.fornecedor_id)} className="block px-5 pb-4 hover:bg-offwhite/60">
                  <p className="text-lg font-bold text-verde">{d.fornecedor_maior_volume.nome}</p>
                  <p className="text-sm text-texto-suave">
                    {moeda(d.fornecedor_maior_volume.total)} em {d.fornecedor_maior_volume.pedidos}{" "}
                    {d.fornecedor_maior_volume.pedidos === 1 ? "pedido" : "pedidos"} no período
                  </p>
                </Link>
              ) : (
                <p className="px-5 pb-4 text-sm text-texto-suave">Nenhuma compra no período.</p>
              )}
              <p className="border-t border-linha px-5 pt-3 text-sm font-semibold text-verde">Produtos mais comprados</p>
              {d.produtos_mais_comprados.length === 0 ? (
                <p className="px-5 py-3 text-sm text-texto-suave">—</p>
              ) : (
                <ol className="px-5 py-2">
                  {d.produtos_mais_comprados.map((p, i) => (
                    <li key={p.produto_id} className="flex justify-between gap-3 py-1 text-sm">
                      <Link to={rota("produtos", p.produto_id)} className="min-w-0 truncate text-verde hover:underline">
                        {i + 1}. {p.produto_nome}
                      </Link>
                      <span className="shrink-0 text-texto-suave tabular-nums">
                        {numero(p.unidades)} un · {moeda(p.total)}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Secao>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <ListaVariacoes titulo="Maiores aumentos de preço" icone={TrendingUp} itens={d.maiores_altas} />
            <ListaVariacoes titulo="Maiores reduções de preço" icone={TrendingDown} itens={d.maiores_quedas} />
          </div>

          <Comparativo mensal={d.mensal} />
        </div>
      )}
    </>
  );
}

function Numero({ rotulo, valor, destaque, detalhe, negativo }: { rotulo: string; valor: string; destaque?: boolean; detalhe?: string; negativo?: boolean }) {
  return (
    <div className={destaque ? "rounded-xl bg-verde px-4 py-3" : "rounded-xl border border-linha bg-superficie px-4 py-3"}>
      <p className={destaque ? "text-xs font-medium tracking-wide text-ouro uppercase" : "text-xs font-medium tracking-wide text-texto-suave uppercase"}>
        {rotulo}
      </p>
      <p
        className={
          destaque
            ? `mt-1 text-2xl font-bold tabular-nums ${negativo ? "text-red-300" : "text-creme"}`
            : `mt-1 text-xl font-bold tabular-nums ${negativo ? "text-perigo" : "text-verde"}`
        }
      >
        {valor}
      </p>
      {detalhe && <p className={destaque ? "text-xs text-creme/80" : "text-xs text-texto-suave"}>{detalhe}</p>}
    </div>
  );
}

function Atalho({ para, icone: Icone, texto }: { para: string; icone: typeof ClipboardList; texto: string }) {
  return (
    <Link to={para} className="flex min-h-14 items-center gap-2 rounded-xl border border-linha bg-superficie px-3 text-sm font-semibold text-verde hover:border-amarelo">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amarelo text-verde">
        <Icone className="size-5" />
      </span>
      {texto}
    </Link>
  );
}

function Pendencia({ para, texto, n }: { para: string; texto: string; n: number }) {
  return (
    <li>
      <Link to={para} className="flex min-h-12 items-center justify-between gap-3 px-5 py-2 hover:bg-offwhite/60">
        <span className="text-sm text-texto">{texto}</span>
        <span className="flex items-center gap-1">
          <span className={n > 0 ? "rounded-full bg-amarelo px-2.5 py-0.5 text-sm font-bold text-verde" : "text-sm text-texto-suave"}>{n}</span>
          <ChevronRight className="size-4 text-texto-suave" />
        </span>
      </Link>
    </li>
  );
}

function ListaVariacoes({ titulo, icone: Icone, itens }: { titulo: string; icone: typeof TrendingUp; itens: VariacaoPreco[] }) {
  return (
    <Secao titulo={titulo} descricao="Última mudança de preço por unidade no período, por fornecedor." semPadding>
      {itens.length === 0 ? (
        <p className="px-5 pb-4 text-sm text-texto-suave">Nenhuma variação registrada no período.</p>
      ) : (
        <ul className="divide-y divide-linha">
          {itens.map((v) => (
            <li key={v.produto_id + v.fornecedor_id}>
              <Link to={rota("produtos", v.produto_id)} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-offwhite/60">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-verde">{v.produto_nome}</span>
                  <span className="text-xs text-texto-suave">
                    {v.fornecedor_nome} · {moedaUnitaria(v.anterior)} → {moedaUnitaria(v.atual)} · {dataBR(v.data_referencia)}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-sm font-bold text-verde tabular-nums">
                  <Icone className="size-4" aria-hidden /> {percentual(v.variacao_pct)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}

// Comparativo de compras entre meses: uma série só (total comprado),
// barras finas com o canto arredondado só no topo, dica ao passar o mouse
// e a mesma informação em tabela.
function Comparativo({ mensal }: { mensal: Painel["mensal"] }) {
  const [tabela, setTabela] = useState(false);
  const dados = mensal.map((m) => ({ mes: mesCurto(m.mes), total: Number(m.total), pedidos: m.pedidos, recebido: Number(m.recebido) }));
  return (
    <Secao
      titulo="Compras por mês (últimos 12 meses)"
      acoes={
        <button type="button" className="h-9 text-sm font-medium text-marrom underline" onClick={() => setTabela((t) => !t)}>
          {tabela ? "Ver gráfico" : "Ver em tabela"}
        </button>
      }
    >
      {tabela ? (
        <Tabela>
          <thead>
            <tr>
              <th>Mês</th>
              <th className="num">Pedidos</th>
              <th className="num">Total comprado</th>
              <th className="num">Já recebido</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((m) => (
              <tr key={m.mes}>
                <td>{m.mes}</td>
                <td className="num">{m.pedidos}</td>
                <td className="num">{moeda(m.total)}</td>
                <td className="num">{moeda(m.recebido)}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      ) : (
        <div className="h-64 w-full" role="img" aria-label="Gráfico de barras do total comprado por mês">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
              <CartesianGrid stroke="var(--color-linha)" vertical={false} />
              <XAxis dataKey="mes" tick={{ fill: "var(--color-texto-suave)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--color-linha)" }} interval="preserveStartEnd" />
              <YAxis
                width={72}
                tick={{ fill: "var(--color-texto-suave)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => (v >= 1000 ? `R$ ${numero(v / 1000, 1)} mil` : moeda(v))}
              />
              <Tooltip
                cursor={{ fill: "var(--color-offwhite)", opacity: 0.6 }}
                formatter={(v) => [moeda(Number(v)), "Total comprado"]}
                contentStyle={{ borderRadius: 12, borderColor: "var(--color-linha)", fontSize: 13 }}
              />
              <Bar dataKey="total" fill={COR} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Secao>
  );
}
