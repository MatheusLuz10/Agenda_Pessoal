import type { OperationActivity, OperationSettings, PunchRecord } from "@/types";
import { makeISODate } from "@/lib/date";

// Peso de cada dia da semana no cálculo de "dias ponderados" (Card 1).
// getDay(): 0 = domingo ... 6 = sábado.
const WEEKDAY_WEIGHT: Record<number, number> = {
  0: 0.15, // domingo
  1: 1, // segunda
  2: 1, // terça
  3: 1, // quarta
  4: 1, // quinta
  5: 1, // sexta
  6: 0.85, // sábado
};

export function getDayWeight(iso: string): number {
  return WEEKDAY_WEIGHT[new Date(`${iso}T00:00:00`).getDay()];
}

// A empresa fecha 3 ciclos de produção por mês, em janelas fixas: 1 a 10,
// 11 a 20, e 21 até o último dia do mês (28/29/30/31, dependendo do mês).
// Devolve a janela [start, end] (ISO) que contém o dia informado.
export function getCycleForDate(anchor: Date = new Date()): { start: string; end: string } {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const day = anchor.getDate();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();

  const [startDay, endDay] = day <= 10 ? [1, 10] : day <= 20 ? [11, 20] : [21, lastDayOfMonth];

  return {
    start: makeISODate(year, month, startDay),
    end: makeISODate(year, month, endDay),
  };
}

// "Ciclo atual" = a janela fixa (ver getCycleForDate) que contém hoje.
export function getCurrentCycleRange(anchor: Date = new Date()): { start: string; end: string } {
  return getCycleForDate(anchor);
}

// Ciclo imediatamente anterior ao informado (pelo início dele): 11-20 ->
// 1-10 do mesmo mês; 21-fim -> 11-20 do mesmo mês; 1-10 -> 21-fim do mês
// anterior (cruzando a virada de ano quando for janeiro).
export function getPreviousCycleRange(currentCycleStart: string): { start: string; end: string } {
  const [yearStr, monthStr, dayStr] = currentCycleStart.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1; // getCycleForDate usa mês 0-indexado
  const day = Number(dayStr);

  if (day === 11) {
    return { start: makeISODate(year, month, 1), end: makeISODate(year, month, 10) };
  }
  if (day === 21) {
    return { start: makeISODate(year, month, 11), end: makeISODate(year, month, 20) };
  }

  // Ciclo atual é 1-10 -> anterior é 21-fim do mês anterior. new Date com
  // mês -1 já rola pra dezembro do ano anterior automaticamente quando
  // `month` é janeiro (0).
  const prevMonthAnchor = new Date(year, month - 1, 1);
  const prevMonthLastDay = new Date(prevMonthAnchor.getFullYear(), prevMonthAnchor.getMonth() + 1, 0).getDate();
  return {
    start: makeISODate(prevMonthAnchor.getFullYear(), prevMonthAnchor.getMonth(), 21),
    end: makeISODate(prevMonthAnchor.getFullYear(), prevMonthAnchor.getMonth(), prevMonthLastDay),
  };
}

export function isWithinRange(iso: string, start: string, end: string): boolean {
  return iso >= start && iso <= end;
}

// Soma o peso de TODOS os dias do ciclo (start a end, inclusive), não só
// os dias em que houve atividade. É essa soma fixa que serve de
// denominador da média diária — assim a média (e a categoria/prêmio que
// dependem dela) só "fecha" quando o ritmo se sustenta ao longo do ciclo
// inteiro, em vez de disparar logo no primeiro dia trabalhado.
// Ex.: ciclo de 11 a 20 (10 dias, sendo 8 dias úteis + 1 sábado + 1
// domingo) = 8×1,0 + 0,85 + 0,15 = 9,0.
export function computeCycleWeightedDays(cycleStart: string, cycleEnd: string): number {
  let total = 0;
  for (let iso = cycleStart; iso <= cycleEnd; ) {
    total += getDayWeight(iso);
    const next = new Date(`${iso}T00:00:00`);
    next.setDate(next.getDate() + 1);
    iso = makeISODate(next.getFullYear(), next.getMonth(), next.getDate());
  }
  return total;
}

// --- Card 1: Resumo do ciclo ---

export interface CycleSummary {
  daysWorked: number;
  weightedDays: number;
}

