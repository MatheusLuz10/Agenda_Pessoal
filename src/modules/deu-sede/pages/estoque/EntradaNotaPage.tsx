import { useState } from "react";
import { Link } from "react-router-dom";
import { CircleAlert, CircleCheck, CloudCheck, CloudOff, FileText, LoaderCircle, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Button, LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Aviso, Carregando } from "@/modules/deu-sede/components/ui/aviso";
import { Campo, Input, Select } from "@/modules/deu-sede/components/ui/input";
import { Confirmar } from "@/modules/deu-sede/components/ui/dialogo";
import { Secao } from "@/modules/deu-sede/components/ui/secao";
import { BotaoColarLista, ColarListaDialog, type CandidatoLista, type LinhaAplicada } from "@/modules/deu-sede/components/ColarListaDialog";
import { NotaEntradaDialogo } from "@/modules/deu-sede/components/NotaEntradaDialogo";
import { rota } from "@/modules/deu-sede/config/modules";
import { chamar, executar, useConsulta } from "@/modules/deu-sede/data/cliente";
import { useCadastros } from "@/modules/deu-sede/data/hooks";
import { cadastrarProdutosNovos } from "@/modules/deu-sede/data/produtosNovos";
import { useRascunho, type EstadoRascunho } from "@/modules/deu-sede/data/rascunho";
import type { Cadastros, Embalagem, PedidoResumo } from "@/modules/deu-sede/data/tipos";
import { precoMudou } from "@/modules/deu-sede/domain/colarLista";
import { arredondar, dataHoraBR, descreverEmbalagem, EMBALAGENS, hojeISO, lerDecimal, moeda, paraCampo } from "@/modules/deu-sede/domain/formatos";
import { cn } from "@/lib/utils";

interface Linha {
  chave: string;
  produto_id: string;
  tipo_embalagem: Embalagem;
  unidades: string;
  quantidade: string;
  preco: string;
}

/** o que fica guardado na nuvem enquanto a nota é montada */
interface RascunhoNota {
  chave_idempotencia: string;
  fornecedor_id: string | null;
  numero_nota: string;
  data_entrada: string;
  linhas: Linha[];
  lista_colada: string;
  atualizar_precos: boolean;
}

const RASCUNHO = "entrada_nota";
const nova = (): Linha => ({ chave: crypto.randomUUID(), produto_id: "", tipo_embalagem: "caixa", unidades: "1", quantidade: "", preco: "" });
const faltaQuantidade = (l: Linha) => {
  const q = lerDecimal(l.quantidade);
  return q === null || Number.isNaN(q) || q <= 0;
};
const texto = (v: unknown) => (typeof v === "string" ? v : "");

// Linhas que vieram do rascunho guardado: só o que tem a forma certa.
function linhasDoRascunho(v: unknown): Linha[] {
  if (!Array.isArray(v)) return [nova()];
  const r = v
    .filter((l): l is Record<string, unknown> => !!l && typeof l === "object")
    .map((l) => ({
      chave: texto(l.chave) || crypto.randomUUID(),
      produto_id: texto(l.produto_id),
      tipo_embalagem: (EMBALAGENS.some((e) => e.valor === l.tipo_embalagem) ? l.tipo_embalagem : "caixa") as Embalagem,
      unidades: texto(l.unidades) || "1",
      quantidade: texto(l.quantidade),
      preco: texto(l.preco),
    }));
  return r.length ? r : [nova()];
}

