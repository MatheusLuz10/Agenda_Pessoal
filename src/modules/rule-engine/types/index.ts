// Tipos do módulo Motor de Regras. Isolados do resto do app (ver
// src/types/index.ts para os tipos "principais") — nada aqui é
// importado fora de src/modules/rule-engine.

export const DEFAULT_PRIORITY_CATEGORIES = [
  "Desenvolvimento pessoal",
  "Saúde",
  "Relacionamento",
  "Casa",
  "Pets",
  "Financeiro",
] as const;

export interface PriorityCategory {
  id: string;
  category: string;
  position: number;
}

export interface BlockedSchedule {
  id: string;
  label: string;
  dayOfWeek: number; // 0 = domingo .. 6 = sábado
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

export interface Rule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  priority: number;
  createdAt: string;
}

export interface PlannerLog {
  id: string;
  decision: string;
  reason: string;
  createdAt: string;
}

export interface ExecutionHistoryEntry {
  id: string;
  taskId: string | null;
  activityName: string;
  category: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationSeconds: number | null;
}

// Tarefa de rotina (casa, saúde, relacionamento etc.) sem data fixa:
// "faça isso a cada intervalDays dias". "Iniciar Dia" cruza isso com
// ExecutionHistoryEntry (taskId = id desta rotina) pra saber se venceu.
export interface RoutineTask {
  id: string;
  name: string;
  category: string;
  intervalDays: number;
  priority: number;
  enabled: boolean;
}

export type DailyPlanStatus = "nao_iniciado" | "em_andamento" | "concluido";

export interface DailyPlan {
  id: string;
  date: string; // yyyy-MM-dd
  status: DailyPlanStatus;
  currentTaskId: string | null;
  generatedAt: string;
}
