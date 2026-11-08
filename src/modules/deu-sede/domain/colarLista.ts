import { lerDecimal, normalizarBusca } from "@/modules/deu-sede/domain/formatos";
import type { Embalagem } from "@/modules/deu-sede/data/tipos";

// "Colar lista": transforma o texto colado (geralmente gerado por uma IA a
// partir da nota fiscal ou da proposta do fornecedor) em linhas de
// produto/quantidade/valor, e associa cada linha a um produto do sistema.
// Nada é gravado aqui: a tela mostra a conferência e o usuário confirma.

export const INSTRUCAO_IA = `Transforme o documento abaixo (nota fiscal, pedido ou orçamento) em uma lista com UMA LINHA POR PRODUTO.
Use as colunas abaixo, separadas por ponto e vírgula, e a primeira linha com os nomes das colunas:
Código;Produto;Quantidade;Unidade;Itens por embalagem;Valor unitário;Valor total
- Unidade: como aparece no documento (CX, FD, PCT, DZ, UN...).
- Itens por embalagem: quantas unidades vêm em cada CX/FD/PCT (ex.: "CX C/12" = 12, "15X269ML" = 15, DZ = 12). Para UN, use 1. Se o documento não disser, deixe vazio (não chute).
- Use vírgula como separador decimal (ex.: 39,90) e não use "R$".
- Não escreva nada além da lista.`;

export interface LinhaColada {
  /** número da linha no texto colado (1, 2, 3…) */
  linha: number;
  texto: string;
  codigo: string | null;
  descricao: string;
  quantidade: number | null;
  unidade: string | null;
  valorUnitario: number | null;
  valorTotal: number | null;
  /** unidades em cada embalagem (coluna própria ou "C/12" na descrição) */
  unidadesPorEmbalagem?: number | null;
}

type Coluna = "codigo" | "descricao" | "quantidade" | "unidade" | "unidadesEmbalagem" | "valorUnitario" | "valorTotal";

const CABECALHOS: [Coluna, RegExp][] = [
  // antes das outras: "Itens por embalagem", "Unid./emb.", "Unidades por caixa"
  ["unidadesEmbalagem", /^(itens|unidades|unid|und|un)\.?\s*(por|p\/|\/|na|da|x)\s*(emb|cx|caixa|fardo|pacote)/],
  ["valorTotal", /(valor|vl|vlr|v\.?)\s*\.?\s*tot|^total$|subtotal/],
  ["valorUnitario", /unit|pre[cç]o|(valor|vl|vlr|v\.?)\s*\.?\s*un|^valor$/],
  ["quantidade", /^qt|quant/],
  ["unidade", /^un(id(ade)?)?\.?$|^emb|^medida|^u\.?m\.?$/],
  ["codigo", /c[oó]d|^ean|^sku|^ref/],
  ["descricao", /produto|descri|^item$|mercadoria|^nome/],
];

const UNIDADES_TEXTO = /^(cx|caixa|caixas|fd|fardo|fardos|pct|pt|pacote|pacotes|pack|packs|un|und|unid|unidade|unidades|eng|engradado|gf|garrafao|garrafão|dz|duzia|dúzia|kg|l|lt)\.?$/i;

/**
 * Embalagem pela coluna "Unidade" da nota: CX -> caixa, FD -> fardo,
 * PT/PCT -> pack, DZ -> pack com 12, UN -> unidade. Número junto
 * ("CX12", "FD/6") vira as unidades por embalagem.
 */
export function embalagemDaUnidade(unidade: string | null): { tipo: Embalagem; unidades: number | null } {
  const x = normalizarBusca(unidade).replace(/\./g, "");
  const m = x.match(/(\d{1,3})/);
  const n = m ? Number(m[1]) : NaN;
  const unidades = Number.isInteger(n) && n >= 2 && n <= 200 ? n : null;
  if (/^(dz|duzia)/.test(x)) return { tipo: "pack", unidades: 12 };
  if (/^(un|und|unid)/.test(x)) return { tipo: "unidade", unidades: 1 };
  if (/^(fd|fardo)/.test(x)) return { tipo: "fardo", unidades };
  if (/^(pct|pt|pc|pacote|pack|pk)/.test(x)) return { tipo: "pack", unidades };
  if (/^(eng|engradado)/.test(x)) return { tipo: "engradado", unidades };
  if (/^(gf|garraf)/.test(x)) return { tipo: "garrafao", unidades };
  return { tipo: "caixa", unidades };
}