// "Dias trabalhados" = dias distintos, dentro do ciclo, com pelo menos uma
// atividade (BA ou BD) lançada (informativo). "Dias ponderados" é o peso
// do ciclo INTEIRO (ver computeCycleWeightedDays), independente de quais
// dias já foram trabalhados.
export function computeCycleSummary(
  activities: OperationActivity[],
  cycleStart: string,
  cycleEnd: string
): CycleSummary {
  const workedDates = new Set(activities.map((a) => a.date));
  const weightedDays = computeCycleWeightedDays(cycleStart, cycleEnd);
  return { daysWorked: workedDates.size, weightedDays };
}

// --- Card 2: Produção ---

export interface ProductionSummary {
  ba: number;
  bd: number;
  total: number;
  baPercent: number;
  bdPercent: number;
  average: number;
}

export function computeProductionSummary(
  activities: OperationActivity[],
  weightedDays: number
): ProductionSummary {
  const ba = activities.filter((a) => a.type === "BA").reduce((sum, a) => sum + a.quantity, 0);
  const bd = activities.filter((a) => a.type === "BD").reduce((sum, a) => sum + a.quantity, 0);
  const total = ba + bd;

  return {
    ba,
    bd,
    total,
    baPercent: total > 0 ? (ba / total) * 100 : 0,
    bdPercent: total > 0 ? (bd / total) * 100 : 0,
    average: weightedDays > 0 ? total / weightedDays : 0,
  };
}

// --- Card 3: Categoria ---

export type TechnicianCategory = "instalador" | "reparador" | "mix" | "sem_categoria";

export const CATEGORY_LABEL: Record<TechnicianCategory, string> = {
  instalador: "Instalador",
  reparador: "Reparador",
  mix: "Mix",
  sem_categoria: "Sem categoria",
};

// Regras da empresa (ver especificação): BA/BD são mutuamente exclusivos
// em relação a Instalador x Reparador (BA% + BD% = 100), então a ordem de
// checagem não gera ambiguidade entre essas duas. "Mix" só é possível
// quando nenhuma das duas é atingida.
export function computeCategory(
  production: ProductionSummary,
  effectivenessPercent: number
): TechnicianCategory {
  if (production.baPercent >= 69 && production.average >= 3) return "instalador";
  if (production.bdPercent >= 70 && production.average >= 4 && effectivenessPercent > 80) return "reparador";
  if (production.baPercent < 69 && production.bdPercent < 70 && production.average >= 3.5) return "mix";
  return "sem_categoria";
}

// --- Card 4: Prêmio estimado ---

// Valor fixo por ciclo quando alguma categoria é atingida (ver conversa
// com o técnico — não há tabela oficial cadastrada ainda).
export const FIXED_PRIZE_AMOUNT = 400;

export function computePrizeAmount(category: TechnicianCategory): number {
  return category === "sem_categoria" ? 0 : FIXED_PRIZE_AMOUNT;
}

// --- Card 5: Ponto e horas extras ---

