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
