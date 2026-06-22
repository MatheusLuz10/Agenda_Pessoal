import { MONTH_NAMES_PT } from "@/lib/date";
import type { Transaction } from "@/types";

// Formata um número como moeda brasileira (R$ 1.234,56). Centralizado
// aqui para todo o módulo financeiro mostrar valores no mesmo formato.
export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Soma o valor de todas as entradas de uma lista de lançamentos.
export function sumEntradas(transactions: Transaction[]): number {
  return transactions
    .filter((t) => t.type === "entrada")
    .reduce((total, t) => total + t.amount, 0);
}

// Soma o valor de todas as saídas de uma lista de lançamentos.
export function sumSaidas(transactions: Transaction[]): number {
  return transactions.filter((t) => t.type === "saida").reduce((total, t) => total + t.amount, 0);
}

// Saldo = total de entradas menos total de saídas. Quando aplicado sobre
// TODOS os lançamentos (não só os do mês), representa o saldo acumulado.
export function calcBalance(transactions: Transaction[]): number {
  return sumEntradas(transactions) - sumSaidas(transactions);
}

// Filtra lançamentos cuja data cai no mês/ano informados (mês 0-indexado,
// igual ao padrão usado em MonthGrid/lib/date.ts).
export function filterByMonth(
  transactions: Transaction[],
  year: number,
  month: number
): Transaction[] {
  const prefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  return transactions.filter((t) => t.date.startsWith(prefix));
}

export interface MonthlyFlow {
  month: string; // nome curto do mês, para o eixo X do gráfico de barras
  entradas: number;
  saidas: number;
}

// Agrupa entradas/saídas por mês de um ano específico — base do gráfico
// "Fluxo Mensal" (12 barras, Janeiro a Dezembro).
export function getMonthlyFlow(transactions: Transaction[], year: number): MonthlyFlow[] {
  return MONTH_NAMES_PT.map((name, month) => {
    const monthTransactions = filterByMonth(transactions, year, month);
    return {
      month: name.slice(0, 3),
      entradas: sumEntradas(monthTransactions),
      saidas: sumSaidas(monthTransactions),
    };
  });
}

export interface CategoryTotal {
  category: string;
  total: number;
}

// Agrupa o total de SAÍDAS por categoria — base do gráfico de pizza
// "Gastos por Categoria". Ordenado do maior para o menor gasto.
export function getCategoryTotals(transactions: Transaction[]): CategoryTotal[] {
  const totals = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== "saida") continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
  }
  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

// Paleta de cores usada nos gráficos (pizza e legendas), ciclando se
// houver mais categorias do que cores.
export const CHART_COLORS = [
  "#3b82f6",
  "#f97316",
  "#10b981",
  "#a855f7",
  "#ef4444",
  "#eab308",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#64748b",
];
