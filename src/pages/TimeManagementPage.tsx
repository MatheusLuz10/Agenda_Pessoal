import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  History,
  MoreVertical,
  Pencil,
  Play,
  Plus,
  Square,
  Timer,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAgenda } from "@/contexts/AgendaContext";
import { nowInBrasilia, todayISO } from "@/lib/date";
import { useBlockedSchedules } from "@/modules/rule-engine/hooks/useBlockedSchedules";
import { useExecutionHistory } from "@/modules/rule-engine/hooks/useExecutionHistory";
import { usePriorities } from "@/modules/rule-engine/hooks/usePriorities";
import { useRoutineTasks } from "@/modules/rule-engine/hooks/useRoutineTasks";
import { useRules } from "@/modules/rule-engine/hooks/useRules";
import type { BlockedSchedule, ExecutionHistoryEntry, RoutineTask, Rule } from "@/modules/rule-engine/types";
import type { Task } from "@/types";

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// Tarefas atrasadas vêm primeiro, depois ordena por prioridade (alta >
// média > baixa) e por horário (com horário antes de sem horário).
function priorityWeight(priority: Task["priority"]): number {
  return priority === "alta" ? 0 : priority === "media" ? 1 : 2;
}

// Um item da fila do dia: tanto uma tarefa de Calendários (com data)
// quanto uma tarefa de rotina que venceu (sem data, definida pelo
// intervalo de dias). "Iniciar Dia" só mostra um de cada vez.
interface QueueItem {
  id: string;
  title: string;
  source: "task" | "routine";
  category: string | null;
  overdue: boolean;
  time?: string;
  priorityWeight: number;
}

// Cruza cada tarefa de rotina com o histórico de execução (última vez
// que foi concluída) pra decidir se já venceu (dias desde a última
// execução >= intervalo configurado). Nunca feita = sempre vencida.
function buildDailyQueue(
  tasks: Task[],
  routineTasks: RoutineTask[],
  history: ExecutionHistoryEntry[],
  categories: string[]
): QueueItem[] {
  const today = todayISO();
  const categoryRank = (category: string | null): number => {
    if (!category) return categories.length;
    const index = categories.indexOf(category);
    return index === -1 ? categories.length : index;
  };

  const taskItems: QueueItem[] = tasks
    .filter((task) => task.status !== "concluida" && task.date <= today)
    .map((task) => ({
      id: task.id,
      title: task.title,
      source: "task" as const,
      category: null,
      overdue: task.date < today,
      time: task.time,
      priorityWeight: priorityWeight(task.priority),
    }));

  const lastDoneAt = new Map<string, number>();
  history.forEach((entry) => {
    if (!entry.taskId || !entry.finishedAt) return;
    const finishedMs = new Date(entry.finishedAt).getTime();
    const existing = lastDoneAt.get(entry.taskId);
    if (!existing || finishedMs > existing) lastDoneAt.set(entry.taskId, finishedMs);
  });

  const nowMs = nowInBrasilia().getTime();
  const routineItems: QueueItem[] = routineTasks
    .filter((routine) => routine.enabled)
    .map((routine) => {
      const lastDone = lastDoneAt.get(routine.id);
      const daysSince = lastDone ? (nowMs - lastDone) / 86_400_000 : Infinity;
      return { routine, daysSince };
    })
    .filter(({ routine, daysSince }) => daysSince >= routine.intervalDays)
    .map(({ routine, daysSince }) => ({
      id: routine.id,
      title: routine.name,
      source: "routine" as const,
      category: routine.category,
      overdue: daysSince !== Infinity && daysSince > routine.intervalDays * 1.5,
      priorityWeight: -routine.priority,
    }));

  return [...taskItems, ...routineItems].sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    const rankDiff = categoryRank(a.category) - categoryRank(b.category);
    if (rankDiff !== 0) return rankDiff;
    if (a.priorityWeight !== b.priorityWeight) return a.priorityWeight - b.priorityWeight;
    return (a.time ?? "99:99").localeCompare(b.time ?? "99:99");
  });
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

// Recalcula a duração a partir de um HH:mm digitado, mantendo o dia
// original do registro (só a hora/minuto muda no editor).
function withTime(base: Date, timeValue: string): Date {
  const [hours, minutes] = timeValue.split(":").map(Number);
  const next = new Date(base);
  next.setHours(hours || 0, minutes || 0, 0, 0);
  return next;
}

