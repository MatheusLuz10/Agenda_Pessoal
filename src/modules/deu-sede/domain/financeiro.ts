import type { FormaConta } from "@/modules/deu-sede/data/tipos";
import { hojeISO, somarDias } from "@/modules/deu-sede/domain/formatos";

// Contas a pagar (migração 0016): à vista = paga na hora (sai do caixa);
// parcelado = parcelas mensais a partir do 1º vencimento.

export interface EscolhaPagamento {
  forma: FormaConta;
  /** texto do campo (nº de parcelas) */
  parcelas: string;
  /** 1º vencimento (aaaa-mm-dd) */
  primeiro: string;
}

export function escolhaInicial(base = new Date()): EscolhaPagamento {
  return { forma: "a_vista", parcelas: "2", primeiro: somarDias(hojeISO(base), 30) };
}

/** Parcelas iguais; a última leva a diferença dos centavos (igual ao banco). */
export function dividirParcelas(total: number, n: number): number[] {
  if (!(n >= 1) || !(total > 0)) return [];
  const centavos = Math.round(total * 100);
  const base = Math.floor(centavos / n);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? centavos - base * (n - 1) : base) / 100);
}

/** Mensagem de erro da escolha (ou null se está tudo certo). */
export function erroEscolha(e: EscolhaPagamento, total: number): string | null {
  if (e.forma === "a_vista") return null;
  const n = Number(e.parcelas);
  if (!Number.isInteger(n) || n < 1 || n > 48) return "O número de parcelas vai de 1 a 48.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.primeiro)) return "Informe a data do 1º vencimento.";
  if (total > 0 && Math.floor(Math.round(total * 100) / n) <= 0) return `Valor pequeno demais para ${n} parcelas.`;
  return null;
}

/** Campos para lancar_conta_pagar. */
export function payloadEscolha(e: EscolhaPagamento): { forma: FormaConta; parcelas?: number; primeiro_vencimento?: string } {
  return e.forma === "a_vista" ? { forma: "a_vista" } : { forma: "parcelado", parcelas: Number(e.parcelas), primeiro_vencimento: e.primeiro };
}

function diasEntre(de: string, ate: string): number {
  const [y1, m1, d1] = de.split("-").map(Number);
  const [y2, m2, d2] = ate.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** "Vencida há 3 dias", "Vence hoje", "Vence em 5 dias"… */
export function situacaoVencimento(vencimento: string, hoje = hojeISO()): { texto: string; tom: "perigo" | "atencao" | "normal" } {
  const d = diasEntre(hoje, vencimento.slice(0, 10));
  if (d < 0) return { texto: `Vencida há ${-d} ${d === -1 ? "dia" : "dias"}`, tom: "perigo" };
  if (d === 0) return { texto: "Vence hoje", tom: "atencao" };
  if (d <= 7) return { texto: `Vence em ${d} ${d === 1 ? "dia" : "dias"}`, tom: "atencao" };
  const [y, m, dia] = vencimento.slice(0, 10).split("-");
  return { texto: `Vence ${dia}/${m}/${y}`, tom: "normal" };
}
