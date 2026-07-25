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
  dayOfWeek: number | null; // 0 = domingo .. 6 = sábado; null = todos os dias
  startTime: string; // HH:mm — início
  endTime: string; // HH:mm — fim
  // Pausa no meio do bloqueio (ex: almoço no meio do horário de
  // trabalho): o trecho midStart→midEnd fica livre, e o bloqueio real
  // vira dois trechos, startTime→midStart e midEnd→endTime. null/null
  // quando não há pausa (bloqueio contínuo, como antes).
  midStart: string | null; // HH:mm
  midEnd: string | null; // HH:mm
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
  // Duração estimada em minutos. null = ainda sem cronograma definido —
  // a tarefa não fica "ativa" (não aparece em "Iniciar Dia") até ter um
  // valor aqui, porque sem isso o resumo do dia não sabe quanto tempo
  // ela vai ocupar.
  estimatedMinutes: number | null;
  enabled: boolean;
}

// "Leitura atual": tema/título + link externo (ex: um arquivo do
// usuário hospedado no Mega, ou qualquer outro link) — sugestão de
// fallback em "Iniciar Dia"/"Off Work" quando nenhuma tarefa cabe no
// tempo livre restante. Registro único (singleton): salvar sempre
// substitui o anterior.
export interface CurrentReading {
  id: string;
  theme: string;
  link: string;
  updatedAt: string;
}

export type DailyPlanStatus = "nao_iniciado" | "em_andamento" | "concluido";

export interface DailyPlan {
  id: string;
  date: string; // yyyy-MM-dd
  status: DailyPlanStatus;
  currentTaskId: string | null;
  generatedAt: string;
}