// Tela "/gestao-de-tempo" — reúne o cronômetro de atividades, o Motor
// de Regras (Prioridades, Horários bloqueados, Regras, Rotina da casa)
// e o "Iniciar Dia" (motor de decisão) numa aba só: peças do mesmo
// recurso, uma alimenta a outra — separá-las só criava confusão.
export function TimeManagementPage() {
  const [activityName, setActivityName] = useState("");
  const [activityCategory, setActivityCategory] = useState("");
  const [callStart, setCallStart] = useState<Date | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [editingEntry, setEditingEntry] = useState<ExecutionHistoryEntry | null>(null);

  const { categories, reorder } = usePriorities();
  const { schedules, addSchedule, deleteSchedule } = useBlockedSchedules();
  const { rules, addRule, editRule, deleteRule } = useRules();
  const { routineTasks, addRoutineTask, editRoutineTask, deleteRoutineTask } = useRoutineTasks();
  const { entries, addEntry, editEntry, deleteEntry } = useExecutionHistory();
  const { tasks, toggleTaskStatus } = useAgenda();
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [isRoutineDialogOpen, setIsRoutineDialogOpen] = useState(false);
  const [editingRoutine, setEditingRoutine] = useState<RoutineTask | null>(null);

  // "Iniciar Dia": null = ainda não começou o dia (mostra a tela normal
  // com todos os cards). Uma vez montada, a fila só mostra um item de
  // cada vez — o resto da tela fica escondido até parar ou terminar.
  const [dailyQueue, setDailyQueue] = useState<QueueItem[] | null>(null);
  const [queueIndex, setQueueIndex] = useState(0);
  const [currentTaskStartedAt, setCurrentTaskStartedAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!callStart) return;
    const tick = () => setElapsedMs(nowInBrasilia().getTime() - callStart.getTime());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [callStart]);

  function startTimer() {
    setCallStart(nowInBrasilia());
    setElapsedMs(0);
  }

  function stopTimer() {
    if (!callStart) return;
    const end = nowInBrasilia();
    const durationSeconds = Math.round((end.getTime() - callStart.getTime()) / 1000);
    addEntry({
      taskId: null,
      activityName: activityName.trim() || "Sem nome",
      category: activityCategory || null,
      startedAt: callStart.toISOString(),
      finishedAt: end.toISOString(),
      durationSeconds,
    });
    setCallStart(null);
    setElapsedMs(0);
    setActivityName("");
    setActivityCategory("");
  }

  function handleDelete(id: string) {
    if (!window.confirm("Excluir este registro?")) return;
    deleteEntry(id);
  }

  // Monta a fila do dia (tarefas de hoje + atrasadas + rotinas vencidas,
  // atrasadas primeiro, depois por posição em Prioridades) e começa a
  // cronometrar o primeiro item.
  function handleStartDay() {
    const queue = buildDailyQueue(tasks, routineTasks, entries, categories);
    setDailyQueue(queue);
    setQueueIndex(0);
    setCurrentTaskStartedAt(queue.length > 0 ? nowInBrasilia() : null);
  }

  // Marca o item atual como concluído, registra quanto tempo ele levou
  // (vira histórico pro motor aprender depois, e pra rotina saber
  // quando venceu de novo) e revela o próximo — nunca a lista inteira.
  function handleCompleteCurrentTask() {
    if (!dailyQueue) return;
    const currentTask = dailyQueue[queueIndex];
    if (!currentTask) return;

    const start = currentTaskStartedAt ?? nowInBrasilia();
    const end = nowInBrasilia();
    const durationSeconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));

    if (currentTask.source === "task") {
      toggleTaskStatus(currentTask.id);
    }
    addEntry({
      taskId: currentTask.id,
      activityName: currentTask.title,
      category: currentTask.category,
      startedAt: start.toISOString(),
      finishedAt: end.toISOString(),
      durationSeconds,
    });

    const nextIndex = queueIndex + 1;
    setQueueIndex(nextIndex);
    setCurrentTaskStartedAt(nextIndex < dailyQueue.length ? nowInBrasilia() : null);
  }

  function handleStopDay() {
    setDailyQueue(null);
    setQueueIndex(0);
    setCurrentTaskStartedAt(null);
  }

  function handleSaveEdit(id: string, updated: Omit<ExecutionHistoryEntry, "id">) {
    editEntry(id, updated);
    setEditingEntry(null);
  }

  function moveCategory(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= categories.length) return;
    const next = [...categories];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    reorder(next);
  }

  function openCreateRuleDialog() {
    setEditingRule(null);
    setIsRuleDialogOpen(true);
  }

  function openEditRuleDialog(rule: Rule) {
    setEditingRule(rule);
    setIsRuleDialogOpen(true);
  }

  function handleSaveRule(rule: Omit<Rule, "id" | "createdAt">) {
    if (editingRule) {
      editRule(editingRule.id, rule);
    } else {
      addRule(rule);
    }
    setIsRuleDialogOpen(false);
    setEditingRule(null);
  }

  function handleDeleteRule(id: string) {
    if (!window.confirm("Excluir esta regra?")) return;
    deleteRule(id);
  }

  function handleDeleteSchedule(id: string) {
    if (!window.confirm("Excluir este horário bloqueado?")) return;
    deleteSchedule(id);
  }

  function openCreateRoutineDialog() {
    setEditingRoutine(null);
    setIsRoutineDialogOpen(true);
  }

  function openEditRoutineDialog(routine: RoutineTask) {
    setEditingRoutine(routine);
    setIsRoutineDialogOpen(true);
  }

  function handleSaveRoutine(routine: Omit<RoutineTask, "id">) {
    if (editingRoutine) {
      editRoutineTask(editingRoutine.id, routine);
    } else {
      addRoutineTask(routine);
    }
    setIsRoutineDialogOpen(false);
    setEditingRoutine(null);
  }

  function handleDeleteRoutine(id: string) {
    if (!window.confirm("Excluir esta tarefa de rotina?")) return;
    deleteRoutineTask(id);
  }

  const isTimerActive = callStart !== null;

  const totalDurationSeconds = entries.reduce((sum, entry) => sum + (entry.durationSeconds ?? 0), 0);
  const averageDurationSeconds = entries.length > 0 ? Math.round(totalDurationSeconds / entries.length) : 0;
  const categoryTotals = new Map<string, number>();
  entries.forEach((entry) => {
    const key = entry.category || "Sem categoria";
    categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + (entry.durationSeconds ?? 0));
  });

  return (
    <div className="-mx-4 -mt-6 rounded-b-3xl bg-gradient-to-b from-orange-50 via-orange-50/40 to-transparent px-4 pt-6 dark:from-orange-950/40 dark:via-orange-950/10 sm:-mx-6 sm:px-6">
      <div className="flex flex-col gap-6 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300">
              <Timer className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Gestão de tempo</h1>
              <p className="text-sm text-muted-foreground">
                Reduz decisões: prioridades e regras organizam o dia, você só executa.
              </p>
            </div>
          </div>
          {dailyQueue === null ? (
            <Button className="gap-2 bg-orange-700 text-white hover:opacity-90" onClick={handleStartDay}>
              <Play className="size-4" />
              Iniciar Dia
            </Button>
          ) : (
            <Button variant="outline" className="gap-2" onClick={handleStopDay}>
              <Square className="size-4" />
              Parar
            </Button>
          )}
        </div>

        {dailyQueue !== null && (
          <Card className="border-orange-200 dark:border-orange-900">
            <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
              {queueIndex < dailyQueue.length ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Tarefa {queueIndex + 1} de {dailyQueue.length}
                  </p>
                  <h2 className="text-2xl font-semibold tracking-tight">{dailyQueue[queueIndex].title}</h2>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {dailyQueue[queueIndex].category && (
                      <Badge variant="secondary">{dailyQueue[queueIndex].category}</Badge>
                    )}
                    {dailyQueue[queueIndex].overdue && <Badge variant="destructive">Atrasada</Badge>}
                  </div>
                  {dailyQueue[queueIndex].time && (
                    <p className="text-sm text-muted-foreground">Horário: {dailyQueue[queueIndex].time}</p>
                  )}
                  <Button
                    size="lg"
                    className="gap-2 bg-orange-700 text-white hover:opacity-90"
                    onClick={handleCompleteCurrentTask}
                  >
                    <Check className="size-4" />
                    Concluir
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-2xl font-semibold tracking-tight">Dia concluído! 🎉</p>
                  <p className="text-sm text-muted-foreground">Nenhuma tarefa pendente pra hoje.</p>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {dailyQueue === null && (
        <>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-4 text-orange-700 dark:text-orange-300" />
              Cronômetro
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              Atividades da vida diária (não é do trabalho) — cada uma vinculada a uma prioridade, pra alimentar
              o planejamento automático do dia mais pra frente.
            </p>
            <div className="grid gap-4 sm:max-w-md sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="activity-name">Nome da atividade</Label>
                <Input
                  id="activity-name"
                  value={activityName}
                  onChange={(e) => setActivityName(e.target.value)}
                  placeholder="Ex: Ler, treinar, arrumar a casa"
                  disabled={isTimerActive}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="activity-category">Prioridade</Label>
                <Select value={activityCategory} onValueChange={setActivityCategory} disabled={isTimerActive}>
                  <SelectTrigger id="activity-category">
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category} value={category}>
                        {category}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {isTimerActive ? (
                <Button variant="destructive" className="gap-2" onClick={stopTimer}>
                  <Clock className="size-4" />
                  Encerrar
                </Button>
              ) : (
                <Button
                  className="gap-2 bg-orange-700 text-white hover:opacity-90"
                  onClick={startTimer}
                  disabled={!activityName.trim() || !activityCategory}
                >
                  <Clock className="size-4" />
                  Iniciar
                </Button>
              )}
              {isTimerActive && (
                <span className="font-mono text-lg tabular-nums text-orange-700 dark:text-orange-300">
                  {formatDuration(elapsedMs)}
                </span>
              )}
            </div>
            {!isTimerActive && (!activityName.trim() || !activityCategory) && (
              <p className="text-xs text-muted-foreground">
                Preencha o nome da atividade e a prioridade para iniciar o cronômetro.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prioridades</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {categories.map((category, index) => (
              <div
                key={category}
                className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
              >
                <span className="text-sm">
                  <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                  {category}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => moveCategory(index, -1)}
                    disabled={index === 0}
                    aria-label={`Subir ${category}`}
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => moveCategory(index, 1)}
                    disabled={index === categories.length - 1}
                    aria-label={`Descer ${category}`}
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-4 text-orange-700 dark:text-orange-300" />
              Horários bloqueados
            </CardTitle>
            <Button
              size="sm"
              className="gap-1.5 bg-orange-700 text-white hover:opacity-90"
              onClick={() => setIsScheduleDialogOpen(true)}
            >
              <Plus className="size-4" />
              Novo bloqueio
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {schedules.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Nenhum horário bloqueado cadastrado (ex: trabalho, faculdade, sono).
              </p>
            ) : (
              schedules.map((schedule) => (
                <div
                  key={schedule.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
                >
                  <div className="text-sm">
                    <p className="font-medium">{schedule.label}</p>
                    <p className="text-muted-foreground">
                      {WEEKDAY_LABELS[schedule.dayOfWeek]} · {schedule.startTime} às {schedule.endTime}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteSchedule(schedule.id)}
                    aria-label="Excluir horário bloqueado"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Regras ({rules.length})</CardTitle>
            <Button
              size="sm"
              className="gap-1.5 bg-orange-700 text-white hover:opacity-90"
              onClick={openCreateRuleDialog}
            >
              <Plus className="size-4" />
              Nova regra
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {rules.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Nenhuma regra cadastrada ainda.
              </p>
            ) : (
              rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border p-3"
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{rule.name}</p>
                      <Badge variant={rule.enabled ? "success" : "secondary"}>
                        {rule.enabled ? "Ativa" : "Inativa"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">Prioridade {rule.priority}</span>
                    </div>
                    {rule.description && <p className="text-sm text-muted-foreground">{rule.description}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditRuleDialog(rule)}>
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteRule(rule.id)}
                      aria-label="Excluir regra"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle>Rotina da casa ({routineTasks.length})</CardTitle>
            <Button
              size="sm"
              className="gap-1.5 bg-orange-700 text-white hover:opacity-90"
              onClick={openCreateRoutineDialog}
            >
              <Plus className="size-4" />
              Nova tarefa de rotina
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {routineTasks.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Nenhuma tarefa de rotina cadastrada ainda (ex: lavar louça, alimentar os pets, limpar banheiro).
              </p>
            ) : (
              routineTasks.map((routine) => (
                <div
                  key={routine.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border p-3"
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{routine.name}</p>
                      <Badge variant="secondary">{routine.category}</Badge>
                      {!routine.enabled && <Badge variant="outline">Inativa</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      A cada {routine.intervalDays} {routine.intervalDays === 1 ? "dia" : "dias"}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditRoutineDialog(routine)}>
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDeleteRoutine(routine.id)}
                      aria-label="Excluir tarefa de rotina"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="size-4 text-orange-700 dark:text-orange-300" />
              Estatísticas
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {entries.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Sem atividades cronometradas ainda — as estatísticas aparecem aqui assim que você registrar a
                primeira.
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs text-muted-foreground">Atividades registradas</p>
                    <p className="text-lg font-semibold">{entries.length}</p>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs text-muted-foreground">Tempo médio</p>
                    <p className="text-lg font-semibold">{formatDuration(averageDurationSeconds * 1000)}</p>
                  </div>
                  <div className="rounded-xl border border-border p-3">
                    <p className="text-xs text-muted-foreground">Tempo total</p>
                    <p className="text-lg font-semibold">{formatDuration(totalDurationSeconds * 1000)}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Tempo por prioridade</p>
                  {[...categoryTotals.entries()]
                    .sort((a, b) => b[1] - a[1])
                    .map(([category, seconds]) => (
                      <div key={category} className="flex items-center justify-between text-sm">
                        <span>{category}</span>
                        <span className="text-muted-foreground">{formatDuration(seconds * 1000)}</span>
                      </div>
                    ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="size-4 text-orange-700 dark:text-orange-300" />
              Histórico ({entries.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {entries.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Nenhuma atividade registrada ainda.
              </p>
            ) : (
              entries.map((entry) => {
                const start = new Date(entry.startedAt);
                const end = entry.finishedAt ? new Date(entry.finishedAt) : null;
                return (
                  <div
                    key={entry.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border p-3"
                  >
                    <div className="flex flex-col gap-0.5 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{entry.activityName}</p>
                        {entry.category && <Badge variant="secondary">{entry.category}</Badge>}
                      </div>
                      <p className="text-muted-foreground">
                        {formatClock(start)}
                        {end && ` até ${formatClock(end)}`} · Duração{" "}
                        {formatDuration((entry.durationSeconds ?? 0) * 1000)}
                      </p>
                    </div>
                    <EntryMenu onEdit={() => setEditingEntry(entry)} onDelete={() => handleDelete(entry.id)} />
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
        </>
        )}

        {editingEntry && (
          <EditEntryDialog
            entry={editingEntry}
            categories={categories}
            onCancel={() => setEditingEntry(null)}
            onSave={handleSaveEdit}
          />
        )}

        <ScheduleDialog
          open={isScheduleDialogOpen}
          onOpenChange={setIsScheduleDialogOpen}
          onSave={(schedule) => {
            addSchedule(schedule);
            setIsScheduleDialogOpen(false);
          }}
        />

        <RuleDialog
          open={isRuleDialogOpen}
          editingRule={editingRule}
          onOpenChange={(open) => {
            setIsRuleDialogOpen(open);
            if (!open) setEditingRule(null);
          }}
          onSave={handleSaveRule}
        />

        <RoutineDialog
          open={isRoutineDialogOpen}
          editingRoutine={editingRoutine}
          categories={categories}
          onOpenChange={(open) => {
            setIsRoutineDialogOpen(open);
            if (!open) setEditingRoutine(null);
          }}
          onSave={handleSaveRoutine}
        />
      </div>
    </div>
  );
}

// Menu "⋮" de cada registro: Editar/Excluir. Fecha sozinho ao clicar
// fora (sem depender de biblioteca externa de dropdown).
function EntryMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 text-muted-foreground"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Mais opções"
      >
        <MoreVertical className="size-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-36 rounded-lg border border-border bg-card py-1 shadow-md">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/50"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            <Pencil className="size-3.5" />
            Editar
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-muted/50"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            <Trash2 className="size-3.5" />
            Excluir
          </button>
        </div>
      )}
    </div>
  );
}

function EditEntryDialog({
  entry,
  categories,
  onCancel,
  onSave,
}: {
  entry: ExecutionHistoryEntry;
  categories: string[];
  onCancel: () => void;
  onSave: (id: string, updated: Omit<ExecutionHistoryEntry, "id">) => void;
}) {
  const entryStart = new Date(entry.startedAt);
  const entryEnd = entry.finishedAt ? new Date(entry.finishedAt) : entryStart;
  const [name, setName] = useState(entry.activityName);
  const [category, setCategory] = useState(entry.category ?? "");
  const [startTime, setStartTime] = useState(formatClock(entryStart).slice(0, 5));
  const [endTime, setEndTime] = useState(formatClock(entryEnd).slice(0, 5));

  function handleSave() {
    const start = withTime(entryStart, startTime);
    const end = withTime(entryEnd, endTime);
    const durationSeconds = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
    onSave(entry.id, {
      taskId: entry.taskId,
      activityName: name.trim() || "Sem nome",
      category: category || null,
      startedAt: start.toISOString(),
      finishedAt: end.toISOString(),
      durationSeconds,
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar atividade</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-activity-name">Nome</Label>
            <Input id="edit-activity-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-activity-category">Prioridade</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="edit-activity-category">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-activity-start">Início</Label>
              <Input
                id="edit-activity-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="edit-activity-end">Fim</Label>
              <Input
                id="edit-activity-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialog({
  open,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (schedule: Omit<BlockedSchedule, "id">) => void;
}) {
  const [label, setLabel] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");

  function handleSave() {
    if (!label.trim()) return;
    onSave({ label: label.trim(), dayOfWeek: Number(dayOfWeek), startTime, endTime });
    setLabel("");
    setDayOfWeek("1");
    setStartTime("08:00");
    setEndTime("17:00");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo horário bloqueado</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="schedule-label">Nome</Label>
            <Input
              id="schedule-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex: Trabalho, faculdade, sono"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="schedule-day">Dia da semana</Label>
            <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
              <SelectTrigger id="schedule-day">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAY_LABELS.map((day, index) => (
                  <SelectItem key={day} value={String(index)}>
                    {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="schedule-start">Início</Label>
              <Input
                id="schedule-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="schedule-end">Fim</Label>
              <Input id="schedule-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!label.trim()}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RuleDialog({
  open,
  editingRule,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  editingRule: Rule | null;
  onOpenChange: (open: boolean) => void;
  onSave: (rule: Omit<Rule, "id" | "createdAt">) => void;
}) {
  const [name, setName] = useState(editingRule?.name ?? "");
  const [description, setDescription] = useState(editingRule?.description ?? "");
  const [enabled, setEnabled] = useState(editingRule?.enabled ?? true);
  const [priority, setPriority] = useState(editingRule?.priority ?? 0);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(editingRule?.name ?? "");
      setDescription(editingRule?.description ?? "");
      setEnabled(editingRule?.enabled ?? true);
      setPriority(editingRule?.priority ?? 0);
    }
  }

  function handleSave() {
    if (!name.trim()) return;
    onSave({ name: name.trim(), description: description.trim(), enabled, priority });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingRule ? "Editar regra" : "Nova regra"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-name">Nome</Label>
            <Input
              id="rule-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Nunca sacrificar horário de estudo"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-description">Descrição</Label>
            <Textarea id="rule-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-priority">Prioridade</Label>
            <Input
              id="rule-priority"
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) || 0)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(Boolean(v))} />
            <Label>Regra ativa</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoutineDialog({
  open,
  editingRoutine,
  categories,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  editingRoutine: RoutineTask | null;
  categories: string[];
  onOpenChange: (open: boolean) => void;
  onSave: (routine: Omit<RoutineTask, "id">) => void;
}) {
  const [name, setName] = useState(editingRoutine?.name ?? "");
  const [category, setCategory] = useState(editingRoutine?.category ?? categories[0] ?? "");
  const [intervalDays, setIntervalDays] = useState(editingRoutine?.intervalDays ?? 7);
  const [priority, setPriority] = useState(editingRoutine?.priority ?? 0);
  const [enabled, setEnabled] = useState(editingRoutine?.enabled ?? true);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(editingRoutine?.name ?? "");
      setCategory(editingRoutine?.category ?? categories[0] ?? "");
      setIntervalDays(editingRoutine?.intervalDays ?? 7);
      setPriority(editingRoutine?.priority ?? 0);
      setEnabled(editingRoutine?.enabled ?? true);
    }
  }

  function handleSave() {
    if (!name.trim() || !category) return;
    onSave({ name: name.trim(), category, intervalDays: Math.max(1, intervalDays), priority, enabled });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingRoutine ? "Editar tarefa de rotina" : "Nova tarefa de rotina"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="routine-name">Nome</Label>
            <Input
              id="routine-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Lavar louça, limpar banheiro"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="routine-category">Prioridade</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="routine-category">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="routine-interval">Repetir a cada quantos dias</Label>
            <Input
              id="routine-interval"
              type="number"
              min={1}
              value={intervalDays}
              onChange={(e) => setIntervalDays(Number(e.target.value) || 1)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="routine-priority">Prioridade dentro da categoria (maior = mais urgente)</Label>
            <Input
              id="routine-priority"
              type="number"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) || 0)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(Boolean(v))} />
            <Label>Ativa</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!name.trim() || !category}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
