import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeftRight, CircleCheck, Plus, Receipt, Undo2, X } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Button } from "@/modules/deu-sede/components/ui/button";
import { Badge } from "@/modules/deu-sede/components/ui/badge";
import { Aviso, Carregando, Vazio } from "@/modules/deu-sede/components/ui/aviso";
import { Campo, Input, Select, Textarea } from "@/modules/deu-sede/components/ui/input";
import { Confirmar, Dialogo } from "@/modules/deu-sede/components/ui/dialogo";
import { CampoBusca, Segmentado } from "@/modules/deu-sede/components/ui/filtros";
import { Secao } from "@/modules/deu-sede/components/ui/secao";
import { FiltroPeriodo } from "@/modules/deu-sede/components/FiltroPeriodo";
import { EscolhaPagamentoCampos } from "@/modules/deu-sede/components/EscolhaPagamento";
import { rota } from "@/modules/deu-sede/config/modules";
import { executar, useConsulta } from "@/modules/deu-sede/data/cliente";
import { useCadastros, useEnvio } from "@/modules/deu-sede/data/hooks";
import type { ContaPagar, ContasPagarResumo, ExtratoCaixa, ParcelaConta } from "@/modules/deu-sede/data/tipos";
import { erroEscolha, escolhaInicial, payloadEscolha, situacaoVencimento } from "@/modules/deu-sede/domain/financeiro";
import { periodoDoAtalho, type Periodo } from "@/modules/deu-sede/domain/periodo";
import { arredondar, dataBR, hojeISO, lerDecimal, moeda } from "@/modules/deu-sede/domain/formatos";
import { cn } from "@/lib/utils";

type Aba = "pagar" | "pagas" | "todas" | "caixa";