/** EAN/GTIN (8, 12, 13 ou 14 dígitos): vale para qualquer fornecedor. */
export function ehCodigoDeBarras(codigo: string | null | undefined): boolean {
  return /^(\d{8}|\d{12,14})$/.test((codigo ?? "").trim());
}

function limparCelula(c: string): string {
  return c.replace(/^["'\s]+|["'\s]+$/g, "").replace(/\s+/g, " ");
}

function ehNumero(c: string): boolean {
  return /^(r\$\s*)?-?\d{1,3}(\.\d{3})*(,\d+)?$|^(r\$\s*)?-?\d+([.,]\d+)?$/i.test(c.trim());
}

function separador(linhas: string[]): string | null {
  const conta = (s: string) => linhas.filter((l) => l.includes(s)).length;
  const metade = Math.max(1, Math.ceil(linhas.length / 2));
  if (conta("\t") >= metade) return "\t";
  if (conta("|") >= metade) return "|";
  if (conta(";") >= metade) return ";";
  return null;
}

function dividir(linha: string, sep: string): string[] {
  let l = linha.trim();
  if (sep === "|") l = l.replace(/^\|/, "").replace(/\|$/, "");
  return l.split(sep).map(limparCelula);
}

function mapearCabecalho(celulas: string[]): Partial<Record<Coluna, number>> | null {
  const mapa: Partial<Record<Coluna, number>> = {};
  celulas.forEach((c, i) => {
    const n = normalizarBusca(c);
    if (!n || ehNumero(c)) return;
    for (const [coluna, re] of CABECALHOS) {
      if (re.test(n) && mapa[coluna] === undefined) {
        mapa[coluna] = i;
        break;
      }
    }
  });
  return mapa.descricao !== undefined && (mapa.quantidade !== undefined || mapa.valorUnitario !== undefined) ? mapa : null;
}

/** Sem cabeçalho: descobre as colunas pelo conteúdo. */
function inferirColunas(celulas: string[]): Partial<Record<Coluna, number>> {
  const mapa: Partial<Record<Coluna, number>> = {};
  const numericas = celulas.map((c, i) => (ehNumero(c) ? i : -1)).filter((i) => i >= 0);
  const textos = celulas.map((c, i) => (!ehNumero(c) && c ? i : -1)).filter((i) => i >= 0);
  const unidade = textos.find((i) => UNIDADES_TEXTO.test(celulas[i]));
  if (unidade !== undefined) mapa.unidade = unidade;
  const textosSemUnidade = textos.filter((i) => i !== unidade);
  // descrição = texto mais longo; código = coluna antes dela, se curta
  const desc = textosSemUnidade.sort((a, b) => celulas[b].length - celulas[a].length)[0];
  if (desc !== undefined) mapa.descricao = desc;
  const primeira = numericas[0];
  if (desc !== undefined && primeira !== undefined && primeira < desc && celulas[primeira].replace(/\D/g, "").length >= 4) {
    mapa.codigo = primeira;
    numericas.shift();
  }
  if (desc !== undefined && mapa.codigo === undefined) {
    const cod = textosSemUnidade.find((i) => i < desc && /^[\w.-]{3,20}$/.test(celulas[i]));
    if (cod !== undefined) mapa.codigo = cod;
  }
  const [q, u, t] = numericas;
  if (q !== undefined) mapa.quantidade = q;
  if (u !== undefined) mapa.valorUnitario = u;
  if (t !== undefined) mapa.valorTotal = t;
  return mapa;
}

function numeroDe(c: string | undefined): number | null {
  if (c === undefined) return null;
  const n = lerDecimal(c.replace(/r\$/i, ""));
  return n === null || Number.isNaN(n) ? null : n;
}

const VOLUME = String.raw`(?!\s*(?:ml|l|lt|lts|litros?|g|kg)\b)`;
const PADROES_UNIDADES: RegExp[] = [
  new RegExp(String.raw`\bc\s*\/\s*(\d{1,3})\b` + VOLUME), // C/12, CX C/ 12
  new RegExp(String.raw`\b(?:cx|caixa|fd|fardo|pct|pacote|pack|pk|eng|engradado)\s*(?:com\s+|\/\s*|x\s*)?(\d{1,3})\b` + VOLUME), // CX12, FD 6
  /\b(\d{1,3})\s*x\s*\d+(?:[.,]\d+)?\s*(?:ml|l|lt|g|kg)\b/, // 12X350ML
  /\b(\d{1,3})\s*x\s*1\b(?![.,]?\d)/, // LT 6X1
  /\b(\d{1,3})\s*(?:un|und|unid|unidades)\b/, // 12UN
];

/** Unidades por embalagem escritas na descrição da nota ("C/12", "FD6", "12X350ML", "6X1", "DZ"). */
export function unidadesDaDescricao(descricao: string): number | null {
  const t = normalizarBusca(descricao);
  if (/\bsix\s*-?\s*pack\b/.test(t)) return 6;
  if (/\b(dz|duzia)\b/.test(t)) return 12;
  for (const re of PADROES_UNIDADES) {
    const m = t.match(re);
    const n = m ? Number(m[1]) : NaN;
    if (Number.isInteger(n) && n >= 2 && n <= 200) return n;
  }
  return null;
}

function inteiroPositivo(n: number | null): number | null {
  return n !== null && Number.isInteger(n) && n > 0 ? n : null;
}

// Primeiro o tipo escrito na nota (CERV, REFRIG, AGUA…), depois a marca:
// "REFRIG GUARANA ANTARCTICA" é refrigerante, mesmo Antarctica sendo cerveja.
const TIPO_CATEGORIA: [string, RegExp][] = [
  ["energeticos", /\b(energ\w*)\b/],
  ["sucos", /\b(suco|sucos|nectar)\b/],
  ["cervejas", /\b(cerv\w*|chopp?|chope|pilsen|lager|ipa|puro malte)\b/],
  ["refrigerantes", /\b(refr\w*|soda|tonica|guarana)\b/],
  ["aguas", /\b(agua|aguas|mineral)\b/],
  ["descartaveis", /\b(copo|copos|descart\w*|guardanapo|canudo|prato|pratos|sacola|sacolas|talher\w*)\b/],
];
const MARCA_CATEGORIA: [string, RegExp][] = [
  ["energeticos", /\b(red ?bull|monster|tnt|burn|fusion|baly|flying horse|vibe)\b/],
  ["sucos", /\b(del ?valle|maguary|ades|tial|natural one)\b/],
  ["refrigerantes", /\b(coca|cola|fanta|sprite|pepsi|kuat|sukita|h2oh|schweppes)\b/],
  ["cervejas", /\b(brahma|skol|antarctica|budweiser|heineken|stella|corona|original|amstel|itaipava|spaten|eisenbahn|devassa|bohemia|colorado|becks?|petra)\b/],
  ["aguas", /\b(bonafont|indaia|minalba|lindoya|crystal)\b/],
];

/** Categoria provável pelo nome do produto da nota (null se não der para saber). */
export function sugerirCategoria<T extends { id: string; nome: string }>(descricao: string, categorias: T[]): string | null {
  const t = normalizarBusca(descricao);
  for (const [nome, re] of [...TIPO_CATEGORIA, ...MARCA_CATEGORIA]) {
    if (!re.test(t)) continue;
    const c = categorias.find((x) => normalizarBusca(x.nome) === nome);
    if (c) return c.id;
  }
  return null;
}

/** Linha de texto livre: "20 cx Brahma Chopp 269ml R$ 39,90" */
function interpretarTextoLivre(texto: string): Omit<LinhaColada, "linha" | "texto"> | null {
  let t = texto.replace(/^(?:[-*•]|\d+[.)])\s+/, "").trim(); // marcador de lista "-", "•", "1."
  // valores em dinheiro: com R$ ou com 2 casas decimais
  const dinheiro = [...t.matchAll(/(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+[.,]\d{2})(?!\d)(?!\s*(?:ml|l|kg|g)\b)/gi)];
  const valores = dinheiro.map((m) => numeroDe(m[1])).filter((v): v is number => v !== null);
  for (const m of dinheiro) t = t.replace(m[0], " ");
  // quantidade: número no começo (com unidade opcional) ou "x 20" / "qtd 20"
  let quantidade: number | null = null;
  let unidade: string | null = null;
  const inicio = t.match(/^\s*(\d+(?:[.,]\d+)?)\s*(?:x\s+)?([a-zçã]{1,10}\.?)?\s+(?=\S)/i);
  if (inicio && (!inicio[2] || UNIDADES_TEXTO.test(inicio[2]))) {
    quantidade = numeroDe(inicio[1]);
    unidade = inicio[2] ?? null;
    t = t.slice(inicio[0].length);
  } else {
    const fim = t.match(/(?:\bqtd\.?|\bquant(?:idade)?|\bx)\s*:?\s*(\d+(?:[.,]\d+)?)\s*([a-zçã]{1,10}\.?)?/i);
    if (fim) {
      quantidade = numeroDe(fim[1]);
      unidade = fim[2] && UNIDADES_TEXTO.test(fim[2]) ? fim[2] : null;
      t = t.replace(fim[0], " ");
    }
  }
  const descricao = t
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s[-–—=:]+\s|\s[-–—=:]+$|^[-–—=:]+\s/g, " ")
    .trim();
  if (!descricao || (quantidade === null && valores.length === 0)) return null;
  return {
    codigo: null,
    descricao,
    quantidade,
    unidade,
    valorUnitario: valores[0] ?? null,
    valorTotal: valores[1] ?? null,
    unidadesPorEmbalagem: (unidade ? embalagemDaUnidade(unidade).unidades : null) ?? unidadesDaDescricao(descricao),
  };
}

