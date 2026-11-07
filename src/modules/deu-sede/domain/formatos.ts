import type { Embalagem, UnidadeMedida } from "@/modules/deu-sede/data/tipos";

export const EMBALAGENS: { valor: Embalagem; rotulo: string }[] = [
  { valor: "caixa", rotulo: "Caixa" },
  { valor: "fardo", rotulo: "Fardo" },
  { valor: "pack", rotulo: "Pack" },
  { valor: "engradado", rotulo: "Engradado" },
  { valor: "garrafao", rotulo: "Garrafão" },
  { valor: "unidade", rotulo: "Unidade" },
  { valor: "outro", rotulo: "Outro" },
];

export const UNIDADES_MEDIDA: { valor: UnidadeMedida; rotulo: string }[] = [
  { valor: "ml", rotulo: "ml" },
  { valor: "l", rotulo: "L" },
  { valor: "g", rotulo: "g" },
  { valor: "kg", rotulo: "kg" },
  { valor: "un", rotulo: "un" },
];

export function rotuloEmbalagem(tipo: Embalagem): string {
  return EMBALAGENS.find((e) => e.valor === tipo)?.rotulo ?? tipo;
}

/** "Caixa c/ 12", "Fardo c/ 6", "Unidade" */
export function descreverEmbalagem(tipo: Embalagem, unidades: number): string {
  if (tipo === "unidade" && unidades === 1) return "Unidade";
  return `${rotuloEmbalagem(tipo)} c/ ${numero(unidades)}`;
}

/** "269 ml", "2 L" */
export function descreverVolume(volume: number | null, unidade: UnidadeMedida | null): string {
  if (volume === null || volume === undefined) return "";
  const rot = UNIDADES_MEDIDA.find((u) => u.valor === unidade)?.rotulo ?? unidade ?? "";
  return `${numero(volume)} ${rot}`.trim();
}

const fmtMoeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const fmtMoedaUnit = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

export function moeda(v: number | null | undefined): string {
  return v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : fmtMoeda.format(Number(v));
}

/** Preço por unidade: até 4 casas (ex.: R$ 3,325) */
export function moedaUnitaria(v: number | null | undefined): string {
  return v === null || v === undefined || Number.isNaN(Number(v)) ? "—" : fmtMoedaUnit.format(Number(v));
}

export function numero(v: number | null | undefined, casas = 3): string {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: casas }).format(Number(v));
}

export function percentual(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  return `${n > 0 ? "+" : ""}${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(n)}%`;
}

export function arredondar(v: number, casas = 2): number {
  const f = 10 ** casas;
  return Math.round((v + Number.EPSILON) * f) / f;
}

/** Aceita "39,90", "1.234,56", "39.90", "40". Vazio = null; inválido = NaN. */
export function lerDecimal(texto: string | null | undefined): number | null {
  const t = (texto ?? "").trim().replace(/\s|R\$/g, "");
  if (!t) return null;
  let normal = t;
  if (t.includes(",")) normal = t.replace(/\./g, "").replace(",", ".");
  const n = Number(normal);
  return Number.isFinite(n) ? n : NaN;
}

/** Número para campo de texto em pt-BR ("39,9" -> "39,90" quando dinheiro). */
export function paraCampo(v: number | null | undefined, casas?: number): string {
  if (v === null || v === undefined) return "";
  const n = Number(v);
  return casas === undefined ? String(n).replace(".", ",") : n.toFixed(casas).replace(".", ",");
}

// ------------------------------------------------------------- Datas

/** Data de hoje (fuso do aparelho) no formato do banco: 2026-11-07 */
export function hojeISO(base = new Date()): string {
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function somarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return hojeISO(new Date(y, m - 1, d + dias));
}

export function inicioDoMes(iso: string, deslocamento = 0): string {
  const [y, m] = iso.split("-").map(Number);
  return hojeISO(new Date(y, m - 1 + deslocamento, 1));
}

export function fimDoMes(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return hojeISO(new Date(y, m, 0));
}

/** "2026-11-07" -> "07/11/2026" (sem conversão de fuso) */
export function dataBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function dataHoraBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "2026-11-01" -> "nov/26" */
export function mesCurto(iso: string): string {
  const [y, m] = iso.split("-");
  return `${MESES[Number(m) - 1]}/${y.slice(2)}`;
}

// ------------------------------------------------- Contato e documentos

export function somenteDigitos(texto: string | null | undefined): string {
  return (texto ?? "").replace(/\D/g, "");
}

/** WhatsApp em dígitos (com DDD; 55 opcional). null = vazio; "" = inválido. */
export function normalizarWhatsapp(texto: string | null | undefined): string | null {
  const d = somenteDigitos(texto);
  if (!d) return null;
  return d.length >= 10 && d.length <= 13 ? d : "";
}

export function formatarTelefone(texto: string | null | undefined): string {
  let d = somenteDigitos(texto);
  if (!d) return "";
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

export function cnpjValido(texto: string | null | undefined): boolean {
  const c = somenteDigitos(texto);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const digito = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split("").reduce((s, n, i) => s + Number(n) * pesos[i], 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = digito(c.slice(0, 12));
  const d2 = digito(c.slice(0, 12) + d1);
  return c.endsWith(`${d1}${d2}`);
}

export function formatarCnpj(texto: string | null | undefined): string {
  const c = somenteDigitos(texto);
  if (c.length !== 14) return texto ?? "";
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

export function emailValido(texto: string | null | undefined): boolean {
  return !texto || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto.trim());
}

/** Busca sem acento e sem diferença de maiúsculas. */
export function normalizarBusca(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function contemBusca(busca: string, ...campos: (string | null | undefined)[]): boolean {
  const b = normalizarBusca(busca);
  if (!b) return true;
  return campos.some((c) => normalizarBusca(c).includes(b));
}

const PLURAL: Record<Embalagem, string> = {
  caixa: "caixas",
  fardo: "fardos",
  pack: "packs",
  engradado: "engradados",
  garrafao: "garrafões",
  unidade: "un",
  outro: "emb.",
};

/** Saldo em unidades descrito em embalagens: "16 packs c/ 12 + 4 un" */
export function descreverQuantidade(unidades: number, porEmbalagem: number, tipo: Embalagem): string {
  const n = Number(unidades);
  if (porEmbalagem <= 1 || tipo === "unidade") return `${numero(n)} un`;
  const sinal = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  const emb = Math.floor(abs / porEmbalagem + 1e-9);
  const resto = arredondar(abs - emb * porEmbalagem, 3);
  const partes: string[] = [];
  if (emb > 0) partes.push(`${numero(emb)} ${emb === 1 ? rotuloEmbalagem(tipo).toLowerCase() : PLURAL[tipo]} c/ ${porEmbalagem}`);
  if (resto > 0 || emb === 0) partes.push(`${numero(resto)} un`);
  return sinal + partes.join(" + ");
}
