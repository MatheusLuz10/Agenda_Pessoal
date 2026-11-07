import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Button, LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Aviso, Carregando } from "@/modules/deu-sede/components/ui/aviso";
import { Campo, Input, Select, Textarea } from "@/modules/deu-sede/components/ui/input";
import { Confirmar } from "@/modules/deu-sede/components/ui/dialogo";
import { Secao } from "@/modules/deu-sede/components/ui/secao";
import { BotaoColarLista, ColarListaDialog, type CandidatoLista } from "@/modules/deu-sede/components/ColarListaDialog";
import { rota } from "@/modules/deu-sede/config/modules";
import { executar, useConsulta } from "@/modules/deu-sede/data/cliente";
import { useCadastros, useEnvio } from "@/modules/deu-sede/data/hooks";
import type { CotacaoDetalhe, Embalagem, FornecedorProduto } from "@/modules/deu-sede/data/tipos";
import { cotacaoPermiteEditarItens, type CotacaoStatus } from "@/modules/deu-sede/domain/status";
import { precoMudou } from "@/modules/deu-sede/domain/colarLista";
import {
  arredondar,
  descreverEmbalagem,
  EMBALAGENS,
  hojeISO,
  lerDecimal,
  moeda,
  moedaUnitaria,
  paraCampo,
} from "@/modules/deu-sede/domain/formatos";

interface Linha {
  chave: string;
  produto_id: string;
  tipo_embalagem: Embalagem;
  unidades: string;
  quantidade: string;
  preco: string;
  desconto: string;
}

let contador = 0;
const novaChave = () => `l${++contador}`;
const linhaVazia = (): Linha => ({ chave: novaChave(), produto_id: "", tipo_embalagem: "caixa", unidades: "1", quantidade: "", preco: "", desconto: "" });

export function CotacaoFormPage() {
  const { id } = useParams();
  const cad = useCadastros();
  const cotacao = useConsulta<CotacaoDetalhe | null>("obter_cotacao", id ? { id } : null);
  if (cad.erro || cotacao.erro) return <Aviso tom="erro">{cad.erro ?? cotacao.erro}</Aviso>;
  if (!cad.dados || (id && cotacao.dados === undefined)) return <Carregando />;
  if (id && !cotacao.dados) return <Aviso tom="erro">Cotação não encontrada.</Aviso>;
  if (cotacao.dados && !cotacaoPermiteEditarItens(cotacao.dados.status)) {
    return (
      <Aviso tom="atencao">
        A cotação {cotacao.dados.numero_formatado} já foi recebida e não pode mais ser editada. Use "Duplicar" na tela da cotação
        para registrar uma nova proposta.
      </Aviso>
    );
  }
  return <Formulario key={id ?? "nova"} cotacao={cotacao.dados ?? null} />;
}

