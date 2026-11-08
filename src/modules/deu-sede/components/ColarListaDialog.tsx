import { useState } from "react";
import { ClipboardCopy, ClipboardPaste } from "lucide-react";
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
import { EMBALAGENS, lerDecimal, moeda, normalizarBusca, paraCampo } from "@/modules/deu-sede/domain/formatos";
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
  const porId = new Map(candidatos.map((c) => [c.id, c]));

  function fechar() {
    setTexto("");
    setLinhas(null);
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
    setLinhas(
      r.linhas.map((l) => {
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
          // só código de barras vai para o cadastro: código interno do
          // fornecedor ("924") pode ser outro produto em outro fornecedor
          codigo: ehCodigoDeBarras(l.codigo) ? l.codigo : null,
          novoNome: l.descricao,
          novoCategoria: sugerirCategoria(l.descricao, ativas) ?? categoriaPadrao,
          novoEmbalagem: embalagem.tipo,
          novoUnidades: unidadesNovo ? String(unidadesNovo) : "",
        };
      }),
    );
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
          <details className="rounded-xl border border-linha bg-offwhite/50 px-3 py-2">
            <summary className="cursor-pointer font-medium text-verde">Como gerar a lista com IA</summary>
            <p className="mt-2 text-texto-suave">
              Envie a foto ou o PDF da nota para a IA (ChatGPT, Claude, Gemini…) junto com esta instrução e cole aqui a resposta:
            </p>
            <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-white p-2 text-xs whitespace-pre-wrap text-verde">{INSTRUCAO_IA}</pre>
            <Button size="sm" variant="contorno" className="mt-2" onClick={copiarInstrucao}>
              <ClipboardCopy className="size-4" /> {copiado ? "Instrução copiada!" : "Copiar instrução"}
            </Button>
          </details>
          <label className="flex flex-col gap-1.5 font-medium text-verde">
            Lista de produtos
            <Textarea
              maxLength={20000}
              rows={8}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={"Produto;Quantidade;Valor unitário\nBrahma Chopp 269ml;20;39,90\n— ou —\n20 cx Brahma Chopp 269ml R$ 39,90"}
              className="font-mono text-sm"
            />
          </label>
          {erro && <Aviso tom="erro">{erro}</Aviso>}
        </div>
      ) : (
        <div className="flex flex-col gap-3 text-sm">
          <p className="text-texto-suave">
            {categoriasNovos
              ? "Confira cada linha. Produtos que ainda não existem já vêm marcados para cadastro: confira nome, categoria e unidades por embalagem, ou escolha o produto certo na lista."
              : 'Confira cada linha. Produtos não reconhecidos ficam em branco: escolha o produto certo ou deixe "ignorar".'}
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
          <ul className="flex flex-col gap-2">
            {linhas.map((l, i) => {
              const c = porId.get(l.candidatoId);
              const valor = lerDecimal(l.valor);
              const mudou = !!c && precoMudou(valor, c.precoReferencia);
              return (
                <li key={l.linha} className="rounded-xl border border-linha p-3">
                  <p className="mb-2 font-medium break-words text-verde">
                    {l.descricao}{" "}
                    {l.confianca === "codigo" && <Badge tone="verde">pelo código</Badge>}
                    {l.confianca === "nome" && l.candidatoId && <Badge tone="amarelo">pelo nome — confira</Badge>}
                    {!l.candidatoId && <Badge tone="perigo">não reconhecido</Badge>}
                    {l.candidatoId === NOVO && <Badge tone="amarelo">novo — será cadastrado</Badge>}
                  </p>
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

export function BotaoColarLista({ aoClicar }: { aoClicar: () => void }) {
  return (
    <Button variant="contorno" onClick={aoClicar}>
      <ClipboardPaste className="size-4" /> Colar lista
    </Button>
  );
}
