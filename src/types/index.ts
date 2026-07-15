// Tipos compartilhados do app. Ficam num arquivo só para que qualquer
// componente, página ou contexto possa importar a mesma "fonte da verdade"
// sobre o formato dos dados (evita duplicar/diverguir definições).

export type Priority = "baixa" | "media" | "alta";

export type TaskStatus = "pendente" | "concluida";

// Uma tarefa/atividade dentro de um calendário específico.
export interface Task {
  id: string;
  calendarId: string; // FK lógica: a qual calendário esta tarefa pertence
  title: string;
  description?: string;
  date: string; // ISO date string (yyyy-MM-dd)
  time?: string; // HH:mm
  priority: Priority;
  observation?: string;
  status: TaskStatus;
}

// Um calendário independente (ex: "Faculdade", "Pets", "Contas").
// Cada um agrupa suas próprias tarefas via Task.calendarId.
export interface CalendarGroup {
  id: string;
  name: string;
  icon: string; // emoji exibido como ícone do calendário
  color: string; // token de cor (ex: "blue", "rose") usado no seletor de cor
  startDate?: string;
  endDate?: string;
  observation?: string;
  createdAt: string;
}

// --- Controle financeiro ("Conta") ---

export type TransactionType = "entrada" | "saida";

export type RecurrenceFrequency = "mensal" | "semanal" | "anual";

export const TRANSACTION_CATEGORIES = [
  "Salário",
  "Hora Extra",
  "Alimentação",
  "Moradia",
  "Educação",
  "Saúde",
  "Transporte",
  "Lazer",
  "Investimentos",
  "Outros",
] as const;

export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number];

// Um lançamento financeiro (entrada ou saída). Independente dos
// calendários de tarefas, mas aparece junto na visão geral da agenda
// (ver markedDates em HomePage) porque também tem uma data associada.
export interface Transaction {
  id: string;
  type: TransactionType;
  description: string;
  amount: number; // sempre positivo; o sinal é dado por `type`
  category: TransactionCategory;
  date: string; // ISO date string (yyyy-MM-dd)
  observation?: string;
  recurrent: boolean;
  recurrenceFrequency?: RecurrenceFrequency; // presente só quando recurrent === true
  createdAt: string;
}

// Uma meta de economia (ex: "Notebook novo", R$ 2.000 guardados de R$ 5.000).
export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  createdAt: string;
}

// --- Meu trabalho (equipamentos, manutenção e OSs) ---

export type EquipmentCategory = "manutencao" | "epis" | "conectores";

export type EquipmentCondition = "Bom" | "Médio" | "Defeituoso";

// Um item de manutenção do carro, EPI ou conector/ferramenta de fusão.
export interface EquipmentItem {
  id: string;
  name: string;
  category: EquipmentCategory;
  condition: EquipmentCondition;
  observation: string;
  createdAt: string;
}

export type ServiceOrderStatus = "pendente" | "em_andamento" | "concluida";

// Uma OS (Ordem de Serviço): o atendimento feito num cliente/local em
// uma data específica.
export interface ServiceOrder {
  id: string;
  client: string;
  description: string;
  date: string; // ISO date string (yyyy-MM-dd)
  status: ServiceOrderStatus;
  observation: string;
  createdAt: string;
}

// --- Operação (produtividade, ciclo, prêmio e ponto) ---

export type ActivityType = "BA" | "BD";

// Um registro de atividade (instalação ou reparo) feito num dia específico.
// A quantidade permite lançar várias atividades do mesmo tipo/dia de uma vez.
export interface OperationActivity {
  id: string;
  type: ActivityType;
  date: string; // ISO date string (yyyy-MM-dd)
  quantity: number;
  createdAt: string;
}

// Um registro de ponto (entrada, almoço, saída) de um dia específico,
// digitado manualmente ou extraído por OCR de um print do app de ponto.
export interface PunchRecord {
  id: string;
  date: string; // ISO date string (yyyy-MM-dd)
  clockIn: string; // HH:mm
  lunchStart: string; // HH:mm
  lunchEnd: string; // HH:mm
  clockOut: string; // HH:mm
  createdAt: string;
}

// Ajustes manuais do Card "Resumo financeiro", um registro por ciclo
// (identificado pela data de início do ciclo). Cada campo `null` significa
// "usar o valor calculado automaticamente"; um número substitui o cálculo
// até o ajuste ser removido.
export interface FinancialOverrides {
  baseSalary: number | null;
  hazardPay: number | null;
  overtime50Amount: number | null;
  overtime100Amount: number | null;
  dsrAmount: number | null;
  prizeAmount: number | null;
}

// Configurações usadas nos cálculos da aba Operação. Linha única
// (não há multiusuário nesta base — ver demais tabelas do app).
export interface OperationSettings {
  // Não usados mais pra calcular o ciclo (ver getCurrentCycleRange em
  // lib/operation.ts: agora são 3 janelas fixas por mês — 1-10, 11-20,
  // 21-fim). Mantidos só pra não quebrar linhas já salvas no Supabase.
  cycleStartDay: number;
  cycleEndDay: number;
  baseSalary: number; // salário base (R$)
  hazardPayPercent: number; // periculosidade (%)
  weeklyHours: number; // jornada semanal contratada, usada p/ valor da hora
  effectivenessPercent: number; // efetividade (%), informada manualmente
}
