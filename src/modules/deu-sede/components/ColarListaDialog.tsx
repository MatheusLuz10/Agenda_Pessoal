import { useState } from "react";
import { ClipboardCopy, ClipboardPaste, Pencil } from "lucide-react";
import { Button } from "@/modules/deu-sede/components/ui/button";
import { Badge } from "@/modules/deu-sede/components/ui/badge";
import { Dialogo } from "@/modules/deu-sede/components/ui/dialogo";
import { Aviso } from "@/modules/deu-sede/components/ui/aviso";
import { Input, Select, Textarea } from "@/modules/deu-sede/components/ui/input";
import {
  associar,
  converterParaEmbalagem,
  ehCodigoDeBarras,
  embalagemDaUnidade,
  INSTRUCAO_IA,
  interpretarLista,
  precoMudou,
  sugerirCategoria,
  type Candidato,
} from "@/modules/deu-sede/domain/colarLista";
import { descreverEmbalagem, EMBALAGENS, lerDecimal, moeda, normalizarBusca, paraCampo } from "@/modules/deu-sede/domain/formatos";
import type { Categoria, Embalagem } from "@/modules/deu-sede/data/tipos";

export interface CandidatoLista extends Candidato {
  /** texto do item no seletor (ex.: "Brahma 269 ml · Caixa c/ 12") */
  rotulo: string;
  /** preço de referência por embalagem (pedido ou preço atual) */
  precoReferencia?: number | null;
}

export interface ProdutoNovo {
  nome: string;
  /** código da nota (EAN ou do fornecedor): a próxima nota reconhece pelo código */
  codigo: string | null;
  categoria_id: string;
  tipo_embalagem: Embalagem;
  unidades_por_embalagem: number;
}

export interface LinhaAplicada {
  /** vazio quando a linha é um produto novo (ver "novo") */
  candidatoId: string;
  /** produto a cadastrar antes de aplicar */
  novo?: ProdutoNovo;
  quantidade: number | null;
  valorUnitario: number | null;
  /** embalagem escrita na lista ("CX 12"), para produto já cadastrado */
  embalagem?: { tipo: Embalagem; unidades: number };
  /** preço diferente da referência, confirmado pelo usuário */
  precoAlterado: boolean;
}

interface LinhaEditavel {
  linha: number;
  texto: string;
  descricao: string;
  candidatoId: string;
  confianca: "codigo" | "nome" | "nenhuma";
  quantidade: string;
  valor: string;
  convertido: boolean;
  /** embalagem que a lista informou (vale para produto já cadastrado) */
  embalagemLista: { tipo: Embalagem; unidades: number } | null;
  codigo: string | null;
  novoNome: string;
  novoCategoria: string;
  novoEmbalagem: Embalagem;
  novoUnidades: string;
}

const NOVO = "__novo__";

