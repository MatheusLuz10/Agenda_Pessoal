import type { Task } from "@/types";

// Retorna a data de hoje no formato ISO "yyyy-MM-dd", que é o mesmo
// formato usado para armazenar `task.date`. Datas em formato ISO podem
// ser comparadas com os operadores < > == diretamente, como strings,
// sem precisar converter para objetos Date.
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Converte uma data ISO ("2026-06-20") para o formato brasileiro
// ("20/06/2026"), usado em toda a interface.
export function formatDateBR(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

// Estado "visual" de uma tarefa em relação à data atual.
// É derivado, nunca salvo: sempre recalculado a partir de task.date/status.
export type TaskTimeStatus = "concluida" | "vencida" | "hoje" | "futura";

// Decide se uma tarefa está concluída, vencida (data passou e não foi
// concluída), é de hoje, ou é futura. Usado para colorir cards de
// tarefa e marcar dias no calendário (vermelho/amarelo/verde).
export function getTaskTimeStatus(task: Task): TaskTimeStatus {
  if (task.status === "concluida") return "concluida";
  const today = todayISO();
  if (task.date < today) return "vencida";
  if (task.date === today) return "hoje";
  return "futura";
}

// Nomes dos meses em português, usados no cabeçalho do calendário.
// O índice do array corresponde ao mês 0-indexado do JS (0 = Janeiro).
export const MONTH_NAMES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

// Abreviações dos dias da semana para o cabeçalho da grade do calendário.
export const WEEKDAY_NAMES_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// Quantos dias tem um mês. Truque: o "dia 0" do mês seguinte é sempre
// o último dia do mês atual (new Date faz o "overflow" automaticamente).
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

// Preenche um número com zero à esquerda até ter 2 dígitos (5 -> "05").
// Necessário para montar datas ISO válidas (ex: "2026-06-05").
export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Monta uma data ISO "yyyy-MM-dd" a partir de ano, mês (0-indexado) e
// dia. Usada pela grade do calendário para identificar cada célula/dia.
export function makeISODate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

// Soma (ou subtrai, com n negativo) dias a uma data ISO, devolvendo outra
// data ISO. Usado pelo parser de linguagem natural do chat para resolver
// "amanhã", "depois de amanhã", etc.
export function addDays(iso: string, n: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + n);
  return makeISODate(date.getFullYear(), date.getMonth(), date.getDate());
}

// Próxima ocorrência de um dia da semana (0 = domingo ... 6 = sábado) a
// partir de hoje. Se hoje já é esse dia, considera o de hoje (não pula
// para a semana seguinte) — é o comportamento mais intuitivo quando
// alguém digita só o nome do dia no chat.
export function nextWeekdayISO(targetDow: number): string {
  const today = new Date(`${todayISO()}T00:00:00`);
  const diff = (targetDow - today.getDay() + 7) % 7;
  today.setDate(today.getDate() + diff);
  return makeISODate(today.getFullYear(), today.getMonth(), today.getDate());
}
