import { lerDecimal, normalizarBusca } from "@/modules/deu-sede/domain/formatos";

// "Colar lista": transforma o texto colado (geralmente gerado por uma IA a
// partir da nota fiscal ou da proposta do fornecedor) em linhas de
// produto/quantidade/valor, e associa cada linha a um produto do sistema.
// Nada é gravado aqui: a tela mostra a conferência e o usuário confirma.

export const INSTRUCAO_IA = `Transforme o documento abaixo (nota fiscal, pedido ou orçamento) em uma lista com UMA LINHA POR PRODUTO.
Use as colunas abaixo, separadas por ponto e vírgula, e a primeira linha com os nomes das colunas:
Código;Produto;Quantidade;Unidade;Itens por embalagem;Valor unitário;Valor total
- Unidade: como aparece no documento (CX, FD, PCT, UN...).
- Itens por embalagem: quantas unidades vêm em cada CX/FD/PCT (ex.: "CX C/12" = 12). Para UN, use 1. Se não souber, deixe vazio.
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

const UNIDADES_TEXTO = /^(cx|caixa|caixas|fd|fardo|fardos|pct|pacote|pacotes|pack|packs|un|und|unid|unidade|unidades|eng|engradado|gf|garrafao|garrafão|dz|kg|l|lt)\.?$/i;

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
  /\b(\d{1,3})\s*(?:un|und|unid|unidades)\b/, // 12UN
];

/** Unidades por embalagem escritas na descrição da nota ("C/12", "FD6", "12X350ML"). */
export function unidadesDaDescricao(descricao: string): number | null {
  const t = normalizarBusca(descricao);
  if (/\bsix\s*-?\s*pack\b/.test(t)) return 6;
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
  ["refrigerantes", /\b(refri\w*|soda|tonica|guarana)\b/],
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
    unidadesPorEmbalagem: unidadesDaDescricao(descricao),
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
        unidadesPorEmbalagem:
          inteiroPositivo(numeroDe(m.unidadesEmbalagem !== undefined ? celulas[m.unidadesEmbalagem] : undefined)) ?? unidadesDaDescricao(descricao),
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

export function associar(linha: LinhaColada, candidatos: Candidato[]): Associacao {
  const codigo = (linha.codigo ?? "").trim().toLowerCase();
  if (codigo) {
    const porCodigo = candidatos.find((c) => c.codigos.some((x) => x && x.trim().toLowerCase() === codigo));
    if (porCodigo) return { candidatoId: porCodigo.id, confianca: "codigo" };
  }
  let melhor: { id: string; nota: number } | null = null;
  for (const c of candidatos) {
    const nota = semelhanca(linha.descricao, c.nome);
    if (!melhor || nota > melhor.nota) melhor = { id: c.id, nota };
  }
  return melhor && melhor.nota >= 0.45 ? { candidatoId: melhor.id, confianca: "nome" } : { candidatoId: null, confianca: "nenhuma" };
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