// "Colar lista": cola o texto (ex.: lista gerada por IA a partir da nota),
// confere o que foi reconhecido e aplica no formulário. Nada é gravado
// aqui — o formulário ainda precisa ser salvo.
export function ColarListaDialog({
  aberto,
  titulo,
  explicacao,
  candidatos,
  rotuloReferencia = "Preço anterior",
  exigirPreco,
  categoriasNovos,
  aoFechar,
  aoAplicar,
}: {
  aberto: boolean;
  titulo: string;
  explicacao: string;
  candidatos: CandidatoLista[];
  rotuloReferencia?: string;
  exigirPreco?: boolean;
  /** com as categorias, permite cadastrar produto novo a partir da linha */
  categoriasNovos?: Categoria[];
  aoFechar: () => void;
  aoAplicar: (linhas: LinhaAplicada[]) => void | Promise<void>;
}) {
  const [aplicando, setAplicando] = useState(false);
  const [texto, setTexto] = useState("");
  const [linhas, setLinhas] = useState<LinhaEditavel[] | null>(null);
  const [ignoradas, setIgnoradas] = useState<string[]>([]);
  const [confirmouPrecos, setConfirmouPrecos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  // linhas de produto novo que chegaram sem unidades por embalagem: ficam
  // no painel do topo até aplicar (não somem enquanto a pessoa digita)
  const [faltavam, setFaltavam] = useState<number[]>([]);
  // linhas mostradas com todos os campos; as demais aparecem resumidas
  // (nome, quantidade e preço) com o botão "Alterar"
  const [abertas, setAbertas] = useState<Set<number>>(new Set());
  const porId = new Map(candidatos.map((c) => [c.id, c]));
  const nomeCategoria = new Map((categoriasNovos ?? []).map((c) => [c.id, c.nome]));

  // Linha que precisa de alguém olhar: produto novo incompleto, linha não
  // reconhecida (onde não dá para cadastrar), quantidade ou preço faltando.
  function precisaAtencao(l: LinhaEditavel): boolean {
    if (!l.candidatoId) return !categoriasNovos;
    if (lerDecimal(l.quantidade) === null) return true;
    if (exigirPreco && lerDecimal(l.valor) === null) return true;
    if (l.candidatoId === NOVO) {
      const u = Number(l.novoUnidades);
      return !l.novoNome.trim() || !l.novoCategoria || !Number.isInteger(u) || u <= 0;
    }
    return false;
  }

  function fechar() {
    setTexto("");
    setLinhas(null);
    setFaltavam([]);
    setAbertas(new Set());
    setIgnoradas([]);
    setConfirmouPrecos(false);
    setErro(null);
    aoFechar();
  }

  async function copiarInstrucao() {
    try {
      await navigator.clipboard.writeText(INSTRUCAO_IA);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErro("Não foi possível copiar automaticamente. Selecione e copie o texto da instrução.");
    }
  }

  function analisar() {
    const r = interpretarLista(texto);
    if (r.linhas.length === 0) {
      setErro("Nenhum produto foi reconhecido no texto. Confira se há uma linha por produto, com quantidade e valor.");
      return;
    }
    setErro(null);
    setIgnoradas(r.ignoradas);
    const ativas = (categoriasNovos ?? []).filter((c) => c.ativo);
    const categoriaPadrao = ativas.find((c) => c.nome === "Outros")?.id ?? ativas[0]?.id ?? "";
    const analisadas: LinhaEditavel[] = r.linhas.map((l) => {
        const a = associar(l, candidatos);
        const c = a.candidatoId ? porId.get(a.candidatoId) : undefined;
        const conv = converterParaEmbalagem(l, c?.unidadesPorEmbalagem ?? 1);
        const embalagem = embalagemDaUnidade(l.unidade);
        const unidadesNovo = embalagem.tipo === "unidade" ? 1 : (l.unidadesPorEmbalagem ?? embalagem.unidades);
        return {
          linha: l.linha,
          texto: l.texto,
          descricao: l.descricao,
          // Onde dá para cadastrar (entrada por nota), o que não existe já
          // vem marcado como produto novo: com o banco vazio, toda a nota é
          // "não reconhecida" e escolher linha a linha travava a entrada.
          candidatoId: a.candidatoId ?? (categoriasNovos ? NOVO : ""),
          confianca: a.confianca,
          quantidade: paraCampo(conv.quantidade),
          valor: paraCampo(conv.valorUnitario, 2),
          convertido: conv.convertido,
          // "CX 12" na lista: a nota manda na embalagem desta entrada (o
          // padrão do produto pode ser outro). Linha em UN já convertida
          // para a embalagem do produto fica com a do produto.
          embalagemLista:
            !conv.convertido && unidadesNovo && (l.unidade || l.unidadesPorEmbalagem) ? { tipo: embalagem.tipo, unidades: unidadesNovo } : null,
          // só código de barras vai para o cadastro: código interno do
          // fornecedor ("924") pode ser outro produto em outro fornecedor
          codigo: ehCodigoDeBarras(l.codigo) ? l.codigo : null,
          novoNome: l.descricao,
          novoCategoria: sugerirCategoria(l.descricao, ativas) ?? categoriaPadrao,
          novoEmbalagem: embalagem.tipo,
          novoUnidades: unidadesNovo ? String(unidadesNovo) : "",
        };
    });
    setLinhas(analisadas);
    setFaltavam(analisadas.filter((l) => l.candidatoId === NOVO && !l.novoUnidades).map((l) => l.linha));
    // o que falta só a embalagem já está no painel do topo
    setAbertas(new Set(analisadas.filter((l) => precisaAtencao({ ...l, novoUnidades: l.novoUnidades || "1" })).map((l) => l.linha)));
  }

  const mudar = (i: number, campo: Partial<LinhaEditavel>) =>
    setLinhas((ls) => ls && ls.map((l, j) => (j === i ? { ...l, ...campo } : l)));

  const usadas = (linhas ?? []).filter((l) => l.candidatoId);
  const comPrecoNovo = usadas.filter((l) => l.candidatoId !== NOVO && precoMudou(lerDecimal(l.valor), porId.get(l.candidatoId)?.precoReferencia));
  const existentes = usadas.filter((l) => l.candidatoId !== NOVO);
  const repetidos = existentes.filter((l, i) => existentes.findIndex((x) => x.candidatoId === l.candidatoId) !== i);
  const novos = usadas.filter((l) => l.candidatoId === NOVO);
  const chaveNome = (l: LinhaEditavel) => normalizarBusca(l.novoNome).replace(/\s+/g, " ");
  const novoRepetido = novos.find((l, i) => novos.findIndex((x) => chaveNome(x) === chaveNome(l)) !== i);
  const codigoRepetido = novos.find((l, i) => l.codigo && novos.findIndex((x) => x.codigo?.trim().toLowerCase() === l.codigo!.trim().toLowerCase()) !== i);
  const semUnidades = novos.filter((l) => {
    const u = Number(l.novoUnidades);
    return !Number.isInteger(u) || u <= 0;
  });

  async function aplicar() {
    if (usadas.length === 0) return setErro("Escolha o produto de ao menos uma linha.");
    if (repetidos.length) return setErro("O mesmo produto foi escolhido em duas linhas. Ajuste ou ignore uma delas.");
    if (novoRepetido) return setErro(`O produto novo "${novoRepetido.novoNome}" aparece em duas linhas. Junte as quantidades em uma linha ou ignore uma delas.`);
    if (codigoRepetido) return setErro(`O código ${codigoRepetido.codigo} aparece em dois produtos novos. Ajuste ou ignore uma das linhas.`);
    if (semUnidades.length > 1)
      return setErro(
        `Informe quantas unidades vêm na embalagem de ${semUnidades.length} produtos novos (campos em vermelho): linhas ${semUnidades.map((l) => l.linha).join(", ")}.`,
      );
    for (const l of usadas) {
      const q = lerDecimal(l.quantidade);
      const v = lerDecimal(l.valor);
      if (q !== null && (Number.isNaN(q) || q < 0)) return setErro(`Quantidade inválida na linha ${l.linha}.`);
      if (v !== null && (Number.isNaN(v) || v < 0)) return setErro(`Valor inválido na linha ${l.linha}.`);
      if (exigirPreco && v === null) return setErro(`Informe o valor da linha ${l.linha}.`);
      if (l.candidatoId === NOVO) {
        const u = Number(l.novoUnidades);
        if (!l.novoNome.trim()) return setErro(`Informe o nome do produto novo da linha ${l.linha}.`);
        if (!l.novoCategoria) return setErro(`Escolha a categoria do produto novo da linha ${l.linha}.`);
        if (!Number.isInteger(u) || u <= 0) return setErro(`Informe quantas unidades vêm na embalagem (linha ${l.linha}).`);
      }
    }
    if (comPrecoNovo.length && !confirmouPrecos) return setErro("Confirme os preços alterados antes de aplicar.");
    setAplicando(true);
    try {
      await aoAplicar(
        usadas.map((l) => ({
          candidatoId: l.candidatoId === NOVO ? "" : l.candidatoId,
          novo:
            l.candidatoId === NOVO
              ? {
                  nome: l.novoNome.trim(),
                  codigo: l.codigo?.trim() || null,
                  categoria_id: l.novoCategoria,
                  tipo_embalagem: l.novoEmbalagem,
                  unidades_por_embalagem: Number(l.novoUnidades),
                }
              : undefined,
          embalagem: l.candidatoId !== NOVO && l.embalagemLista ? l.embalagemLista : undefined,
          quantidade: lerDecimal(l.quantidade),
          valorUnitario: lerDecimal(l.valor),
          precoAlterado: comPrecoNovo.includes(l),
        })),
      );
      fechar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setAplicando(false);
    }
  }

  return (
    <Dialogo
      aberto={aberto}
      titulo={titulo}
      aoFechar={fechar}
      rodape={
        linhas ? (
          <>
            <Button variant="contorno" onClick={() => setLinhas(null)}>
              Voltar ao texto
            </Button>
            <Button data-principal onClick={aplicar} disabled={aplicando}>
              {aplicando ? "Aplicando…" : `Aplicar ${usadas.length} ${usadas.length === 1 ? "produto" : "produtos"}`}
            </Button>
          </>
        ) : (
          <>
            <Button variant="contorno" onClick={fechar}>
              Cancelar
            </Button>
            <Button data-principal onClick={analisar} disabled={!texto.trim()}>
              Conferir lista
            </Button>
          </>
        )
      }
    >
      {!linhas ? (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-texto">{explicacao}</p>
<ol className="flex flex-col gap-2.5 rounded-xl border border-linha bg-offwhite/50 p-3">
            <li className="flex items-start gap-2.5">
              <Passo n={1} />
              <div className="flex flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="font-medium text-verde">Copie a instrução</span>
                <Button size="sm" variant="secundario" onClick={copiarInstrucao}>
                  <ClipboardCopy className="size-4" /> {copiado ? "Copiada!" : "Copiar instrução"}
                </Button>
              </div>
            </li>
            <li className="flex items-start gap-2.5">
              <Passo n={2} />
              <span className="text-texto">
                <span className="font-medium text-verde">Envie para a IA</span> (ChatGPT, Gemini, Claude…) junto com a foto ou o PDF da nota.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <Passo n={3} />
              <span className="text-texto">
                <span className="font-medium text-verde">Cole a resposta</span> no campo abaixo.
              </span>
            </li>
          </ol>
          <details className="text-xs text-texto-suave">
            <summary className="cursor-pointer">Ver a instrução</summary>
            <pre className="mt-2 overflow-auto rounded-lg border border-linha bg-white p-2 whitespace-pre-wrap text-verde">{INSTRUCAO_IA}</pre>
          </details>
          <label className="flex flex-col gap-1.5 font-medium text-verde">
            Lista de produtos
            <Textarea
              maxLength={20000}
              rows={8}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={"Cerveja Brahma Lata 269ml; 2; CX 12; 45,90\nRefrigerante Coca-Cola 2L; 3; FD 6; 54,00"}
              className="font-mono text-sm"
            />
          </label>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-texto-suave">
            {categoriasNovos
              ? "Confira a lista. Produto que ainda não existe será cadastrado. Para corrigir uma linha, toque em Alterar."
              : "Confira a lista. Linha não reconhecida fica de fora até você escolher o produto."}
          </p>
          <p className="font-medium text-verde">
            {existentes.length} {existentes.length === 1 ? "reconhecido" : "reconhecidos"}
            {categoriasNovos && ` · ${novos.length} ${novos.length === 1 ? "novo para cadastrar" : "novos para cadastrar"}`}
            {` · ${linhas.length - usadas.length} ${linhas.length - usadas.length === 1 ? "ignorado" : "ignorados"}`}
            {semUnidades.length > 0 && (
              <span className="text-perigo">
                {" "}
                · {semUnidades.length} sem unidades por embalagem (a nota não informa)
              </span>
            )}
          </p>
          {(() => {
            // Painel único para o que a nota não informa: preencher tudo
            // aqui, sem procurar campo vermelho entre dezenas de linhas.
            const pendentes = linhas
              .map((l, i) => ({ l, i }))
              .filter(({ l }) => faltavam.includes(l.linha) && l.candidatoId === NOVO);
            if (pendentes.length === 0) return null;
            return (
              <section aria-label="Unidades por embalagem dos produtos novos" className="rounded-xl border border-perigo/40 bg-perigo/5 p-3">
                <p className="font-semibold text-verde">
                  Quantas unidades vêm em cada embalagem?{" "}
                  <span className={semUnidades.length ? "text-perigo" : "text-sucesso"}>
                    {semUnidades.length ? `faltam ${semUnidades.length}` : "tudo preenchido ✓"}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-texto-suave">
                  A nota não informa. Toque no número ou digite outro. Só precisa uma vez: na próxima nota, o produto já vem certo.
                </p>
                <ul className="mt-2 flex flex-col divide-y divide-linha">
                  {pendentes.map(({ l, i }) => (
                    <li key={l.linha} className="flex flex-wrap items-center gap-1.5 py-2">
                      <span className="w-full text-sm font-medium break-words text-verde sm:w-auto sm:flex-1">
                        {l.novoNome}{" "}
                        <span className="font-normal text-texto-suave">
                          · {EMBALAGENS.find((e) => e.valor === l.novoEmbalagem)?.rotulo ?? l.novoEmbalagem}
                        </span>
                      </span>
                      {[6, 12, 15, 24].map((n) => (
                        <button
                          key={n}
                          type="button"
                          aria-pressed={l.novoUnidades === String(n)}
                          onClick={() => mudar(i, { novoUnidades: String(n) })}
                          className={
                            l.novoUnidades === String(n)
                              ? "h-9 min-w-10 rounded-lg border border-amarelo bg-amarelo px-2 text-sm font-semibold text-verde"
                              : "h-9 min-w-10 rounded-lg border border-linha bg-white px-2 text-sm font-semibold text-verde hover:border-amarelo"
                          }
                        >
                          {n}
                        </button>
                      ))}
                      <Input
                        aria-label={`Unidades por embalagem de ${l.novoNome}`}
                        inputMode="numeric"
                        placeholder="outro"
                        value={l.novoUnidades}
                        onChange={(e) => mudar(i, { novoUnidades: e.target.value.replace(/\D/g, "") })}
                        className="h-9 w-20"
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })()}
          <ul className="flex flex-col gap-2">
            {linhas.map((l, i) => {
              const c = porId.get(l.candidatoId);
              const valor = lerDecimal(l.valor);
              const mudou = !!c && precoMudou(valor, c.precoReferencia);
              const aberta = abertas.has(l.linha);
              return (
                <li key={l.linha} className="rounded-xl border border-linha p-3">
                  <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 font-medium break-words text-verde">
                    {l.descricao}{" "}
                    {l.confianca === "codigo" && <Badge tone="verde">pelo código</Badge>}
                    {l.confianca === "nome" && l.candidatoId && <Badge tone="amarelo">pelo nome — confira</Badge>}
                    {!l.candidatoId && <Badge tone="perigo">não reconhecido</Badge>}
                    {l.candidatoId === NOVO && <Badge tone="amarelo">novo — será cadastrado</Badge>}
                  </p>
                  {!aberta && (
                    <Button size="sm" variant="fantasma" className="-mt-1 shrink-0" aria-label={`Alterar a linha ${l.linha}`} onClick={() => setAbertas((a) => new Set(a).add(l.linha))}>
                      <Pencil className="size-4" /> Alterar
                    </Button>
                  )}
                  </div>
                  {!aberta && (
                    <p className="mt-1 text-texto-suave">
                      {!l.candidatoId ? (
                        "Esta linha será ignorada."
                      ) : (
                        <>
                          {l.candidatoId === NOVO ? (
                            <>
                              Produto novo · {nomeCategoria.get(l.novoCategoria) ?? "sem categoria"} ·{" "}
                              {descreverEmbalagem(l.novoEmbalagem, Number(l.novoUnidades) || 1)}
                            </>
                          ) : (
                            <>
                              → {c?.rotulo}
                              {l.embalagemLista && ` · ${descreverEmbalagem(l.embalagemLista.tipo, l.embalagemLista.unidades)}`}
                            </>
                          )}
                          <br />
                          <strong className="text-verde">{l.quantidade || "?"}</strong> {lerDecimal(l.quantidade) === 1 ? "embalagem" : "embalagens"} ×{" "}
                          <strong className="text-verde">{valor === null ? "sem preço" : moeda(valor)}</strong>
                        </>
                      )}
                    </p>
                  )}
                  {aberta && (
                    <div className="mt-2">
                  <Select
                    aria-label={`Produto da linha ${l.linha}`}
                    value={l.candidatoId}
                    onChange={(e) => mudar(i, { candidatoId: e.target.value, confianca: e.target.value ? "nome" : "nenhuma" })}
                  >
                    <option value="">— ignorar esta linha —</option>
                    {categoriasNovos && <option value={NOVO}>＋ Cadastrar como produto novo</option>}
                    {candidatos.map((cand) => (
                      <option key={cand.id} value={cand.id}>
                        {cand.rotulo}
                      </option>
                    ))}
                  </Select>
                  {l.candidatoId === NOVO && categoriasNovos && (
                    <div className="mt-2 grid gap-2 rounded-xl bg-offwhite/60 p-2 sm:grid-cols-2">
                      <label className="flex flex-col gap-1 text-xs font-medium text-texto-suave sm:col-span-2">
                        Nome do produto novo
                        <Input value={l.novoNome} onChange={(e) => mudar(i, { novoNome: e.target.value })} />
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-medium text-texto-suave">
                        Categoria
                        <Select value={l.novoCategoria} onChange={(e) => mudar(i, { novoCategoria: e.target.value })}>
                          <option value="">Escolha…</option>
                          {categoriasNovos
                            .filter((c) => c.ativo)
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.nome}
                              </option>
                            ))}
                        </Select>
                      </label>
                      <div className="grid grid-cols-[1fr_5rem] gap-2">
                        <label className="flex flex-col gap-1 text-xs font-medium text-texto-suave">
                          Embalagem
                          <Select value={l.novoEmbalagem} onChange={(e) => mudar(i, { novoEmbalagem: e.target.value as Embalagem })}>
                            {EMBALAGENS.map((e) => (
                              <option key={e.valor} value={e.valor}>
                                {e.rotulo}
                              </option>
                            ))}
                          </Select>
                        </label>
                        <label className="flex flex-col gap-1 text-xs font-medium text-texto-suave">
                          Unid./emb.
                          <Input
                            inputMode="numeric"
                            value={l.novoUnidades}
                            aria-invalid={!l.novoUnidades.trim()}
                            className={!l.novoUnidades.trim() ? "border-perigo" : undefined}
                            onChange={(e) => mudar(i, { novoUnidades: e.target.value })}
                          />
                          {!l.novoUnidades.trim() && <span className="text-perigo">Informe</span>}
                        </label>
                      </div>
                    </div>
                  )}
                  {l.candidatoId && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1 text-xs font-medium text-texto-suave">
                        Quantidade (embalagens)
                        <Input inputMode="decimal" value={l.quantidade} onChange={(e) => mudar(i, { quantidade: e.target.value })} />
                      </label>
                      <label className="flex flex-col gap-1 text-xs font-medium text-texto-suave">
                        Valor por embalagem (R$)
                        <Input inputMode="decimal" value={l.valor} onChange={(e) => mudar(i, { valor: e.target.value })} />
                      </label>
                    </div>
                  )}
                    </div>
                  )}
                  {l.convertido && <p className="mt-1 text-xs text-texto-suave">Convertido de unidades para embalagens.</p>}
                  {mudou && (
                    <p className="mt-2 text-xs font-medium text-marrom">
                      Preço mudou: {rotuloReferencia.toLowerCase()} {moeda(c?.precoReferencia)} → agora {moeda(valor)}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {ignoradas.length > 0 && (
            <p className="text-xs text-texto-suave">
              {ignoradas.length} {ignoradas.length === 1 ? "linha não parecia produto e foi ignorada" : "linhas não pareciam produto e foram ignoradas"}{" "}
              (ex.: "{ignoradas[0].slice(0, 60)}").
            </p>
          )}
          {comPrecoNovo.length > 0 && (
            <label className="flex items-start gap-2 rounded-xl border border-amarelo/50 bg-amarelo/15 p-3 font-medium text-marrom">
              <input type="checkbox" className="mt-0.5 size-5 accent-verde" checked={confirmouPrecos} onChange={(e) => setConfirmouPrecos(e.target.checked)} />
              Confirmo {comPrecoNovo.length === 1 ? "o preço alterado" : `os ${comPrecoNovo.length} preços alterados`} acima.
            </label>
          )}
          {erro && <Aviso tom="erro">{erro}</Aviso>}
        </div>
      )}
    </Dialogo>
  );
}

function Passo({ n }: { n: number }) {
  return (
    <span aria-hidden="true" className="flex size-6 shrink-0 items-center justify-center rounded-full bg-verde text-xs font-bold text-creme">
      {n}
    </span>
  );
}

export function BotaoColarLista({ aoClicar }: { aoClicar: () => void }) {
  return (
    <Button variant="contorno" onClick={aoClicar}>
      <ClipboardPaste className="size-4" /> Colar lista
    </Button>
  );
}