function parseHM(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

// Jornada padrão da empresa (confirmada pelo técnico): qualquer minuto
// trabalhado FORA dessas janelas é hora extra — seja antes de entrar,
// durante o horário de almoço, ou depois da saída.
// Seg-sex: 08:00-12:00 e 13:30-17:30 (8h, com 1h30 de almoço no meio).
const WEEKDAY_STANDARD_WINDOWS: [number, number][] = [
  [8 * 60, 12 * 60],
  [13 * 60 + 30, 17 * 60 + 30],
];
// Sábado: meio período, só 08:00-12:00.
const SATURDAY_STANDARD_WINDOWS: [number, number][] = [[8 * 60, 12 * 60]];

// Minutos de overlap entre dois intervalos [aStart,aEnd) e [bStart,bEnd).
function overlapMinutes(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

export interface PunchDayResult {
  workedMinutes: number;
  overtime50Minutes: number;
  overtime100Minutes: number;
}

// Calcula, para um único registro de ponto, quanto foi trabalhado e como
// se divide entre hora normal e extra: soma o que caiu dentro da janela
// padrão do dia (seg-sex, sábado ou nenhuma no domingo) e trata o resto
// do tempo trabalhado como excedente. Domingo inteiro é hora extra 100%
// (não há janela "normal"); excedente em qualquer outro dia é 50%.
export function computePunchDay(punch: PunchRecord): PunchDayResult {
  const clockIn = parseHM(punch.clockIn);
  const lunchStart = parseHM(punch.lunchStart);
  const lunchEnd = parseHM(punch.lunchEnd);
  const clockOut = parseHM(punch.clockOut);
  const worked = lunchStart - clockIn + (clockOut - lunchEnd);

  const dayOfWeek = new Date(`${punch.date}T00:00:00`).getDay();

  if (dayOfWeek === 0) {
    return { workedMinutes: worked, overtime50Minutes: 0, overtime100Minutes: worked };
  }

  const standardWindows = dayOfWeek === 6 ? SATURDAY_STANDARD_WINDOWS : WEEKDAY_STANDARD_WINDOWS;
  let normalMinutes = 0;
  for (const [windowStart, windowEnd] of standardWindows) {
    normalMinutes += overlapMinutes(clockIn, lunchStart, windowStart, windowEnd);
    normalMinutes += overlapMinutes(lunchEnd, clockOut, windowStart, windowEnd);
  }

  return {
    workedMinutes: worked,
    overtime50Minutes: Math.max(0, worked - normalMinutes),
    overtime100Minutes: 0,
  };
}

export interface OvertimeSummary {
  overtime50Minutes: number;
  overtime100Minutes: number;
  overtime50Amount: number;
  overtime100Amount: number;
  dsrAmount: number;
  totalAmount: number;
  hourlyRate: number;
}

// Divisor mensal de horas "clássico" usado em folhas de pagamento CLT:
// jornada semanal x 5 (ex: 44h semanais -> 220h/mês).
function computeHourlyRate(settings: OperationSettings): number {
  const monthlyHours = settings.weeklyHours * 5;
  return monthlyHours > 0 ? settings.baseSalary / monthlyHours : 0;
}

// DSR sobre horas extras: fórmula padrão de folha de pagamento —
// (total em R$ das horas extras do ciclo ÷ dias úteis do ciclo) x domingos
// do ciclo. Não há calendário de feriados no app, então feriados não
// entram nessa conta (premissa a validar).
export function computeOvertimeSummary(
  punches: PunchRecord[],
  settings: OperationSettings,
  cycleStart: string,
  cycleEnd: string
): OvertimeSummary {
  const hourlyRate = computeHourlyRate(settings);

  let overtime50Minutes = 0;
  let overtime100Minutes = 0;
  for (const punch of punches) {
    const day = computePunchDay(punch);
    overtime50Minutes += day.overtime50Minutes;
    overtime100Minutes += day.overtime100Minutes;
  }

  const overtime50Amount = (overtime50Minutes / 60) * hourlyRate * 1.5;
  const overtime100Amount = (overtime100Minutes / 60) * hourlyRate * 2;

  let businessDays = 0;
  let sundays = 0;
  for (let iso = cycleStart; iso <= cycleEnd; ) {
    const dow = new Date(`${iso}T00:00:00`).getDay();
    if (dow === 0) sundays += 1;
    else businessDays += 1;

    const next = new Date(`${iso}T00:00:00`);
    next.setDate(next.getDate() + 1);
    iso = makeISODate(next.getFullYear(), next.getMonth(), next.getDate());
  }

  const overtimeTotalAmount = overtime50Amount + overtime100Amount;
  const dsrAmount = businessDays > 0 ? (overtimeTotalAmount / businessDays) * sundays : 0;

  return {
    overtime50Minutes,
    overtime100Minutes,
    overtime50Amount,
    overtime100Amount,
    dsrAmount,
    totalAmount: overtimeTotalAmount + dsrAmount,
    hourlyRate,
  };
}

export function formatMinutesAsHM(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const abs = Math.round(Math.abs(minutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// --- Card 7: Resumo financeiro ---

export interface FinancialSummary {
  baseSalary: number;
  hazardPay: number;
  overtime50Amount: number;
  overtime100Amount: number;
  dsrAmount: number;
  prizeAmount: number;
  totalGross: number;
}

export function computeFinancialSummary(
  settings: OperationSettings,
  overtime: OvertimeSummary,
  prizeAmount: number
): FinancialSummary {
  const hazardPay = settings.baseSalary * (settings.hazardPayPercent / 100);
  const totalGross =
    settings.baseSalary + hazardPay + overtime.overtime50Amount + overtime.overtime100Amount + overtime.dsrAmount + prizeAmount;

  return {
    baseSalary: settings.baseSalary,
    hazardPay,
    overtime50Amount: overtime.overtime50Amount,
    overtime100Amount: overtime.overtime100Amount,
    dsrAmount: overtime.dsrAmount,
    prizeAmount,
    totalGross,
  };
}
