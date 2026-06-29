import { supabase } from "@/lib/supabaseClient";
import type { CalendarGroup, Task } from "@/types";

// Esta camada isola o "formato do banco" (colunas em snake_case, como
// `calendar_id`) do "formato do app" (campos em camelCase, como
// `calendarId`, definidos em src/types/index.ts). Assim, o resto do app
// (componentes, páginas, AgendaContext) nunca precisa saber como as
// tabelas do Supabase são nomeadas.

// Formato de uma linha da tabela "calendars" no Postgres.
interface CalendarRow {
  id: string;
  name: string;
  icon: string;
  color: string;
  start_date: string | null;
  end_date: string | null;
  observation: string | null;
  created_at: string;
}

// Formato de uma linha da tabela "tasks" no Postgres.
interface TaskRow {
  id: string;
  calendar_id: string;
  title: string;
  description: string | null;
  date: string;
  time: string | null;
  priority: Task["priority"];
  observation: string | null;
  status: Task["status"];
}

// Converte uma linha do banco (snake_case) para o tipo usado no app
// (camelCase), trocando `null` por `undefined` nos campos opcionais.
function rowToCalendar(row: CalendarRow): CalendarGroup {
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    startDate: row.start_date ?? undefined,
    endDate: row.end_date ?? undefined,
    observation: row.observation ?? undefined,
    createdAt: row.created_at,
  };
}

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    calendarId: row.calendar_id,
    title: row.title,
    description: row.description ?? undefined,
    date: row.date,
    time: row.time ?? undefined,
    priority: row.priority,
    observation: row.observation ?? undefined,
    status: row.status,
  };
}

// Busca todos os calendários do usuário, mais recentes primeiro.
export async function fetchCalendars(): Promise<CalendarGroup[]> {
  const { data, error } = await supabase!
    .from("calendars")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as CalendarRow[]).map(rowToCalendar);
}

// Busca todas as tarefas de todos os calendários (o AgendaContext filtra
// por calendário em memória via getTasksByCalendar).
export async function fetchTasks(): Promise<Task[]> {
  const { data, error } = await supabase!
    .from("tasks")
    .select("*")
    .order("date", { ascending: true });
  if (error) throw error;
  return (data as TaskRow[]).map(rowToTask);
}

// Insere um novo calendário e devolve a linha criada (com o id gerado
// pelo banco) já convertida para o formato do app.
export async function createCalendar(
  calendar: Omit<CalendarGroup, "id" | "createdAt">
): Promise<CalendarGroup> {
  const { data, error } = await supabase!
    .from("calendars")
    .insert({
      name: calendar.name,
      icon: calendar.icon,
      color: calendar.color,
      start_date: calendar.startDate ?? null,
      end_date: calendar.endDate ?? null,
      observation: calendar.observation ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToCalendar(data as CalendarRow);
}

// Insere uma nova tarefa e devolve a linha criada.
export async function createTask(
  task: Omit<Task, "id" | "status"> & { status?: Task["status"] }
): Promise<Task> {
  const { data, error } = await supabase!
    .from("tasks")
    .insert({
      calendar_id: task.calendarId,
      title: task.title,
      description: task.description ?? null,
      date: task.date,
      time: task.time ?? null,
      priority: task.priority,
      observation: task.observation ?? null,
      status: task.status ?? "pendente",
    })
    .select()
    .single();
  if (error) throw error;
  return rowToTask(data as TaskRow);
}

// Atualiza o status (pendente/concluída) de uma tarefa existente.
export async function updateTaskStatus(taskId: string, status: Task["status"]) {
  const { error } = await supabase!.from("tasks").update({ status }).eq("id", taskId);
  if (error) throw error;
}

// Atualiza os campos editáveis de uma tarefa existente (tudo, exceto
// calendário e status, que têm seus próprios fluxos).
export async function updateTask(
  taskId: string,
  fields: Partial<Pick<Task, "title" | "description" | "date" | "time" | "priority" | "observation">>
) {
  const payload: Record<string, unknown> = {};
  if (fields.title !== undefined) payload.title = fields.title;
  if (fields.description !== undefined) payload.description = fields.description ?? null;
  if (fields.date !== undefined) payload.date = fields.date;
  if (fields.time !== undefined) payload.time = fields.time ?? null;
  if (fields.priority !== undefined) payload.priority = fields.priority;
  if (fields.observation !== undefined) payload.observation = fields.observation ?? null;

  const { error } = await supabase!.from("tasks").update(payload).eq("id", taskId);
  if (error) throw error;
}

// Remove uma tarefa pelo id.
export async function removeTask(taskId: string) {
  const { error } = await supabase!.from("tasks").delete().eq("id", taskId);
  if (error) throw error;
}

// Remove um calendário. As tarefas vinculadas são removidas
// automaticamente pelo banco (ON DELETE CASCADE, ver supabase/schema.sql).
export async function removeCalendar(calendarId: string) {
  const { error } = await supabase!.from("calendars").delete().eq("id", calendarId);
  if (error) throw error;
}