function Formulario({ cotacao }: { cotacao: CotacaoDetalhe | null }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { dados, produtos, vinculosPorFornecedor } = useCadastros();
  const [fornecedorId, setFornecedorId] = useState(cotacao?.fornecedor_id ?? params.get("fornecedor") ?? "");
  const [dataCotacao, setDataCotacao] = useState(cotacao?.data_cotacao ?? hojeISO());
  const [validade, setValidade] = useState(cotacao?.validade ?? "");
  const [frete, setFrete] = useState(paraCampo(cotacao?.frete || null, 2));
  const [descontoGeral, setDescontoGeral] = useState(paraCampo(cotacao?.desconto_geral || null, 2));
  const [condicao, setCondicao] = useState(cotacao?.condicao_pagamento ?? "");
  const [prazo, setPrazo] = useState(cotacao?.prazo_entrega ?? "");
  const [observacoes, setObservacoes] = useState(cotacao?.observacoes ?? "");
  const [linhas, setLinhas] = useState<Linha[]>(
    cotacao?.itens.length
      ? cotacao.itens.map((i) => ({
          chave: novaChave(),
          produto_id: i.produto_id,
          tipo_embalagem: i.tipo_embalagem,
          unidades: String(i.unidades_por_embalagem),
          quantidade: paraCampo(i.quantidade_embalagens),
          preco: paraCampo(i.preco_embalagem, 2),
          desconto: paraCampo(i.desconto_valor || null, 2),
        }))
      : [linhaVazia()],
  );
  const [colarAberto, setColarAberto] = useState(false);
  const [confirmarPrecos, setConfirmarPrecos] = useState<{ status: CotacaoStatus; mudancas: string[] } | null>(null);
  const { enviando, erro, setErro, enviar } = useEnvio();

  const vinculos = vinculosPorFornecedor.get(fornecedorId) ?? [];
  // Vínculo (preço atual) do fornecedor escolhido; sem embalagem = o primeiro ativo do produto.
  const vinculoDe = (produtoId: string, tipo?: Embalagem, unidades?: number): FornecedorProduto | undefined =>
    vinculos.find(
      (v) => v.produto_id === produtoId && v.ativo && (tipo === undefined || (v.tipo_embalagem === tipo && v.unidades_por_embalagem === unidades)),
    );

  const mudar = (chave: string, campo: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...campo } : l)));

  function escolherProduto(chave: string, produtoId: string) {
    const p = produtos.get(produtoId);
    const v = vinculoDe(produtoId);
    mudar(chave, {
      produto_id: produtoId,
      tipo_embalagem: v?.tipo_embalagem ?? p?.tipo_embalagem ?? "caixa",
      unidades: String(v?.unidades_por_embalagem ?? p?.unidades_por_embalagem ?? 1),
    });
  }

  const calc = linhas.map((l) => {
    const q = lerDecimal(l.quantidade) ?? 0;
    const pr = lerDecimal(l.preco) ?? 0;
    const d = lerDecimal(l.desconto) ?? 0;
    const u = Number(l.unidades) || 1;
    const bruto = arredondar(q * pr);
    const subtotal = arredondar(bruto - d);
    return { bruto, desconto: d, subtotal, unitario: q > 0 ? subtotal / (q * u) : null };
  });
  const somaBruto = arredondar(calc.reduce((s, c) => s + (Number.isNaN(c.bruto) ? 0 : c.bruto), 0));
  const somaDescontos = arredondar(calc.reduce((s, c) => s + (Number.isNaN(c.desconto) ? 0 : c.desconto), 0) + (lerDecimal(descontoGeral) || 0));
  const valorFrete = lerDecimal(frete) || 0;
  const total = arredondar(somaBruto - somaDescontos + valorFrete);

  function validar(): string | null {
    if (!fornecedorId) return "Escolha o fornecedor.";
    const usadas = linhas.filter((l) => l.produto_id);
    if (usadas.length === 0) return "Adicione ao menos um produto.";
    const chaves = new Set<string>();
    for (const l of usadas) {
      const nome = produtos.get(l.produto_id)?.nome;
      const q = lerDecimal(l.quantidade);
      const p = lerDecimal(l.preco);
      const d = lerDecimal(l.desconto);
      const u = Number(l.unidades);
      if (q === null || Number.isNaN(q) || q <= 0) return `Informe a quantidade de "${nome}".`;
      if (p === null || Number.isNaN(p) || p < 0) return `Informe o preço por embalagem de "${nome}".`;
      if (!Number.isInteger(u) || u <= 0) return `Unidades por embalagem inválidas em "${nome}".`;
      if (d !== null && (Number.isNaN(d) || d < 0 || d > q * p)) return `Desconto inválido em "${nome}".`;
      const k = `${l.produto_id}|${l.tipo_embalagem}|${u}`;
      if (chaves.has(k)) return `"${nome}" aparece duas vezes com a mesma embalagem.`;
      chaves.add(k);
    }
    for (const [rot, v] of [["Frete", frete], ["Desconto geral", descontoGeral]] as const) {
      const n = lerDecimal(v);
      if (n !== null && (Number.isNaN(n) || n < 0)) return `${rot} inválido.`;
    }
    if (validade && validade < dataCotacao) return "A validade não pode ser antes da data da cotação.";
    return null;
  }

  // Preços diferentes do preço atual deste fornecedor (pede confirmação).
  function mudancasDePreco(): string[] {
    return linhas
      .filter((l) => l.produto_id)
      .flatMap((l) => {
        const v = vinculoDe(l.produto_id, l.tipo_embalagem, Number(l.unidades));
        const novo = lerDecimal(l.preco);
        return v && precoMudou(novo, v.preco_atual)
          ? [`${produtos.get(l.produto_id)?.nome}: ${moeda(v.preco_atual)} → ${moeda(novo)}`]
          : [];
      });
  }

  async function salvar(status: CotacaoStatus, confirmado = false) {
    const problema = validar();
    if (problema) return setErro(problema);
    if (status === "recebida" && !confirmado) {
      const mudancas = mudancasDePreco();
      if (mudancas.length) return setConfirmarPrecos({ status, mudancas });
    }
    const salvo = await enviar(() =>
      executar<CotacaoDetalhe>("salvar_cotacao", {
        id: cotacao?.id,
        fornecedor_id: fornecedorId,
        data_cotacao: dataCotacao,
        validade: validade || null,
        frete: lerDecimal(frete) ?? 0,
        desconto_geral: lerDecimal(descontoGeral) ?? 0,
        condicao_pagamento: condicao,
        prazo_entrega: prazo,
        observacoes,
        status,
        itens: linhas
          .filter((l) => l.produto_id)
          .map((l) => ({
            produto_id: l.produto_id,
            tipo_embalagem: l.tipo_embalagem,
            unidades_por_embalagem: Number(l.unidades),
            quantidade_embalagens: lerDecimal(l.quantidade),
            preco_embalagem: lerDecimal(l.preco),
            desconto_valor: lerDecimal(l.desconto) ?? 0,
          })),
      }),
    );
    if (salvo) navigate(rota("cotacoes", salvo.id), { replace: true });
  }

  const candidatos: CandidatoLista[] = (dados?.produtos ?? [])
    .filter((p) => p.ativo)
    .map((p) => {
      const v = vinculoDe(p.id);
      return {
        id: p.id,
        nome: p.nome,
        rotulo: p.nome,
        codigos: [p.codigo, v?.codigo_no_fornecedor],
        unidadesPorEmbalagem: v?.unidades_por_embalagem ?? p.unidades_por_embalagem,
        precoReferencia: v?.preco_atual ?? null,
      };
    });

  function aplicarLista(itens: { candidatoId: string; quantidade: number | null; valorUnitario: number | null }[]) {
    setLinhas((atuais) => {
      const resultado = atuais.filter((l) => l.produto_id).map((l) => ({ ...l }));
      for (const it of itens) {
        const existente = resultado.find((l) => l.produto_id === it.candidatoId);
        const valores = { quantidade: paraCampo(it.quantidade), preco: paraCampo(it.valorUnitario, 2) };
        if (existente) Object.assign(existente, valores);
        else {
          const p = produtos.get(it.candidatoId);
          const v = vinculoDe(it.candidatoId);
          resultado.push({
            ...linhaVazia(),
            produto_id: it.candidatoId,
            tipo_embalagem: v?.tipo_embalagem ?? p?.tipo_embalagem ?? "caixa",
            unidades: String(v?.unidades_por_embalagem ?? p?.unidades_por_embalagem ?? 1),
            ...valores,
          });
        }
      }
      return resultado.length ? resultado : [linhaVazia()];
    });
  }

  const fornecedoresVisiveis = (dados?.fornecedores ?? []).filter((f) => f.ativo || f.id === fornecedorId);
  const produtosVisiveis = (dados?.produtos ?? []).filter((p) => p.ativo || linhas.some((l) => l.produto_id === p.id));

  return (
    <>
      <PageHeader
        title={cotacao ? `Editar ${cotacao.numero_formatado}` : "Nova cotação"}
        description="Registre os preços apresentados pelo fornecedor. Os totais são calculados automaticamente."
      />
      <div className="grid gap-5">
        <Secao titulo="Fornecedor e condições">
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Fornecedor" obrigatorio className="sm:col-span-3">
              {(id) => (
                <Select id={id} value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
                  <option value="">Escolha…</option>
                  {fornecedoresVisiveis.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome}
                    </option>
                  ))}
                </Select>
              )}
            </Campo>
            <Campo rotulo="Data da cotação" obrigatorio>
              {(id) => <Input id={id} type="date" value={dataCotacao} onChange={(e) => setDataCotacao(e.target.value)} />}
            </Campo>
            <Campo rotulo="Válida até" ajuda="Opcional.">
              {(id) => <Input id={id} type="date" value={validade} min={dataCotacao} onChange={(e) => setValidade(e.target.value)} />}
            </Campo>
            <Campo rotulo="Prazo de entrega">
              {(id) => <Input id={id} placeholder="Ex.: 2 dias úteis" value={prazo} onChange={(e) => setPrazo(e.target.value)} />}
            </Campo>
            <Campo rotulo="Condição de pagamento" className="sm:col-span-3">
              {(id) => <Input id={id} placeholder="Ex.: boleto 28 dias" value={condicao} onChange={(e) => setCondicao(e.target.value)} />}
            </Campo>
          </div>
        </Secao>

        <Secao
          titulo="Produtos"
          descricao="Preço por embalagem do fornecedor. O preço por unidade é calculado para comparar."
          acoes={<BotaoColarLista aoClicar={() => setColarAberto(true)} />}
        >
          <ul className="flex flex-col gap-3">
            {linhas.map((l, i) => {
              const c = calc[i];
              const v = l.produto_id ? vinculoDe(l.produto_id, l.tipo_embalagem, Number(l.unidades)) : undefined;
              const mudou = v && precoMudou(lerDecimal(l.preco), v.preco_atual);
              return (
                <li key={l.chave} className="rounded-xl border border-linha p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_9rem_6rem_auto]">
                    <Campo rotulo="Produto">
                      {(id) => (
                        <Select id={id} value={l.produto_id} onChange={(e) => escolherProduto(l.chave, e.target.value)}>
                          <option value="">Escolha…</option>
                          {produtosVisiveis.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nome}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Campo>
                    <Campo rotulo="Embalagem">
                      {(id) => (
                        <Select id={id} value={l.tipo_embalagem} onChange={(e) => mudar(l.chave, { tipo_embalagem: e.target.value as Embalagem })}>
                          {EMBALAGENS.map((e) => (
                            <option key={e.valor} value={e.valor}>
                              {e.rotulo}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Campo>
                    <Campo rotulo="Unid./emb.">
                      {(id) => <Input id={id} inputMode="numeric" value={l.unidades} onChange={(e) => mudar(l.chave, { unidades: e.target.value })} />}
                    </Campo>
                    <div className="flex items-end">
                      <Button
                        variant="fantasma"
                        size="icone"
                        aria-label="Remover produto"
                        onClick={() => setLinhas((ls) => (ls.length > 1 ? ls.filter((x) => x.chave !== l.chave) : [linhaVazia()]))}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <Campo rotulo="Quantidade">
                      {(id) => <Input id={id} inputMode="decimal" value={l.quantidade} onChange={(e) => mudar(l.chave, { quantidade: e.target.value })} />}
                    </Campo>
                    <Campo rotulo="Preço/emb. (R$)">
                      {(id) => <Input id={id} inputMode="decimal" placeholder="0,00" value={l.preco} onChange={(e) => mudar(l.chave, { preco: e.target.value })} />}
                    </Campo>
                    <Campo rotulo="Desconto (R$)">
                      {(id) => <Input id={id} inputMode="decimal" placeholder="0,00" value={l.desconto} onChange={(e) => mudar(l.chave, { desconto: e.target.value })} />}
                    </Campo>
                  </div>
                  <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-texto-suave">
                    <span>
                      Subtotal: <strong className="text-verde">{moeda(Number.isNaN(c.subtotal) ? null : c.subtotal)}</strong>
                    </span>
                    <span>Por unidade: {moedaUnitaria(c.unitario)}</span>
                    {l.produto_id && <span>{descreverEmbalagem(l.tipo_embalagem, Number(l.unidades) || 1)}</span>}
                    {v?.preco_atual != null && (
                      <span className={mudou ? "font-medium text-marrom" : undefined}>
                        Preço atual: {moeda(v.preco_atual)}
                        {mudou && " (mudou)"}
                      </span>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
          <Button variant="contorno" className="mt-3" onClick={() => setLinhas((ls) => [...ls, linhaVazia()])}>
            <Plus className="size-4" /> Adicionar produto
          </Button>
        </Secao>

        <Secao titulo="Frete, descontos e total">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Frete (R$)">
              {(id) => <Input id={id} inputMode="decimal" placeholder="0,00" value={frete} onChange={(e) => setFrete(e.target.value)} />}
            </Campo>
            <Campo rotulo="Desconto geral (R$)" ajuda="Desconto sobre a cotação inteira, se houver.">
              {(id) => <Input id={id} inputMode="decimal" placeholder="0,00" value={descontoGeral} onChange={(e) => setDescontoGeral(e.target.value)} />}
            </Campo>
            <Campo rotulo="Observações" className="sm:col-span-2">
              {(id) => <Textarea id={id} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />}
            </Campo>
          </div>
          <dl className="mt-4 grid gap-1 rounded-xl bg-offwhite/60 p-4 text-sm">
            <div className="flex justify-between"><dt>Soma dos produtos</dt><dd className="tabular-nums">{moeda(somaBruto)}</dd></div>
            <div className="flex justify-between"><dt>Descontos</dt><dd className="tabular-nums">− {moeda(somaDescontos)}</dd></div>
            <div className="flex justify-between"><dt>Frete</dt><dd className="tabular-nums">{moeda(valorFrete)}</dd></div>
            <div className="mt-1 flex justify-between border-t border-linha pt-2 text-base font-bold text-verde">
              <dt>Total da cotação</dt>
              <dd className="tabular-nums">{moeda(total)}</dd>
            </div>
          </dl>
        </Secao>

        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
          <LinkBotao to={cotacao ? rota("cotacoes", cotacao.id) : rota("cotacoes")} variant="contorno">
            Cancelar
          </LinkBotao>
          <Button variant="contorno" onClick={() => salvar("em_elaboracao")} disabled={enviando}>
            Salvar rascunho
          </Button>
          <Button variant="secundario" onClick={() => salvar("aguardando_fornecedor")} disabled={enviando}>
            Aguardando fornecedor
          </Button>
          <Button onClick={() => salvar("recebida")} disabled={enviando}>
            {enviando ? "Salvando…" : "Salvar como recebida"}
          </Button>
        </div>
      </div>

      <ColarListaDialog
        aberto={colarAberto}
        titulo="Colar lista da cotação"
        explicacao="Cole a lista de produtos com quantidades e preços enviada pelo fornecedor (ou gerada por IA a partir da proposta)."
        candidatos={candidatos}
        rotuloReferencia="Preço atual"
        exigirPreco
        aoFechar={() => setColarAberto(false)}
        aoAplicar={aplicarLista}
      />
      <Confirmar
        aberto={confirmarPrecos !== null}
        titulo="Preços diferentes do preço atual"
        mensagem={
          <>
            <p className="mb-2">Estes preços mudaram em relação ao último preço deste fornecedor:</p>
            <ul className="mb-2 list-disc pl-5">
              {confirmarPrecos?.mudancas.map((m) => <li key={m}>{m}</li>)}
            </ul>
            <p>Ao confirmar, a cotação é registrada e os novos preços entram no histórico. Cotações e pedidos anteriores não mudam.</p>
          </>
        }
        textoConfirmar="Confirmar preços"
        aoFechar={() => setConfirmarPrecos(null)}
        aoConfirmar={async () => {
          const s = confirmarPrecos!.status;
          setConfirmarPrecos(null);
          await salvar(s, true);
        }}
      />
    </>
  );
}
