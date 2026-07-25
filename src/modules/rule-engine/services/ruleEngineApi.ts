import { supabase } from "@/lib/supabaseClient";
import type {
  BlockedSchedule,
  CurrentReading,
  ExecutionHistoryEntry,
  PlannerLog,
  PriorityCategory,
  RoutineTask,
  Rule,
} from "../types";

// Camada de acesso ao Supabase do Motor de Regras — isola o formato das
// tabelas (snake_case) do formato usado no módulo (camelCase), mesmo
// padrão do resto do app (ver src/data/*Api.ts).

// --- Prioridades ---

interface PriorityRow {
  id: string;
  category: string;
  position: number;
}

function rowToPriority(row: PriorityRow): PriorityCategory {
  return { id: row.id, category: row.category, position: row.position };
}

export async function fetchPriorities(): Promise<PriorityCategory[]> {
  const { data, error } = await supabase!
    .from("rule_engine_priorities")
    .select("*")
    .order("position", { ascending: true });
  if (error) throw error;
  return (data as PriorityRow[]).map(rowToPriority);
}

// Substitui a ordem inteira: mais simples que fazer diff, e a lista é
// pequena (6 categorias por padrão).
export async function saveAllPriorities(categories: string[]): Promise<PriorityCategory[]> {
  const { error: deleteError } = await supabase!
    .from("rule_engine_priorities")
    .delete()
    .not("id", "is", null);
  if (deleteError) throw deleteError;

  const payload = categories.map((category, index) => ({ category, position: index }));
  const { data, error } = await supabase!.from("rule_engine_priorities").insert(payload).select();
  if (error) throw error;
  return (data as PriorityRow[]).map(rowToPriority).sort((a, b) => a.position - b.position);
}

// --- Horários bloqueados ---

interface BlockedScheduleRow {
  id: string;
  label: string;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  mid_start: string | null;
  mid_end: string | null;
}

function rowToBlockedSchedule(row: BlockedScheduleRow): BlockedSchedule {
  return {
    id: row.id,
    label: row.label,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    midStart: row.mid_start ? row.mid_start.slice(0, 5) : null,
    midEnd: row.mid_end ? row.mid_end.slice(0, 5) : null,
  };
}

export async function fetchBlockedSchedules(): Promise<BlockedSchedule[]> {
  const { data, error } = await supabase!
    .from("rule_engine_blocked_schedules")
    .select("*")
    .order("day_of_week", { ascending: true });
  if (error) throw error;
  return (data as BlockedScheduleRow[]).map(rowToBlockedSchedule);
}