// Contas a pagar e caixa (migração 0016). À vista sai do caixa na hora;
// parcelado sai a cada parcela paga. Vendas do PDV entram no caixa.
export function ContasPagarPage() {
  const [aba, setAba] = useState<Aba>("pagar");
  const [buscaContas, setBuscaContas] = useState("");
  const status = aba === "pagar" ? "abertas" : aba === "pagas" ? "pagas" : "todas";
  const { dados, erro } = useConsulta<ContasPagarResumo>("contas_pagar", { status });
  const [nova, setNova] = useState(false);
  const [movCaixa, setMovCaixa] = useState(false);
  const [pagando, setPagando] = useState<{ conta: ContaPagar; parcela: ParcelaConta } | null>(null);
  const [desfazendo, setDesfazendo] = useState<{ conta: ContaPagar; parcela: ParcelaConta } | null>(null);
  const [cancelando, setCancelando] = useState<ContaPagar | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const saldo = dados?.saldo_caixa ?? null;
  const contasFiltradas = (dados?.contas ?? []).filter((c) => [c.descricao, c.fornecedor_nome, c.pedido_numero, c.observacoes, c.motivo_cancelamento].some((v) => String(v ?? "").toLocaleLowerCase("pt-BR").includes(buscaContas.trim().toLocaleLowerCase("pt-BR"))));

  return (
    <>
      <PageHeader
        title="Contas a pagar"
        description="Compras e despesas. À vista sai do caixa na hora; parcelado sai a cada parcela paga. As vendas do PDV entram no caixa."
        actions={
          <>
            <Button variant="contorno" onClick={() => setMovCaixa(true)}>
              <ArrowLeftRight className="size-4" /> Movimentar caixa
            </Button>
            <Button onClick={() => setNova(true)}>
              <Plus className="size-4" /> Nova conta
            </Button>
          </>
        }
      />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!dados && !erro && <Carregando />}
      {dados && (
        <div className="grid gap-5">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Numero rotulo="Saldo do caixa" valor={moeda(dados.saldo_caixa)} destaque negativo={dados.saldo_caixa < 0} />
            <Numero rotulo="Em aberto" valor={moeda(dados.em_aberto)} detalhe={`${dados.qtd_em_aberto} ${dados.qtd_em_aberto === 1 ? "parcela" : "parcelas"}`} />
            <Numero
              rotulo="Vencidas"
              valor={moeda(dados.vencidas)}
              detalhe={`${dados.qtd_vencidas} ${dados.qtd_vencidas === 1 ? "parcela" : "parcelas"}`}
              perigo={dados.qtd_vencidas > 0}
            />
            <Numero rotulo="Vence em 7 dias" valor={moeda(dados.vence_7_dias)} />
            <Numero rotulo="Pago neste mês" valor={moeda(dados.pagas_mes)} />
          </div>

          {aviso && <Aviso tom="sucesso">{aviso}</Aviso>}

          <Segmentado<Aba>
            rotulo="Mostrar"
            opcoes={[
              { valor: "pagar", rotulo: "A pagar" },
              { valor: "pagas", rotulo: "Pagas" },
              { valor: "todas", rotulo: "Todas" },
              { valor: "caixa", rotulo: "Extrato do caixa" },
            ]}
            valor={aba}
            aoMudar={setAba}
          />

          {aba === "caixa" ? (
            <ExtratoCaixaSecao />
          ) : dados.contas.length === 0 ? (
            <Vazio icone={Receipt} titulo={aba === "pagar" ? "Nenhuma conta em aberto" : "Nenhuma conta"}>
              Toque em “Nova conta” para lançar uma despesa. Os pedidos de compra entram aqui ao serem realizados.
            </Vazio>
          ) : (
            <>
            <CampoBusca valor={buscaContas} aoMudar={setBuscaContas} placeholder="Pesquisar descrição, fornecedor ou pedido" />
            {contasFiltradas.length === 0 ? <p className="py-3 text-sm text-texto-suave">Nenhuma conta corresponde à busca.</p> : <ul className="grid gap-3" aria-label="Contas">
              {contasFiltradas.map((c) => (
                <CartaoConta
                  key={c.id}
                  conta={c}
                  aoPagar={(parcela) => setPagando({ conta: c, parcela })}
                  aoDesfazer={(parcela) => setDesfazendo({ conta: c, parcela })}
                  aoCancelar={() => setCancelando(c)}
                />
              ))}
            </ul>}
            </>
          )}
        </div>
      )}

      {nova && (
        <NovaContaDialogo
          saldoCaixa={saldo}
          aoFechar={() => setNova(false)}
          aoLancar={(c) => {
            setNova(false);
            setAviso(
              c.forma === "a_vista"
                ? `Conta “${c.descricao}” paga à vista: ${moeda(c.valor_total)} saiu do caixa (saldo ${moeda(c.saldo_caixa ?? 0)}).`
                : `Conta “${c.descricao}” lançada em ${c.parcelas.length} ${c.parcelas.length === 1 ? "parcela" : "parcelas"}.`,
            );
          }}
        />
      )}
      {movCaixa && (
        <MovimentarCaixaDialogo
          aoFechar={() => setMovCaixa(false)}
          aoSalvar={(novoSaldo) => {
            setMovCaixa(false);
            setAviso(`Caixa atualizado: saldo ${moeda(novoSaldo)}.`);
          }}
        />
      )}
      <Confirmar
        aberto={!!pagando}
        titulo="Pagar parcela?"
        mensagem={
          pagando && (
            <p>
              <strong>{pagando.conta.descricao}</strong>
              {pagando.conta.parcelas.length > 1 && ` — parcela ${pagando.parcela.numero}/${pagando.conta.parcelas.length}`}:{" "}
              <strong className="tabular-nums">{moeda(pagando.parcela.valor)}</strong> sai do caixa hoje
              {saldo !== null && (
                <>
                  {" "}
                  (saldo fica <span className={cn("font-semibold", saldo - pagando.parcela.valor < 0 && "text-perigo")}>{moeda(arredondar(saldo - pagando.parcela.valor))}</span>)
                </>
              )}
              .
            </p>
          )
        }
        textoConfirmar="Pagar"
        aoFechar={() => setPagando(null)}
        aoConfirmar={async () => {
          if (!pagando) return;
          const r = await executar<ContaPagar>("pagar_parcela", { parcela_id: pagando.parcela.id });
          setAviso(`Parcela paga: ${moeda(pagando.parcela.valor)} saiu do caixa (saldo ${moeda(r.saldo_caixa ?? 0)}).`);
        }}
      />
      <Confirmar
        aberto={!!desfazendo}
        titulo="Desfazer pagamento?"
        mensagem={
          desfazendo && (
            <p>
              A parcela de <strong>{desfazendo.conta.descricao}</strong> volta a ficar em aberto e {moeda(desfazendo.parcela.valor)} volta para o caixa.
            </p>
          )
        }
        textoConfirmar="Desfazer"
        aoFechar={() => setDesfazendo(null)}
        aoConfirmar={async () => {
          if (!desfazendo) return;
          await executar("estornar_parcela", { parcela_id: desfazendo.parcela.id });
          setAviso("Pagamento desfeito: a parcela voltou a ficar em aberto.");
        }}
      />
      <Confirmar
        aberto={!!cancelando}
        perigo
        pedirMotivo
        rotuloMotivo="Motivo do cancelamento"
        titulo="Cancelar conta?"
        mensagem={
          cancelando && (
            <p>
              <strong>{cancelando.descricao}</strong> sai das contas a pagar.
              {cancelando.valor_pago > 0 && ` O que já foi pago (${moeda(cancelando.valor_pago)}) volta para o caixa.`}
            </p>
          )
        }
        textoConfirmar="Cancelar conta"
        aoFechar={() => setCancelando(null)}
        aoConfirmar={async (motivo) => {
          if (!cancelando) return;
          await executar("cancelar_conta_pagar", { id: cancelando.id, motivo });
          setAviso(`Conta “${cancelando.descricao}” cancelada.`);
        }}
      />
    </>
  );
}

