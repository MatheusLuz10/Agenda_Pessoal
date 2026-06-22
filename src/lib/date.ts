import type { Task } from "@/types";

// Fuso horário de Brasília (UTC-3, sem horário de verão desde 2019).
// Fixamos o app inteiro nesse fuso, em vez de usar o fuso do
// navegador/dispositivo, para que "hoje" seja sempre o dia certo no
// Brasil, mesmo que o aparelho esteja com o relógio/fuso mal configurado.
const BRASILIA_TIMEZONE = "America/Sao_Paulo";

// Devolve o instante atual "redesenhado" como se fosse horário de
// Brasília: ao chamar .getFullYear()/.getMonth()/.getDate()/.getDay()
// no resultado, os valores já saem corretos para Brasília, mesmo que o
// dispositivo esteja em outro fuso. Funciona convertendo a hora atual
// para uma string no fuso de Brasília e reanalisando essa string como
// se fosse hora local — um truque comum em JavaScript puro (sem
// biblioteca de datas) para "fixar" um fuso horário específico.
export function nowInBrasilia(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: BRASILIA_TIMEZONE }));
}

// Retorna a data de hoje (em Brasília) no formato ISO "yyyy-MM-dd", que é
// o mesmo formato usado para armazenar `task.date`. Datas em formato ISO
// podem ser comparadas com os operadores < > == diretamente, como
// strings, sem precisar converter para objetos Date.
//
// Importante: NÃO use `new Date().toISOString().slice(0, 10)` para isso
// — toISOString() converte para UTC, e Brasília está atrás de UTC, então
// nas últimas horas de cada dia (a partir das ~21h) o resultado seria a
// data de AMANHÃ. Usar nowInBrasilia() evita esse problema.
export function todayISO(): string {
  const today = nowInBrasilia();
  return makeISODate(today.getFullYear(), today.getMonth(), today.getDate());
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