export async function createBlockedSchedule(
  schedule: Omit<BlockedSchedule, "id">
): Promise<BlockedSchedule> {
  const { data, error } = await supabase!
    .from("rule_engine_blocked_schedules")
    .insert({
      label: schedule.label,
      day_of_week: schedule.dayOfWeek,
      start_time: schedule.startTime,
      end_time: schedule.endTime,
      mid_start: schedule.midStart,
      mid_end: schedule.midEnd,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToBlockedSchedule(data as BlockedScheduleRow);
}

export async function removeBlockedSchedule(id: string): Promise<void> {
  const { error } = await supabase!.from("rule_engine_blocked_schedules").delete().eq("id", id);
  if (error) throw error;
}

// --- Regras ---

interface RuleRow {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  priority: number;
  created_at: string;
}

function rowToRule(row: RuleRow): Rule {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    enabled: row.enabled,
    priority: row.priority,
    createdAt: row.created_at,
  };
}

export async function fetchRules(): Promise<Rule[]> {
  const { data, error } = await supabase!
    .from("rule_engine_rules")
    .select("*")
    .order("priority", { ascending: false });
  if (error) throw error;
  return (data as RuleRow[]).map(rowToRule);
}

export async function createRule(rule: Omit<Rule, "id" | "createdAt">): Promise<Rule> {
  const { data, error } = await supabase!
    .from("rule_engine_rules")
    .insert({
      name: rule.name,
      description: rule.description || null,
      enabled: rule.enabled,
      priority: rule.priority,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToRule(data as RuleRow);
}

export async function updateRule(ruleId: string, rule: Omit<Rule, "id" | "createdAt">): Promise<Rule> {
  const { data, error } = await supabase!
    .from("rule_engine_rules")
    .update({
      name: rule.name,
      description: rule.description || null,
      enabled: rule.enabled,
      priority: rule.priority,
    })
    .eq("id", ruleId)
    .select()
    .single();
  if (error) throw error;
  return rowToRule(data as RuleRow);
}

export async function removeRule(id: string): Promise<void> {
  const { error } = await supabase!.from("rule_engine_rules").delete().eq("id", id);
  if (error) throw error;
}

// --- Histórico de execução (cronômetro de atividades da vida diária) ---

interface ExecutionHistoryRow {
  id: string;
  task_id: string | null;
  activity_name: string | null;
  category: string | null;
  started_at: string;
  finished_at: string | null;
  duration_seconds: number | null;
}

function rowToExecutionHistoryEntry(row: ExecutionHistoryRow): ExecutionHistoryEntry {
  return {
    id: row.id,
    taskId: row.task_id,
    activityName: row.activity_name ?? "Sem nome",
    category: row.category,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationSeconds: row.duration_seconds,
  };
}

export async function fetchExecutionHistory(): Promise<ExecutionHistoryEntry[]> {
  const { data, error } = await supabase!
    .from("rule_engine_execution_history")
    .select("*")
    .order("started_at", { ascending: false });
  if (error) throw error;
  return (data as ExecutionHistoryRow[]).map(rowToExecutionHistoryEntry);
}

export async function createExecutionHistoryEntry(
  entry: Omit<ExecutionHistoryEntry, "id">
): Promise<ExecutionHistoryEntry> {
  const { data, error } = await supabase!
    .from("rule_engine_execution_history")
    .insert({
      task_id: entry.taskId,
      activity_name: entry.activityName,
      category: entry.category,
      started_at: entry.startedAt,
      finished_at: entry.finishedAt,
      duration_seconds: entry.durationSeconds,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToExecutionHistoryEntry(data as ExecutionHistoryRow);
}

export async function updateExecutionHistoryEntry(
  id: string,
  entry: Omit<ExecutionHistoryEntry, "id">
): Promise<ExecutionHistoryEntry> {
  const { data, error } = await supabase!
    .from("rule_engine_execution_history")
    .update({
      activity_name: entry.activityName,
      category: entry.category,
      started_at: entry.startedAt,
      finished_at: entry.finishedAt,
      duration_seconds: entry.durationSeconds,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return rowToExecutionHistoryEntry(data as ExecutionHistoryRow);
}

export async function removeExecutionHistoryEntry(id: string): Promise<void> {
  const { error } = await supabase!.from("rule_engine_execution_history").delete().eq("id", id);
  if (error) throw error;
}

// --- Tarefas de rotina (casa, saúde, relacionamento etc., sem data fixa) ---

interface RoutineTaskRow {
  id: string;
  name: string;
  category: string;
  interval_days: number;
  priority: number;
  estimated_minutes: number | null;
  enabled: boolean;
}

function rowToRoutineTask(row: RoutineTaskRow): RoutineTask {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    intervalDays: row.interval_days,
    priority: row.priority,
    estimatedMinutes: row.estimated_minutes,
    enabled: row.enabled,
  };
}

export async function fetchRoutineTasks(): Promise<RoutineTask[]> {
  const { data, error } = await supabase!
    .from("rule_engine_routine_tasks")
    .select("*")
    .order("category", { ascending: true });
  if (error) throw error;
  return (data as RoutineTaskRow[]).map(rowToRoutineTask);
}

export async function createRoutineTask(task: Omit<RoutineTask, "id">): Promise<RoutineTask> {
  const { data, error } = await supabase!
    .from("rule_engine_routine_tasks")
    .insert({
      name: task.name,
      category: task.category,
      interval_days: task.intervalDays,
      priority: task.priority,
      estimated_minutes: task.estimatedMinutes,
      enabled: task.enabled,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToRoutineTask(data as RoutineTaskRow);
}

export async function updateRoutineTask(id: string, task: Omit<RoutineTask, "id">): Promise<RoutineTask> {
  const { data, error } = await supabase!
    .from("rule_engine_routine_tasks")
    .update({
      name: task.name,
      category: task.category,
      interval_days: task.intervalDays,
      priority: task.priority,
      estimated_minutes: task.estimatedMinutes,
      enabled: task.enabled,
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return rowToRoutineTask(data as RoutineTaskRow);
}

export async function removeRoutineTask(id: string): Promise<void> {
  const { error } = await supabase!.from("rule_engine_routine_tasks").delete().eq("id", id);
  if (error) throw error;
}

// --- Histórico de decisões do motor ---
// (a tabela rule_engine_planner_logs já existe no schema, só faltava a
// aplicação escrever/ler nela)

interface PlannerLogRow {
  id: string;
  decision: string;
  reason: string;
  created_at: string;
}

function rowToPlannerLog(row: PlannerLogRow): PlannerLog {
  return { id: row.id, decision: row.decision, reason: row.reason, createdAt: row.created_at };
}

export async function fetchPlannerLogs(): Promise<PlannerLog[]> {
  const { data, error } = await supabase!
    .from("rule_engine_planner_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data as PlannerLogRow[]).map(rowToPlannerLog);
}

export async function createPlannerLog(decision: string, reason: string): Promise<PlannerLog> {
  const { data, error } = await supabase!
    .from("rule_engine_planner_logs")
    .insert({ decision, reason })
    .select()
    .single();
  if (error) throw error;
  return rowToPlannerLog(data as PlannerLogRow);
}

export async function removePlannerLog(id: string): Promise<void> {
  const { error } = await supabase!.from("rule_engine_planner_logs").delete().eq("id", id);
  if (error) throw error;
}

// --- Leitura atual (fallback de "Iniciar Dia"/"Off Work") ---

interface CurrentReadingRow {
  id: string;
  theme: string;
  link: string;
  updated_at: string;
}

function rowToCurrentReading(row: CurrentReadingRow): CurrentReading {
  return { id: row.id, theme: row.theme, link: row.link, updatedAt: row.updated_at };
}

export async function fetchCurrentReading(): Promise<CurrentReading | null> {
  const { data, error } = await supabase!
    .from("rule_engine_current_reading")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  const rows = data as CurrentReadingRow[];
  return rows.length > 0 ? rowToCurrentReading(rows[0]) : null;
}

// Registro único: apaga qualquer leitura anterior antes de salvar a
// nova, pra nunca acumular mais de uma "leitura atual" na tabela.
export async function saveCurrentReading(theme: string, link: string): Promise<CurrentReading> {
  const { error: deleteError } = await supabase!.from("rule_engine_current_reading").delete().not("id", "is", null);
  if (deleteError) throw deleteError;

  const { data, error } = await supabase!
    .from("rule_engine_current_reading")
    .insert({ theme, link })
    .select()
    .single();
  if (error) throw error;
  return rowToCurrentReading(data as CurrentReadingRow);
}