export function interpretarLista(texto: string): { linhas: LinhaColada[]; ignoradas: string[] } {
  const brutas = texto
    .split(/\r?\n/)
    .map((l, i) => ({ i: i + 1, l: l.trim() }))
    .filter(({ l }) => l && !/^\|?\s*:?-{2,}/.test(l) && !/^```/.test(l));
  const sep = separador(brutas.map((b) => b.l));
  const linhas: LinhaColada[] = [];
  const ignoradas: string[] = [];

  let mapa: Partial<Record<Coluna, number>> | null = null;
  brutas.forEach(({ i, l }, idx) => {
    if (/^(sub)?total\b|^valor total\b|^total geral/i.test(normalizarBusca(l))) {
      ignoradas.push(l);
      return;
    }
    if (sep) {
      const celulas = dividir(l, sep);
      if (idx === 0 || mapa === null) {
        const cab = mapearCabecalho(celulas);
        if (cab) {
          mapa = cab;
          return;
        }
      }
      const m = mapa ?? inferirColunas(celulas);
      const descricao = m.descricao !== undefined ? celulas[m.descricao] ?? "" : "";
      const quantidade = numeroDe(m.quantidade !== undefined ? celulas[m.quantidade] : undefined);
      const valorUnitario = numeroDe(m.valorUnitario !== undefined ? celulas[m.valorUnitario] : undefined);
      const valorTotal = numeroDe(m.valorTotal !== undefined ? celulas[m.valorTotal] : undefined);
      if (!descricao || (quantidade === null && valorUnitario === null)) {
        ignoradas.push(l);
        return;
      }
      linhas.push({
        linha: i,
        texto: l,
        codigo: m.codigo !== undefined ? celulas[m.codigo] || null : null,
        descricao,
        quantidade,
        unidade: m.unidade !== undefined ? celulas[m.unidade] || null : null,
        // sem valor unitário mas com total e quantidade: calcula
        valorUnitario: valorUnitario ?? (valorTotal !== null && quantidade ? Math.round((valorTotal / quantidade) * 100) / 100 : null),
        valorTotal,
        // coluna própria > número na unidade ("CX12", DZ) > descrição ("C/12")
        unidadesPorEmbalagem:
          inteiroPositivo(numeroDe(m.unidadesEmbalagem !== undefined ? celulas[m.unidadesEmbalagem] : undefined)) ??
          (m.unidade !== undefined && celulas[m.unidade] ? embalagemDaUnidade(celulas[m.unidade]).unidades : null) ??
          unidadesDaDescricao(descricao),
      });
    } else {
      const r = interpretarTextoLivre(l);
      if (r) linhas.push({ linha: i, texto: l, ...r });
      else ignoradas.push(l);
    }
  });
  return { linhas, ignoradas };
}

// ------------------------------------------------------------- Associação

export interface Candidato {
  id: string;
  nome: string;
  codigos: (string | null | undefined)[];
  /** unidades por embalagem (para converter quantidades em UN) */
  unidadesPorEmbalagem: number;
}

function tokens(texto: string): string[] {
  return normalizarBusca(texto)
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !["de", "da", "do", "c", "com", "e"].includes(t));
}

/** Semelhança entre nomes (0 a 1), por palavras em comum. */
export function semelhanca(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (!ta.size || !tb.size) return 0;
  let comuns = 0;
  ta.forEach((t) => tb.has(t) && comuns++);
  return (2 * comuns) / (ta.size + tb.size);
}

export interface Associacao {
  candidatoId: string | null;
  confianca: "codigo" | "nome" | "nenhuma";
}

// Palavras que não identificam o produto: tipo de bebida, embalagem e
// unidade. Sem tirá-las, "CERVEJA ANTARCTICA SUBZERO LT 269ML" parecia
// "CERVEJA AMSTEL LT 269ML" só por "cerveja lt 269 ml".
const RUIDO = new Set(
  (
    "cerveja cervejas cerv refr refri refrig refrigerante refrigerantes agua aguas mineral suco sucos energetico energeticos bebida " +
    "lt lata latas latinha long neck ln l n garrafa garrafinha gf pet vidro descartavel retornavel " +
    "cx caixa fd fardo dz duzia pack multpack multipack multi pct pt pacote un und unid unidade unidades sh x " +
    "ml lts litro litros g kg de da do c com e s sem"
  ).split(" "),
);

// Palavras que mudam o produto: se uma descrição tem e a outra não, não
// é o mesmo item (Coca x Coca Zero, Fanta Laranja x Fanta Uva, Stella x
// Stella Pure Gold, Império x Império Ultra).
const VARIANTES = (
  "zero diet light lite acucar uva laranja limao maracuja abacaxi morango pessego manga caju goiaba tangerina citrus " +
  "tonica guarana ultra gold pure puro malte duplo black red white subzero shot ipa weiss apa original gl gluten cero"
).split(" ");

function editarUm(a: string, b: string): boolean {
  // distância de edição <= 1 (uma letra trocada, sobrando ou faltando)
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let difs = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++difs > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return difs + (a.length - i) + (b.length - j) <= 1;
}

/** "CHOP" = "chopp", "ANT" = "antarctica", "ANTARTICA" = "antarctica". */
function parecida(a: string, b: string): boolean {
  if (a === b) return true;
  const [curta, longa] = a.length <= b.length ? [a, b] : [b, a];
  if (curta.length >= 3 && longa.startsWith(curta)) return true;
  return curta.length >= 5 && editarUm(a, b);
}

/** Volumes da descrição em ml/g (1L -> 1000): produtos de volumes diferentes nunca são o mesmo. */
function volumes(texto: string): Set<number> {
  const r = new Set<number>();
  for (const m of normalizarBusca(texto).matchAll(/(\d+(?:[.,]\d+)?)\s*(ml|l|lt|lts|litros?|g|kg)\b/g)) {
    const n = Number(m[1].replace(",", "."));
    r.add(Math.round(/^(l|lt|lts|litro|litros|kg)$/.test(m[2]) ? n * 1000 : n));
  }
  return r;
}

function identidade(texto: string): string[] {
  return normalizarBusca(texto)
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !RUIDO.has(t) && !/^\d+$/.test(t));
}

/**
 * Nota de 0 a 1 de a linha da nota ser o produto do cadastro. Zero quando
 * o volume é outro, quando só um dos dois tem uma variante (zero, uva,
 * ultra, pure gold…) ou quando cada um tem uma marca que o outro não tem.
 */
export function notaAssociacao(descricao: string, nome: string): number {
  const va = volumes(descricao);
  const vb = volumes(nome);
  if (va.size && vb.size && ![...va].some((v) => vb.has(v))) return 0;
  const a = identidade(descricao);
  const b = identidade(nome);
  if (!a.length || !b.length) return 0;
  const variante = (t: string) => VARIANTES.some((v) => parecida(t, v));
  const falta = (de: string[], em: string[]) => de.some((t) => variante(t) && !em.some((u) => parecida(t, u)));
  if (falta(a, b) || falta(b, a)) return 0;
  // Palavra própria dos DOIS lados = marcas diferentes (Guaraná Antarctica x
  // Guaraná Paraense). Só um lado com palavra a mais ("Skol" x "Skol
  // Pilsen") ainda pode ser o mesmo produto.
  const soA = a.filter((t) => !b.some((u) => parecida(t, u)));
  const soB = b.filter((t) => !a.some((u) => parecida(t, u)));
  if (soA.length && soB.length) return 0;
  const comuns = a.length - soA.length;
  return (2 * comuns) / (a.length + b.length);
}

export function associar(linha: LinhaColada, candidatos: Candidato[]): Associacao {
  const codigo = (linha.codigo ?? "").trim().toLowerCase();
  if (codigo) {
    const porCodigo = candidatos.find((c) => c.codigos.some((x) => x && x.trim().toLowerCase() === codigo));
    if (porCodigo) return { candidatoId: porCodigo.id, confianca: "codigo" };
  }
  let melhor: { id: string; nota: number } | null = null;
  for (const c of candidatos) {
    const nota = notaAssociacao(linha.descricao, c.nome);
    if (!melhor || nota > melhor.nota) melhor = { id: c.id, nota };
  }
  return melhor && melhor.nota >= 0.5 ? { candidatoId: melhor.id, confianca: "nome" } : { candidatoId: null, confianca: "nenhuma" };
}

/**
 * Nota em UNIDADES e produto comprado em embalagens: converte
 * (ex.: 240 UN a R$ 3,325 -> 20 CX c/ 12 a R$ 39,90).
 */
export function converterParaEmbalagem(
  linha: Pick<LinhaColada, "quantidade" | "unidade" | "valorUnitario">,
  unidadesPorEmbalagem: number,
): { quantidade: number | null; valorUnitario: number | null; convertido: boolean } {
  const emUnidades = !!linha.unidade && /^(un|und|unid|unidade|unidades)\.?$/i.test(linha.unidade.trim());
  if (!emUnidades || unidadesPorEmbalagem <= 1 || linha.quantidade === null) {
    return { quantidade: linha.quantidade, valorUnitario: linha.valorUnitario, convertido: false };
  }
  return {
    quantidade: Math.round((linha.quantidade / unidadesPorEmbalagem) * 1000) / 1000,
    valorUnitario: linha.valorUnitario === null ? null : Math.round(linha.valorUnitario * unidadesPorEmbalagem * 100) / 100,
    convertido: true,
  };
}

/** Diferença de preço relevante (mais de 1 centavo). */
export function precoMudou(novo: number | null, referencia: number | null | undefined): boolean {
  return novo !== null && referencia !== null && referencia !== undefined && Math.abs(novo - Number(referencia)) >= 0.01;
}