function Numero({ rotulo, valor, detalhe, destaque, perigo, negativo }: { rotulo: string; valor: string; detalhe?: string; destaque?: boolean; perigo?: boolean; negativo?: boolean }) {
  return (
    <div className={cn("rounded-xl px-4 py-3", destaque ? "bg-verde" : "border bg-superficie", perigo ? "border-perigo/50" : "border-linha")}>
      <p className={cn("text-xs font-medium tracking-wide uppercase", destaque ? "text-ouro" : perigo ? "text-perigo" : "text-texto-suave")}>{rotulo}</p>
      <p
        className={cn(
          "mt-1 font-bold tabular-nums",
          destaque ? "text-2xl" : "text-xl",
          destaque ? (negativo ? "text-red-300" : "text-creme") : perigo ? "text-perigo" : "text-verde",
        )}
      >
        {valor}
      </p>
      {detalhe && <p className={cn("text-xs", destaque ? "text-creme/80" : "text-texto-suave")}>{detalhe}</p>}
    </div>
  );
}

function CartaoConta({
  conta: c,
  aoPagar,
  aoDesfazer,
  aoCancelar,
}: {
  conta: ContaPagar;
  aoPagar: (p: ParcelaConta) => void;
  aoDesfazer: (p: ParcelaConta) => void;
  aoCancelar: () => void;
}) {
  const pagas = c.parcelas.filter((p) => p.status === "paga").length;
  return (
    <li className="rounded-xl border border-linha bg-superficie">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 pt-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold break-words text-verde">{c.descricao}</p>
          <p className="text-xs text-texto-suave">
            {[
              c.numero_formatado,
              c.fornecedor_nome,
              c.forma === "a_vista" ? "À vista" : `Parcelado em ${c.parcelas.length}x`,
              c.status !== "cancelada" && c.parcelas.length > 1 ? `${pagas} de ${c.parcelas.length} pagas` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            {c.pedido_id && (
              <>
                {" · "}
                <Link to={rota("pedidos", c.pedido_id)} className="font-medium text-verde underline">
                  {c.pedido_numero ?? "pedido"}
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-verde tabular-nums">{moeda(c.valor_total)}</span>
          <Badge tone={c.status === "paga" ? "verde" : c.status === "cancelada" ? "neutro" : "amarelo"}>
            {c.status === "paga" ? "Paga" : c.status === "cancelada" ? "Cancelada" : "Em aberto"}
          </Badge>
        </div>
      </div>
      {c.status === "cancelada" && c.motivo_cancelamento && <p className="px-4 pt-1 text-xs text-texto-suave">Motivo: {c.motivo_cancelamento}</p>}
      <ul className="mt-2 divide-y divide-linha border-t border-linha">
        {c.parcelas.map((p) => {
          const sit = situacaoVencimento(p.vencimento, hojeISO());
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
              <span className="w-10 shrink-0 text-texto-suave tabular-nums">{c.parcelas.length > 1 ? `${p.numero}/${c.parcelas.length}` : "—"}</span>
              <span className="min-w-0 flex-1">
                {p.status === "paga" ? (
                  <span className="text-sucesso">Paga em {dataBR(p.paga_em)}</span>
                ) : p.status === "cancelada" ? (
                  <span className="text-texto-suave">Cancelada (venc. {dataBR(p.vencimento)})</span>
                ) : (
                  <span className={cn(sit.tom === "perigo" && "font-semibold text-perigo", sit.tom === "atencao" && "font-semibold text-marrom")}>{sit.texto}</span>
                )}
              </span>
              <span className="font-semibold text-verde tabular-nums">{moeda(p.valor)}</span>
              {p.status === "aberta" && (
                <Button size="sm" onClick={() => aoPagar(p)}>
                  <CircleCheck className="size-4" /> Pagar
                </Button>
              )}
              {p.status === "paga" && c.status !== "cancelada" && (
                <Button size="sm" variant="fantasma" onClick={() => aoDesfazer(p)} title="Desfazer o pagamento (o valor volta para o caixa)">
                  <Undo2 className="size-4" /> Desfazer
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {c.status !== "cancelada" && (
        <div className="flex justify-end border-t border-linha px-2 py-1">
          <Button size="sm" variant="fantasma" className="text-perigo" onClick={aoCancelar}>
            <X className="size-4" /> Cancelar conta
          </Button>
        </div>
      )}
    </li>
  );
}

function NovaContaDialogo({ saldoCaixa, aoFechar, aoLancar }: { saldoCaixa: number | null; aoFechar: () => void; aoLancar: (c: ContaPagar) => void }) {
  const { dados: cad } = useCadastros();
  const [descricao, setDescricao] = useState("");
  const [fornecedorId, setFornecedorId] = useState("");
  const [valor, setValor] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [pagamento, setPagamento] = useState(escolhaInicial);
  const { enviando, erro, setErro, enviar } = useEnvio();
  const total = lerDecimal(valor);
  const totalValido = total !== null && !Number.isNaN(total) && total > 0 ? arredondar(total) : 0;

  async function lancar() {
    if (descricao.trim().length < 2) return setErro("Informe a descrição (ex.: aluguel, energia, compra no atacarejo).");
    if (!totalValido) return setErro("Informe o valor da conta.");
    const e = erroEscolha(pagamento, totalValido);
    if (e) return setErro(e);
    const c = await enviar(() =>
      executar<ContaPagar>("lancar_conta_pagar", {
        descricao: descricao.trim(),
        fornecedor_id: fornecedorId || undefined,
        valor_total: totalValido,
        observacoes: observacoes.trim() || undefined,
        ...payloadEscolha(pagamento),
      }),
    );
    if (c) aoLancar(c);
  }

  return (
    <Dialogo
      aberto
      titulo="Nova conta a pagar"
      aoFechar={aoFechar}
      rodape={
        <>
          <Button variant="contorno" onClick={aoFechar} disabled={enviando}>
            Voltar
          </Button>
          <Button data-principal onClick={lancar} disabled={enviando}>
            {enviando ? "Lançando…" : "Lançar conta"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Campo rotulo="Descrição" obrigatorio>
          {(id) => <Input id={id} value={descricao} placeholder="Ex.: Aluguel, energia, compra no atacarejo" onChange={(e) => setDescricao(e.target.value)} autoFocus />}
        </Campo>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Valor total (R$)" obrigatorio>
            {(id) => <Input id={id} inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />}
          </Campo>
          <Campo rotulo="Fornecedor (opcional)">
            {(id) => (
              <Select id={id} value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
                <option value="">Nenhum</option>
                {(cad?.fornecedores ?? [])
                  .filter((f) => f.ativo)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
              </Select>
            )}
          </Campo>
        </div>
        <EscolhaPagamentoCampos valor={pagamento} aoMudar={setPagamento} total={totalValido} saldoCaixa={saldoCaixa} />
        <Campo rotulo="Observações">{(id) => <Textarea id={id} rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />}</Campo>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Dialogo>
  );
}

function MovimentarCaixaDialogo({ aoFechar, aoSalvar }: { aoFechar: () => void; aoSalvar: (saldo: number) => void }) {
  const [tipo, setTipo] = useState<"entrada" | "saida">("entrada");
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState(hojeISO());
  const { enviando, erro, setErro, enviar } = useEnvio();

  async function salvar() {
    const v = lerDecimal(valor);
    if (v === null || Number.isNaN(v) || v <= 0) return setErro("Informe o valor.");
    if (descricao.trim().length < 3) return setErro("Informe a descrição (ex.: saldo inicial, retirada).");
    const r = await enviar(() => executar<{ saldo_caixa: number }>("movimentar_caixa", { tipo, valor: v, descricao: descricao.trim(), data }));
    if (r) aoSalvar(r.saldo_caixa);
  }

  return (
    <Dialogo
      aberto
      titulo="Movimentar caixa"
      aoFechar={aoFechar}
      rodape={
        <>
          <Button variant="contorno" onClick={aoFechar} disabled={enviando}>
            Voltar
          </Button>
          <Button data-principal onClick={salvar} disabled={enviando}>
            {enviando ? "Salvando…" : tipo === "entrada" ? "Lançar entrada" : "Lançar saída"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-texto-suave">Para dinheiro que entra ou sai fora das vendas e das contas: saldo inicial, retirada, aporte, troco…</p>
        <Segmentado<"entrada" | "saida">
          rotulo="Tipo"
          opcoes={[
            { valor: "entrada", rotulo: "Entrada" },
            { valor: "saida", rotulo: "Saída" },
          ]}
          valor={tipo}
          aoMudar={setTipo}
        />
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Valor (R$)" obrigatorio>
            {(id) => <Input id={id} inputMode="decimal" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />}
          </Campo>
          <Campo rotulo="Data">{(id) => <Input id={id} type="date" value={data} onChange={(e) => setData(e.target.value)} />}</Campo>
        </div>
        <Campo rotulo="Descrição" obrigatorio>
          {(id) => <Input id={id} value={descricao} placeholder={tipo === "entrada" ? "Ex.: saldo inicial" : "Ex.: retirada do dono"} onChange={(e) => setDescricao(e.target.value)} />}
        </Campo>
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Dialogo>
  );
}

const ROTULO_ORIGEM: Record<string, string> = {
  vendas: "Vendas",
  pagamento_conta: "Conta paga",
  estorno_pagamento: "Estorno",
  entrada_manual: "Entrada",
  saida_manual: "Saída",
};

function ExtratoCaixaSecao() {
  const [periodo, setPeriodo] = useState<Periodo>(() => periodoDoAtalho("mes"));
  const { dados: ext, erro } = useConsulta<ExtratoCaixa>("caixa", { de: periodo.de, ate: periodo.ate });
  return (
    <Secao titulo="Extrato do caixa" descricao="Vendas do PDV somadas por dia; contas pagas e lançamentos avulsos um a um." semPadding>
      <div className="px-4 pb-3 sm:px-5">
        <FiltroPeriodo valor={periodo} aoMudar={setPeriodo} comHoje />
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!ext && !erro && <Carregando />}
      {ext && (
        <>
          <dl className="grid grid-cols-2 gap-2 border-t border-linha px-4 py-3 text-sm sm:grid-cols-4 sm:px-5">
            <div>
              <dt className="text-xs text-texto-suave">Saldo antes do período</dt>
              <dd className="font-semibold tabular-nums">{moeda(ext.saldo_anterior)}</dd>
            </div>
            <div>
              <dt className="text-xs text-texto-suave">Entradas</dt>
              <dd className="font-semibold text-sucesso tabular-nums">{moeda(ext.entradas)}</dd>
            </div>
            <div>
              <dt className="text-xs text-texto-suave">Saídas</dt>
              <dd className="font-semibold text-perigo tabular-nums">{moeda(ext.saidas)}</dd>
            </div>
            <div>
              <dt className="text-xs text-texto-suave">Saldo atual</dt>
              <dd className={cn("font-bold tabular-nums", ext.saldo < 0 ? "text-perigo" : "text-verde")}>{moeda(ext.saldo)}</dd>
            </div>
          </dl>
          {ext.movimentos.length === 0 ? (
            <p className="border-t border-linha px-5 py-6 text-center text-sm text-texto-suave">Nenhum lançamento no período.</p>
          ) : (
            <ul className="divide-y divide-linha border-t border-linha" aria-label="Lançamentos do caixa">
              {ext.movimentos.map((m, i) => (
                <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2 text-sm sm:px-5">
                  <span className="w-20 shrink-0 text-texto-suave tabular-nums">{dataBR(m.data)}</span>
                  <span className="min-w-0 flex-1 break-words text-verde">
                    {m.descricao}
                    {m.origem === "vendas" && m.quantidade > 1 && <span className="text-texto-suave"> ({m.quantidade})</span>}{" "}
                    <span className="text-xs text-texto-suave">· {ROTULO_ORIGEM[m.origem] ?? m.origem}</span>
                  </span>
                  <span className={cn("w-28 text-right font-semibold tabular-nums", m.valor < 0 ? "text-perigo" : "text-sucesso")}>
                    {m.valor > 0 ? "+ " : "− "}
                    {moeda(Math.abs(m.valor))}
                  </span>
                  <span className={cn("w-28 text-right text-xs tabular-nums", m.saldo_apos < 0 ? "text-perigo" : "text-texto-suave")}>saldo {moeda(m.saldo_apos)}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Secao>
  );
}