// Entrada de mercadoria por nota fiscal SEM pedido (balcão, entrega
// avulsa). Notas de pedidos entram pelo recebimento do pedido.
// Enquanto é montada, a nota fica guardada na nuvem (rascunho do login).
export function EntradaNotaPage() {
  const { dados, produtos, vinculosPorFornecedor } = useCadastros();
  const [chave, setChave] = useState<string>(() => crypto.randomUUID());
  // null = ainda não escolheu: com um só fornecedor ativo, ele já vem marcado
  const [fornecedorEscolhido, setFornecedorId] = useState<string | null>(null);
  const [numeroNota, setNumeroNota] = useState("");
  const [data, setData] = useState(hojeISO());
  const [linhas, setLinhas] = useState<Linha[]>([nova()]);
  const [listaColada, setListaColada] = useState("");
  const [colar, setColar] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [atualizarPrecos, setAtualizarPrecos] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [recuperado, setRecuperado] = useState<string | null>(null);
  const [feita, setFeita] = useState<{ id: string; numero_formatado: string; total: number } | null>(null);
  const [verNota, setVerNota] = useState<string | null>(null);
  const fornecedoresAtivos = (dados?.fornecedores ?? []).filter((f) => f.ativo);
  const fornecedorId = fornecedorEscolhido ?? (fornecedoresAtivos.length === 1 ? fornecedoresAtivos[0].id : "");
  const pendentes = useConsulta<PedidoResumo[]>("listar_pedidos", fornecedorId ? { aguardando_recebimento: true, fornecedor_id: fornecedorId } : null);

  const usadas = linhas.filter((l) => l.produto_id);
  const rascunho = useRascunho<RascunhoNota>(
    RASCUNHO,
    {
      chave_idempotencia: chave,
      fornecedor_id: fornecedorEscolhido,
      numero_nota: numeroNota,
      data_entrada: data,
      linhas,
      lista_colada: listaColada,
      atualizar_precos: atualizarPrecos,
    },
    usadas.length === 0 && !numeroNota.trim() && !listaColada.trim(),
    (r, quando) => {
      setChave(texto(r.chave_idempotencia) || crypto.randomUUID());
      setFornecedorId(typeof r.fornecedor_id === "string" ? r.fornecedor_id : null);
      setNumeroNota(texto(r.numero_nota));
      setData(/^\d{4}-\d{2}-\d{2}$/.test(texto(r.data_entrada)) ? r.data_entrada : hojeISO());
      setLinhas(linhasDoRascunho(r.linhas));
      setListaColada(texto(r.lista_colada));
      setAtualizarPrecos(r.atualizar_precos !== false);
      setRecuperado(quando);
    },
  );

  if (!dados) return <Carregando />;

  const nomeDe = (id: string) => produtos.get(id)?.nome ?? "produto";
  const vinculo = (produtoId: string, tipo?: Embalagem, un?: number) =>
    (vinculosPorFornecedor.get(fornecedorId) ?? []).find(
      (v) => v.produto_id === produtoId && v.ativo && (tipo === undefined || (v.tipo_embalagem === tipo && v.unidades_por_embalagem === un)),
    );
  const padrao = (produtoId: string, cad: Cadastros | undefined = dados) => {
    const p = cad?.produtos.find((x) => x.id === produtoId) ?? produtos.get(produtoId);
    const v = vinculo(produtoId);
    return { tipo_embalagem: v?.tipo_embalagem ?? p?.tipo_embalagem ?? "caixa", unidades: String(v?.unidades_por_embalagem ?? p?.unidades_por_embalagem ?? 1) };
  };
  const mudar = (chaveLinha: string, c: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.chave === chaveLinha ? { ...l, ...c } : l)));
  const semQuantidade = usadas.filter(faltaQuantidade);
  const total = arredondar(usadas.reduce((s, l) => s + (lerDecimal(l.quantidade) ?? 0) * (lerDecimal(l.preco) ?? 0), 0));
  const mudancas = usadas.flatMap((l) => {
    const v = vinculo(l.produto_id, l.tipo_embalagem, Number(l.unidades));
    const p = lerDecimal(l.preco);
    return v && precoMudou(p, v.preco_atual) ? [`${produtos.get(l.produto_id)?.nome}: ${moeda(v.preco_atual)} → ${moeda(p)}`] : [];
  });

  const avisoFaltando = (faltando: Linha[], nomes: (id: string) => string) =>
    `Falta a quantidade de ${faltando.length} ${faltando.length === 1 ? "produto" : "produtos"} da nota: ${faltando
      .map((l) => nomes(l.produto_id))
      .join(", ")}. Preencha nos campos em vermelho. A nota fica guardada enquanto isso.`;

  async function aplicarLista(itens: LinhaAplicada[], textoColado: string) {
    const prontos = await cadastrarProdutosNovos(itens);
    const cad = await chamar<Cadastros>("cadastros");
    const r = linhas.filter((l) => l.produto_id).map((l) => ({ ...l }));
    for (const it of prontos) {
      const existente = r.find((l) => l.produto_id === it.candidatoId);
      const valores = { quantidade: paraCampo(it.quantidade), preco: paraCampo(it.valorUnitario, 2) };
      // a embalagem escrita na nota ("CX 12") vale para esta entrada
      const daNota = it.embalagem ? { tipo_embalagem: it.embalagem.tipo, unidades: String(it.embalagem.unidades) } : null;
      if (existente) Object.assign(existente, valores, daNota ?? {});
      else r.push({ ...nova(), produto_id: it.candidatoId, ...(daNota ?? padrao(it.candidatoId, cad)), ...valores });
    }
    setLinhas(r.length ? r : [nova()]);
    const colado = textoColado.trim();
    if (colado) setListaColada((atual) => (atual.trim() ? `${atual.trim()}\n\n${colado}` : colado));
    // a entrada (e o custo de cada produto) só fica gravada ao confirmar.
    // Faltando quantidade, não abre a confirmação: mostra o que falta.
    const faltando = r.filter(faltaQuantidade);
    const nomesCad = (id: string) => cad.produtos.find((p) => p.id === id)?.nome ?? nomeDe(id);
    if (faltando.length) return setErro(avisoFaltando(faltando, nomesCad));
    setErro(null);
    if (prontos.length) setConfirmar(true);
  }

  function revisar() {
    if (usadas.length === 0) return setErro("Adicione ao menos um produto.");
    if (semQuantidade.length) return setErro(avisoFaltando(semQuantidade, nomeDe));
    for (const l of usadas) {
      const nome = nomeDe(l.produto_id);
      const p = lerDecimal(l.preco);
      if (p !== null && (Number.isNaN(p) || p < 0)) return setErro(`Preço inválido em "${nome}".`);
      if (!Number.isInteger(Number(l.unidades)) || Number(l.unidades) <= 0) return setErro(`Unidades por embalagem inválidas em "${nome}".`);
    }
    setErro(null);
    setConfirmar(true);
  }

  function limpar() {
    setChave(crypto.randomUUID());
    setLinhas([nova()]);
    setNumeroNota("");
    setListaColada("");
    setRecuperado(null);
    setErro(null);
  }

  async function descartar() {
    if (!window.confirm("Descartar a nota que estava sendo montada? Os produtos cadastrados continuam no sistema; só as quantidades e preços desta nota são apagados.")) return;
    try {
      await rascunho.descartar();
      limpar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function registrar() {
    await rascunho.pausar();
    let r: { id: string; numero_formatado: string; total: number };
    try {
      r = await executar<{ id: string; numero_formatado: string; total: number }>("registrar_entrada_nota", {
        chave_idempotencia: chave,
        fornecedor_id: fornecedorId || null,
        numero_nota: numeroNota,
        data_entrada: data,
        atualizar_precos: !!fornecedorId && atualizarPrecos,
        lista_colada: listaColada || null,
        // o servidor apaga o rascunho junto com a gravação da nota
        rascunho: RASCUNHO,
        itens: usadas.map((l) => ({
          produto_id: l.produto_id,
          tipo_embalagem: l.tipo_embalagem,
          unidades_por_embalagem: Number(l.unidades),
          quantidade_embalagens: lerDecimal(l.quantidade),
          preco_embalagem: lerDecimal(l.preco),
        })),
      });
    } catch (e) {
      rascunho.retomar();
      throw e;
    }
    rascunho.concluir();
    setFeita(r);
    limpar();
  }

  if (feita) {
    return (
      <>
        <PageHeader title="Entrada registrada" />
        <Aviso tom="sucesso" className="mb-4">
          <span className="flex items-center gap-2">
            <CircleCheck className="size-4" /> {feita.numero_formatado} registrada ({moeda(feita.total)}). As quantidades já estão no estoque.
          </span>
        </Aviso>
        <div className="flex flex-wrap gap-2">
          <Button variant="contorno" onClick={() => setVerNota(feita.id)}>
            <FileText className="size-4" /> Ver a nota
          </Button>
          <Button variant="contorno" onClick={() => setFeita(null)}>
            Nova entrada
          </Button>
          <LinkBotao to={rota("estoque")} variant="secundario">
            Ver estoque
          </LinkBotao>
        </div>
        <NotaEntradaDialogo id={verNota} aoFechar={() => setVerNota(null)} />
      </>
    );
  }

  const candidatos: CandidatoLista[] = dados.produtos
    .filter((p) => p.ativo)
    .map((p) => {
      const v = vinculo(p.id);
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
        title="Entrada por nota"
        description="Cole a lista da nota fiscal: os produtos entram no estoque. Produto que ainda não existe pode ser cadastrado na hora. A nota fica guardada enquanto você monta."
        actions={<BotaoColarLista aoClicar={() => setColar(true)} />}
      />
      <div className="grid gap-5">
        {recuperado && (
          <Aviso tom="atencao">
            <span className="flex flex-wrap items-center justify-between gap-2">
              <span>A nota que você estava montando foi recuperada (guardada em {dataHoraBR(recuperado)}).</span>
              <Button variant="fantasma" className="h-9 px-3" onClick={descartar}>
                <Trash2 className="size-4" /> Descartar e começar outra
              </Button>
            </span>
          </Aviso>
        )}
        <Secao titulo="Nota">
          <div className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="Fornecedor" ajuda="Opcional. Com fornecedor, os preços podem atualizar o preço atual.">
              {(id) => (
                <Select id={id} value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
                  <option value="">Sem fornecedor</option>
                  {fornecedoresAtivos.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome}
                      </option>
                    ))}
                </Select>
              )}
            </Campo>
            <Campo rotulo="Nº da nota fiscal">{(id) => <Input id={id} value={numeroNota} onChange={(e) => setNumeroNota(e.target.value)} />}</Campo>
            <Campo rotulo="Data da entrada">{(id) => <Input id={id} type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value)} />}</Campo>
          </div>
          {(pendentes.dados ?? []).length > 0 && (
            <Aviso tom="atencao" className="mt-3">
              Este fornecedor tem pedido aguardando entrega. Se a nota é desse pedido, registre pelo recebimento:{" "}
              {pendentes.dados!.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  <Link to={rota("recebimentos", "novo", p.id)} className="font-semibold underline">
                    {p.numero_formatado}
                  </Link>
                </span>
              ))}
              .
            </Aviso>
          )}
        </Secao>

        <Secao titulo="Produtos da nota" descricao="Quantidade e preço por embalagem.">
          {semQuantidade.length > 0 && (
            <p className="mb-3 flex items-center gap-2 text-sm font-medium text-perigo">
              <CircleAlert className="size-4 shrink-0" /> {semQuantidade.length} {semQuantidade.length === 1 ? "produto está" : "produtos estão"} sem
              quantidade.
            </p>
          )}
          <ul className="flex flex-col gap-3">
            {linhas.map((l) => {
              const p = lerDecimal(l.preco);
              const v = l.produto_id ? vinculo(l.produto_id, l.tipo_embalagem, Number(l.unidades)) : undefined;
              const falta = !!l.produto_id && faltaQuantidade(l);
              return (
                <li key={l.chave} className={cn("rounded-xl border p-3", falta ? "border-2 border-perigo bg-perigo/5" : "border-linha")}>
                  <div className="grid gap-2 sm:grid-cols-[1fr_8rem_5rem_auto]">
                    <Campo rotulo="Produto">
                      {(id) => (
                        <Select id={id} value={l.produto_id} onChange={(e) => mudar(l.chave, { produto_id: e.target.value, ...padrao(e.target.value) })}>
                          <option value="">Escolha…</option>
                          {dados.produtos
                            .filter((x) => x.ativo || x.id === l.produto_id)
                            .map((x) => (
                              <option key={x.id} value={x.id}>
                                {x.nome}
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
                      <Button variant="fantasma" size="icone" aria-label="Remover" onClick={() => setLinhas((ls) => (ls.length > 1 ? ls.filter((x) => x.chave !== l.chave) : [nova()]))}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Campo rotulo="Quantidade (embalagens)" erro={falta ? "Falta a quantidade" : undefined}>
                      {(id) => (
                        <Input
                          id={id}
                          inputMode="decimal"
                          aria-invalid={falta || undefined}
                          className={falta ? "border-perigo" : undefined}
                          value={l.quantidade}
                          onChange={(e) => mudar(l.chave, { quantidade: e.target.value })}
                        />
                      )}
                    </Campo>
                    <Campo rotulo="Preço/emb. (R$)">
                      {(id) => <Input id={id} inputMode="decimal" placeholder="opcional" value={l.preco} onChange={(e) => mudar(l.chave, { preco: e.target.value })} />}
                    </Campo>
                  </div>
                  {l.produto_id && (
                    <p className="mt-2 text-sm text-texto-suave">
                      {descreverEmbalagem(l.tipo_embalagem, Number(l.unidades) || 1)} · entra{" "}
                      <strong className="text-verde">{(lerDecimal(l.quantidade) ?? 0) * (Number(l.unidades) || 1)} un</strong>
                      {v?.preco_atual != null && (
                        <span className={precoMudou(p, v.preco_atual) ? " font-medium text-marrom" : ""}>
                          {" "}
                          · preço atual {moeda(v.preco_atual)}
                          {precoMudou(p, v.preco_atual) && " (mudou)"}
                        </span>
                      )}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <Button variant="contorno" className="mt-3" onClick={() => setLinhas((ls) => [...ls, nova()])}>
            <Plus className="size-4" /> Adicionar produto
          </Button>
          <p className="mt-3 text-right font-semibold text-verde">Total da nota: {moeda(total)}</p>
          {listaColada && (
            <details className="mt-3 rounded-xl border border-linha">
              <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-verde">Lista colada (fica guardada com a nota)</summary>
              <pre className="max-h-64 overflow-y-auto border-t border-linha px-3 py-2 font-sans text-sm break-words whitespace-pre-wrap text-texto">{listaColada}</pre>
            </details>
          )}
        </Secao>

        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-linha bg-superficie p-3 shadow-lg lg:bottom-4">
          <div className="min-w-0">
            <p className="text-verde">
              {usadas.length} {usadas.length === 1 ? "produto" : "produtos"} · <strong className="text-lg tabular-nums">Total {moeda(total)}</strong>
            </p>
            <EstadoGuardado estado={rascunho.estado} vazio={usadas.length === 0 && !numeroNota.trim() && !listaColada.trim()} />
          </div>
          <Button size="lg" onClick={revisar}>
            Dar entrada no estoque
          </Button>
        </div>
      </div>

      <ColarListaDialog
        aberto={colar}
        titulo="Colar lista da nota"
        explicacao="Cole a lista de produtos da nota (por exemplo, gerada por IA a partir da foto). Produtos que não existirem podem ser cadastrados aqui mesmo."
        candidatos={candidatos}
        categoriasNovos={dados.categorias}
        rotuloReferencia="Preço atual"
        aoFechar={() => setColar(false)}
        aoAplicar={aplicarLista}
      />
      <Confirmar
        aberto={confirmar}
        titulo="Dar entrada no estoque?"
        mensagem={
          <div className="flex flex-col gap-2">
            <p>
              {usadas.length} {usadas.length === 1 ? "produto" : "produtos"} · total {moeda(total)}
            </p>
            <p className="text-sm">
              As quantidades entram no estoque e o valor de cada produto fica guardado como custo
              {fornecedorId ? ` e como preço de ${dados.fornecedores.find((f) => f.id === fornecedorId)?.nome ?? "fornecedor"} (usado no Montar pedido)` : ""}.
            </p>
            {mudancas.length > 0 && fornecedorId && (
              <div className="rounded-xl border border-amarelo/50 bg-amarelo/15 p-3 text-marrom">
                <p className="font-semibold">Preços diferentes do preço atual:</p>
                <ul className="mb-2 list-disc pl-5">
                  {mudancas.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                <label className="flex items-start gap-2 font-medium">
                  <input type="checkbox" className="mt-0.5 size-5 accent-verde" checked={atualizarPrecos} onChange={(e) => setAtualizarPrecos(e.target.checked)} />
                  Atualizar o preço atual do fornecedor com os valores da nota
                </label>
              </div>
            )}
          </div>
        }
        textoConfirmar="Confirmar entrada"
        aoFechar={() => setConfirmar(false)}
        aoConfirmar={registrar}
      />
    </>
  );
}

function EstadoGuardado({ estado, vazio }: { estado: EstadoRascunho; vazio: boolean }) {
  if (vazio || estado === "carregando" || estado === "vazio") return null;
  const [Icone, rotulo, classe] =
    estado === "salvando"
      ? [LoaderCircle, "Guardando a nota…", "text-texto-suave"]
      : estado === "erro"
        ? [CloudOff, "Não foi possível guardar a nota agora (sem internet?). Não feche a página.", "text-perigo"]
        : [CloudCheck, "Nota guardada na nuvem", "text-sucesso"];
  return (
    <p className={cn("mt-0.5 flex items-center gap-1.5 text-xs", classe)} role="status">
      <Icone className={cn("size-3.5 shrink-0", estado === "salvando" && "animate-spin")} /> {rotulo}
    </p>
  );
}
