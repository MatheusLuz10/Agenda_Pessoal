import { useEffect, useRef, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
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
import { usePlannerLogs } from "@/modules/rule-engine/hooks/usePlannerLogs";
import { usePriorities } from "@/modules/rule-engine/hooks/usePriorities";
import { useRoutineTasks } from "@/modules/rule-engine/hooks/useRoutineTasks";
import { useRules } from "@/modules/rule-engine/hooks/useRules";
import type { BlockedSchedule, ExecutionHistoryEntry, RoutineTask, Rule } from "@/modules/rule-engine/types";
import type { Task } from "@/types";

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function formatDayOfWeek(dayOfWeek: number | null): string {
  return dayOfWeek === null ? "Todos os dias" : WEEKDAY_LABELS[dayOfWeek];
}

// Minutos entre dois horários HH:mm, lidando com virada de meia-noite
// (ex: sono das 23:00 às 06:00).
function minutesBetween(startTime: string, endTime: string): number {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;
  return endTotal >= startTotal ? endTotal - startTotal : 24 * 60 - startTotal + endTotal;
}

// Tarefas atrasadas vêm primeiro, depois ordena por prioridade (alta >
// média > baixa) e por horário (com horário antes de sem horário).
function priorityWeight(priority: Task["priority"]): number {
  return priority === "alta" ? 0 : priority === "media" ? 1 : 2;
}

// Tarefas de Calendários não têm estimativa de tempo própria — usa um
// valor padrão só pra entrar na conta do resumo do dia.
const DEFAULT_TASK_ESTIMATE_MINUTES = 30;

// Quantos dias de atraso (tarefa) ou quantas vezes o intervalo (rotina)
// transformam um item "atrasado" em "crítico" — crítico nunca é
// escondido por um Modo, mesmo que a categoria não bata com o filtro.
const CRITICAL_TASK_OVERDUE_DAYS = 3;
const CRITICAL_ROUTINE_INTERVAL_MULTIPLIER = 2;

// "Modo" do dia: um jeito rápido de dizer "só me mostra isso agora",
// sempre respeitando que Desenvolvimento pessoal nunca deve ficar de
// fora só porque um modo mais restrito está ativo em outra categoria.
type DailyMode = "trabalho" | "estudo" | "descanso" | null;

const DAILY_MODE_CATEGORIES: Record<Exclude<DailyMode, null>, string[]> = {
  estudo: ["Desenvolvimento pessoal"],
  descanso: ["Saúde", "Relacionamento"],
  trabalho: ["Casa", "Pets", "Financeiro"],
};

const DAILY_MODE_LABELS: Record<Exclude<DailyMode, null>, string> = {
  estudo: "Estudo",
  descanso: "Descanso",
  trabalho: "Casa/afazeres",
};

const DAILY_MODE_STORAGE_KEY = "gestao-tempo-modo-dia";

// Valor sentinela do seletor de tarefa do cronômetro pra "não é nenhuma
// tarefa de rotina cadastrada, vou digitar o nome" (atividade avulsa).
const FREE_TEXT_OPTION = "__avulsa__";

// Um item da fila do dia: tanto uma tarefa de Calendários (com data)
// quanto uma tarefa de rotina que venceu (sem data, definida pelo
// intervalo de dias). "Iniciar Dia" só mostra um de cada vez.
interface QueueItem {
  id: string;
  title: string;
  source: "task" | "routine";
  category: string | null;
  overdue: boolean;
  critical: boolean;
  time?: string;
  priorityWeight: number;
  estimatedMinutes: number;
}

// Regras cadastradas (Regras) reforçam a categoria que citam no nome
// ou na descrição: soma a prioridade da regra como um "empurrão" pra
// aquela categoria subir na fila — é como "Regras" passa a influenciar
// a ordem de verdade, e não só ficar decorativa.
function buildCategoryBoosts(rules: Rule[], categories: string[]): Map<string, number> {
  const boosts = new Map<string, number>();
  rules
    .filter((rule) => rule.enabled)
    .forEach((rule) => {
      const haystack = `${rule.name} ${rule.description}`.toLowerCase();
      categories.forEach((category) => {
        if (haystack.includes(category.toLowerCase())) {
          boosts.set(category, (boosts.get(category) ?? 0) + rule.priority);
        }
      });
    });
  return boosts;
}

// Dias corridos entre duas datas ISO (yyyy-MM-dd), sempre >= 0.
function daysOverdue(dateISO: string, todayIso: string): number {
  const diffMs = new Date(`${todayIso}T00:00:00`).getTime() - new Date(`${dateISO}T00:00:00`).getTime();
  return Math.max(0, Math.round(diffMs / 86_400_000));
}

// Cruza cada tarefa de rotina com o histórico de execução (última vez
// que foi concluída) pra decidir se já venceu (dias desde a última
// execução >= intervalo configurado). Nunca feita = sempre vencida.
// Rotinas sem tempo estimado ficam de fora — "só ficam ativas depois de
// ter um cronograma" (ver RoutineTask.estimatedMinutes).
//
// `mode` restringe a fila às categorias daquele modo (ver
// DAILY_MODE_CATEGORIES) — itens críticos sempre aparecem, mesmo fora
// do modo, pra nunca esconder algo realmente urgente.
function buildDailyQueue(
  tasks: Task[],
  routineTasks: RoutineTask[],
  history: ExecutionHistoryEntry[],
  categories: string[],
  rules: Rule[],
  mode: DailyMode = null
): QueueItem[] {
  const today = todayISO();
  const categoryRank = (category: string | null): number => {
    if (!category) return categories.length;
    const index = categories.indexOf(category);
    return index === -1 ? categories.length : index;
  };
  const categoryBoosts = buildCategoryBoosts(rules, categories);

  const taskItems: QueueItem[] = tasks
    .filter((task) => task.status !== "concluida" && task.date <= today)
    .map((task) => ({
      id: task.id,
      title: task.title,
      source: "task" as const,
      category: null,
      overdue: task.date < today,
      critical: daysOverdue(task.date, today) >= CRITICAL_TASK_OVERDUE_DAYS,
      time: task.time,
      priorityWeight: priorityWeight(task.priority),
      estimatedMinutes: DEFAULT_TASK_ESTIMATE_MINUTES,
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
    .filter((routine) => routine.enabled && routine.estimatedMinutes != null)
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
      critical: daysSince !== Infinity && daysSince > routine.intervalDays * CRITICAL_ROUTINE_INTERVAL_MULTIPLIER,
      priorityWeight: -routine.priority,
      estimatedMinutes: routine.estimatedMinutes ?? DEFAULT_TASK_ESTIMATE_MINUTES,
    }));

  // Pontuação única: posição em Prioridades pesa mais, atraso é só um
  // empurrão dentro do mesmo nível (não domina sozinho), regras
  // cadastradas puxam a categoria citada pra frente, itens críticos
  // vão praticamente sempre pro topo, e a prioridade do próprio item
  // desempata por último.
  const score = (item: QueueItem): number =>
    (item.critical ? -1000 : 0) +
    categoryRank(item.category) * 100 +
    (item.overdue ? 20 : 0) +
    item.priorityWeight -
    (categoryBoosts.get(item.category ?? "") ?? 0) * 5;

  const modeCategories = mode ? DAILY_MODE_CATEGORIES[mode] : null;
  const filtered = modeCategories
    ? [...taskItems, ...routineItems].filter(
        (item) => item.critical || item.category === null || modeCategories.includes(item.category)
      )
    : [...taskItems, ...routineItems];

  return filtered.sort((a, b) => {
    const scoreDiff = score(a) - score(b);
    if (scoreDiff !== 0) return scoreDiff;
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

// Formata um total de minutos (pode vir fracionado) como "Xh Ymin".
function formatMinutes(totalMinutes: number): string {
  const rounded = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(rounded / 60);
  const minutes = rounded % 60;
  return hours > 0 ? `${hours}h ${minutes}min` : `${minutes}min`;
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
  const [selectedRoutineId, setSelectedRoutineId] = useState("");
  const [activityName, setActivityName] = useState("");
  const [activityCategory, setActivityCategory] = useState("");
  const [callStart, setCallStart] = useState<Date | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [editingEntry, setEditingEntry] = useState<ExecutionHistoryEntry | null>(null);

  const { categories, reorder } = usePriorities();
  const { schedules, addSchedule, deleteSchedule } = useBlockedSchedules();
  const { rules, addRule, editRule, deleteRule } = useRules();
  const { routineTasks, addRoutineTask, editRoutineTask, deleteRoutineTask, deleteRoutineTasks } = useRoutineTasks();
  const { entries, addEntry, editEntry, deleteEntry, deleteEntries } = useExecutionHistory();
  const { logs: plannerLogs, logDecision } = usePlannerLogs();
  const [selectedEntryIds, setSelectedEntryIds] = useState<Set<string>>(new Set());
  const [selectedRoutineIds, setSelectedRoutineIds] = useState<Set<string>>(new Set());
  // "Modo do dia" filtra a fila por um grupo de categorias (ver
  // DAILY_MODE_CATEGORIES) — persistido no localStorage (não é dado do
  // Supabase, só uma preferência local de sessão).
  const [dailyMode, setDailyMode] = useState<DailyMode>(() => {
    const stored = localStorage.getItem(DAILY_MODE_STORAGE_KEY);
    return stored === "trabalho" || stored === "estudo" || stored === "descanso" ? stored : null;
  });
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
  const [dailyElapsedMs, setDailyElapsedMs] = useState(0);

  useEffect(() => {
    if (!callStart) return;
    const tick = () => setElapsedMs(nowInBrasilia().getTime() - callStart.getTime());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [callStart]);

  // Cronômetro silencioso do item atual do "Iniciar Dia" — alimenta o
  // resumo do dia (tempo utilizado) enquanto o item ainda não foi
  // concluído.
  useEffect(() => {
    if (!currentTaskStartedAt) return;
    const tick = () => setDailyElapsedMs(nowInBrasilia().getTime() - currentTaskStartedAt.getTime());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [currentTaskStartedAt]);

  function startTimer() {
    setCallStart(nowInBrasilia());
    setElapsedMs(0);
  }

  function stopTimer() {
    if (!callStart) return;
    const end = nowInBrasilia();
    const durationSeconds = Math.round((end.getTime() - callStart.getTime()) / 1000);
    const selectedRoutine = routineTasks.find((routine) => routine.id === selectedRoutineId);
    const finalName = selectedRoutine ? selectedRoutine.name : activityName.trim() || "Sem nome";
    const finalCategory = selectedRoutine ? selectedRoutine.category : activityCategory || null;

    addEntry({
      taskId: selectedRoutine?.id ?? null,
      activityName: finalName,
      category: finalCategory,
      startedAt: callStart.toISOString(),
      finishedAt: end.toISOString(),
      durationSeconds,
    });

    // Cronometrar uma tarefa de rotina calibra (ou define pela primeira
    // vez) o tempo estimado dela com a média real medida — é assim que
    // ela "aprende" e passa a ficar ativa em "Iniciar Dia" sem precisar
    // digitar uma estimativa manual.
    if (selectedRoutine) {
      const priorDurations = entries
        .filter((entry) => entry.taskId === selectedRoutine.id && entry.durationSeconds != null)
        .map((entry) => entry.durationSeconds as number);
      const allDurations = [...priorDurations, durationSeconds];
      const averageMinutes = Math.max(
        1,
        Math.round(allDurations.reduce((sum, seconds) => sum + seconds, 0) / allDurations.length / 60)
      );
      editRoutineTask(selectedRoutine.id, { ...selectedRoutine, estimatedMinutes: averageMinutes });
    }

    setCallStart(null);
    setElapsedMs(0);
    setActivityName("");
    setActivityCategory("");
    setSelectedRoutineId("");
  }

  function handleDelete(id: string) {
    if (!window.confirm("Excluir este registro?")) return;
    deleteEntry(id);
  }

  function toggleEntrySelection(id: string) {
    setSelectedEntryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllEntriesSelection() {
    setSelectedEntryIds((prev) => (prev.size === entries.length ? new Set() : new Set(entries.map((e) => e.id))));
  }

  function handleDeleteSelectedEntries() {
    if (selectedEntryIds.size === 0) return;
    if (!window.confirm(`Excluir ${selectedEntryIds.size} registro(s) selecionado(s)?`)) return;
    deleteEntries([...selectedEntryIds]);
    setSelectedEntryIds(new Set());
  }

  function changeDailyMode(mode: DailyMode) {
    setDailyMode(mode);
    if (mode) localStorage.setItem(DAILY_MODE_STORAGE_KEY, mode);
    else localStorage.removeItem(DAILY_MODE_STORAGE_KEY);
  }

  // Monta a fila do dia (tarefas de hoje + atrasadas + rotinas vencidas,
  // atrasadas primeiro, depois por posição em Prioridades) e começa a
  // cronometrar o primeiro item.
  function handleStartDay() {
    const queue = buildDailyQueue(tasks, routineTasks, entries, categories, rules, dailyMode);
    setDailyQueue(queue);
    setQueueIndex(0);
    setCurrentTaskStartedAt(queue.length > 0 ? nowInBrasilia() : null);

    // Registra no histórico de decisões toda categoria que apareceu na
    // fila de hoje e foi puxada pra frente por alguma regra ativa, e
    // também qual Modo estava filtrando a fila — assim dá pra consultar
    // depois por que o dia ficou organizado daquele jeito.
    const categoryBoosts = buildCategoryBoosts(rules, categories);
    const categoriesInQueue = new Set(
      queue.map((item) => item.category).filter((category): category is string => category !== null)
    );
    categoriesInQueue.forEach((category) => {
      if (!categoryBoosts.get(category)) return;
      const matchingRules = rules.filter(
        (rule) => rule.enabled && `${rule.name} ${rule.description}`.toLowerCase().includes(category.toLowerCase())
      );
      if (matchingRules.length === 0) return;
      logDecision(
        `Categoria "${category}" priorizada na fila de hoje`,
        `Regra(s) ativa(s): ${matchingRules.map((rule) => rule.name).join(", ")}`
      );
    });
    if (dailyMode) {
      logDecision(
        `Modo "${DAILY_MODE_LABELS[dailyMode]}" ativo`,
        `Fila restrita a ${DAILY_MODE_CATEGORIES[dailyMode].join(", ")} (itens críticos continuam aparecendo mesmo fora do modo).`
      );
    }
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
    setDailyElapsedMs(0);
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

  function toggleRoutineSelection(id: string) {
    setSelectedRoutineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllRoutinesSelection() {
    setSelectedRoutineIds((prev) =>
      prev.size === routineTasks.length ? new Set() : new Set(routineTasks.map((r) => r.id))
    );
  }

  function handleDeleteSelectedRoutines() {
    if (selectedRoutineIds.size === 0) return;
    if (!window.confirm(`Excluir ${selectedRoutineIds.size} tarefa(s) de rotina selecionada(s)?`)) return;
    deleteRoutineTasks([...selectedRoutineIds]);
    setSelectedRoutineIds(new Set());
  }

  const isTimerActive = callStart !== null;

  const totalDurationSeconds = entries.reduce((sum, entry) => sum + (entry.durationSeconds ?? 0), 0);
  const averageDurationSeconds = entries.length > 0 ? Math.round(totalDurationSeconds / entries.length) : 0;
  const categoryTotals = new Map<string, number>();
  entries.forEach((entry) => {
    const key = entry.category || "Sem categoria";
    categoryTotals.set(key, (categoryTotals.get(key) ?? 0) + (entry.durationSeconds ?? 0));
  });

  // Resumo do dia: quanto do "orçamento" de hoje (24h menos os horários
  // bloqueados de hoje) já foi usado, quanto ainda falta pros itens
  // restantes da fila e quanto sobra livre. Só existe com o dia iniciado.
  let daySummary: { budget: number; used: number; remaining: number; free: number } | null = null;
  if (dailyQueue) {
    const todayWeekday = nowInBrasilia().getDay();
    const blockedMinutesToday = schedules
      .filter((schedule) => schedule.dayOfWeek === null || schedule.dayOfWeek === todayWeekday)
      .reduce((sum, schedule) => sum + minutesBetween(schedule.startTime, schedule.endTime), 0);
    const budget = Math.max(0, 24 * 60 - blockedMinutesToday);

    const usedFromHistoryToday = entries
      .filter((entry) => entry.finishedAt?.slice(0, 10) === todayISO())
      .reduce((sum, entry) => sum + (entry.durationSeconds ?? 0) / 60, 0);
    const used = usedFromHistoryToday + dailyElapsedMs / 60_000;

    const remainingRaw = dailyQueue
      .slice(queueIndex)
      .reduce((sum, item) => sum + item.estimatedMinutes, 0);
    const remaining = Math.max(0, remainingRaw - dailyElapsedMs / 60_000);

    const free = budget - used - remaining;
    daySummary = { budget, used, remaining, free };
  }

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

        {dailyQueue === null && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Modo do dia:</span>
            <Button
              size="sm"
              variant={dailyMode === null ? "default" : "outline"}
              className={dailyMode === null ? "bg-orange-700 text-white hover:opacity-90" : ""}
              onClick={() => changeDailyMode(null)}
            >
              Padrão
            </Button>
            {(Object.keys(DAILY_MODE_LABELS) as Array<Exclude<DailyMode, null>>).map((mode) => (
              <Button
                key={mode}
                size="sm"
                variant={dailyMode === mode ? "default" : "outline"}
                className={dailyMode === mode ? "bg-orange-700 text-white hover:opacity-90" : ""}
                onClick={() => changeDailyMode(mode)}
              >
                {DAILY_MODE_LABELS[mode]}
              </Button>
            ))}
            <span className="text-xs text-muted-foreground">
              {dailyMode
                ? `Só ${DAILY_MODE_CATEGORIES[dailyMode].join(", ")} (críticos aparecem sempre).`
                : "Todas as categorias."}
            </span>
          </div>
        )}

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
                    {dailyQueue[queueIndex].critical && <Badge variant="destructive">🔥 Crítica</Badge>}
                    {!dailyQueue[queueIndex].critical && dailyQueue[queueIndex].overdue && (
                      <Badge variant="destructive">Atrasada</Badge>
                    )}
                  </div>
                  {dailyQueue[queueIndex].time && (
                    <p className="text-sm text-muted-foreground">Horário: {dailyQueue[queueIndex].time}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Estimativa: ~{dailyQueue[queueIndex].estimatedMinutes} min · Em andamento:{" "}
                    {formatDuration(dailyElapsedMs)}
                  </p>
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

        {dailyQueue !== null && daySummary && (
          <Card>
            <CardHeader>
              <CardTitle>Resumo do dia</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-1">
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted-foreground">Utilizado</p>
                  <p className="text-lg font-semibold">{formatMinutes(daySummary.used)}</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted-foreground">Restante (estimado)</p>
                  <p className="text-lg font-semibold">{formatMinutes(daySummary.remaining)}</p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted-foreground">Livre</p>
                  <p className={`text-lg font-semibold ${daySummary.free < 0 ? "text-destructive" : ""}`}>
                    {daySummary.free < 0
                      ? `Sobrecarregado em ${formatMinutes(-daySummary.free)}`
                      : formatMinutes(daySummary.free)}
                  </p>
                </div>
                <div className="rounded-xl border border-border p-3">
                  <p className="text-xs text-muted-foreground">Orçamento do dia</p>
                  <p className="text-lg font-semibold">{formatMinutes(daySummary.budget)}</p>
                </div>
              </div>
              <div className="flex-1">
                <DaySummaryChart summary={daySummary} />
              </div>
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
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Label htmlFor="activity-routine">Tarefa</Label>
                <Select value={selectedRoutineId} onValueChange={setSelectedRoutineId} disabled={isTimerActive}>
                  <SelectTrigger id="activity-routine">
                    <SelectValue placeholder="Selecione uma tarefa de rotina" />
                  </SelectTrigger>
                  <SelectContent>
                    {routineTasks.map((routine) => (
                      <SelectItem key={routine.id} value={routine.id}>
                        {routine.name} · {routine.category}
                      </SelectItem>
                    ))}
                    <SelectItem value={FREE_TEXT_OPTION}>✏️ Atividade avulsa (digitar nome)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {selectedRoutineId === FREE_TEXT_OPTION && (
                <>
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
                </>
              )}
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
                  disabled={
                    !selectedRoutineId ||
                    (selectedRoutineId === FREE_TEXT_OPTION && (!activityName.trim() || !activityCategory))
                  }
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
            {!isTimerActive &&
              (!selectedRoutineId ||
                (selectedRoutineId === FREE_TEXT_OPTION && (!activityName.trim() || !activityCategory))) && (
                <p className="text-xs text-muted-foreground">
                  Selecione uma tarefa de rotina (ou uma atividade avulsa com nome e prioridade) para iniciar o
                  cronômetro.
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
                      {formatDayOfWeek(schedule.dayOfWeek)} · {schedule.startTime} às {schedule.endTime}
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
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle>Rotina da casa ({routineTasks.length})</CardTitle>
            <div className="flex items-center gap-2">
              {selectedRoutineIds.size > 0 && (
                <Button variant="destructive" size="sm" className="gap-1.5" onClick={handleDeleteSelectedRoutines}>
                  <Trash2 className="size-4" />
                  Excluir {selectedRoutineIds.size} selecionada(s)
                </Button>
              )}
              <Button
                size="sm"
                className="gap-1.5 bg-orange-700 text-white hover:opacity-90"
                onClick={openCreateRoutineDialog}
              >
                <Plus className="size-4" />
                Nova tarefa de rotina
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {routineTasks.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Nenhuma tarefa de rotina cadastrada ainda (ex: lavar louça, alimentar os pets, limpar banheiro).
              </p>
            ) : (
              <>
                <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={selectedRoutineIds.size === routineTasks.length}
                    onCheckedChange={toggleAllRoutinesSelection}
                  />
                  Selecionar todas
                </label>
                {routineTasks.map((routine) => (
                <div
                  key={routine.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border p-3"
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      className="mt-1"
                      checked={selectedRoutineIds.has(routine.id)}
                      onCheckedChange={() => toggleRoutineSelection(routine.id)}
                      aria-label={`Selecionar ${routine.name}`}
                    />
                    <div className="flex flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{routine.name}</p>
                        <Badge variant="secondary">{routine.category}</Badge>
                        {!routine.enabled && <Badge variant="outline">Inativa</Badge>}
                        {routine.estimatedMinutes == null && <Badge variant="warning">Sem estimativa</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        A cada {routine.intervalDays} {routine.intervalDays === 1 ? "dia" : "dias"}
                        {routine.estimatedMinutes != null && ` · ~${routine.estimatedMinutes} min`}
                      </p>
                    </div>
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
                ))}
              </>
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
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <History className="size-4 text-orange-700 dark:text-orange-300" />
              Histórico ({entries.length})
            </CardTitle>
            {selectedEntryIds.size > 0 && (
              <Button variant="destructive" size="sm" className="gap-1.5" onClick={handleDeleteSelectedEntries}>
                <Trash2 className="size-4" />
                Excluir {selectedEntryIds.size} selecionado(s)
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {entries.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Nenhuma atividade registrada ainda.
              </p>
            ) : (
              <>
                <label className="flex w-fit items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox
                    checked={selectedEntryIds.size === entries.length}
                    onCheckedChange={toggleAllEntriesSelection}
                  />
                  Selecionar todos
                </label>
                {entries.map((entry) => {
                const start = new Date(entry.startedAt);
                const end = entry.finishedAt ? new Date(entry.finishedAt) : null;
                return (
                  <div
                    key={entry.id}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border p-3"
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        className="mt-1"
                        checked={selectedEntryIds.has(entry.id)}
                        onCheckedChange={() => toggleEntrySelection(entry.id)}
                        aria-label={`Selecionar ${entry.activityName}`}
                      />
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
                    </div>
                    <EntryMenu onEdit={() => setEditingEntry(entry)} onDelete={() => handleDelete(entry.id)} />
                  </div>
                );
                })}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Decisões do motor ({plannerLogs.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {plannerLogs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Nenhuma decisão registrada ainda — aparece aqui toda vez que uma regra ativa ou um Modo
                influenciar a fila de "Iniciar Dia".
              </p>
            ) : (
              plannerLogs.map((log) => (
                <div key={log.id} className="rounded-xl border border-border p-3 text-sm">
                  <p className="font-medium">{log.decision}</p>
                  <p className="text-xs text-muted-foreground">{log.reason}</p>
                </div>
              ))
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

const DAY_SUMMARY_COLORS = { used: "#c2410c", remaining: "#fb923c", free: "#e2e8f0" };

// Donut do resumo do dia: Utilizado / Restante (estimado) / Livre. Se o
// dia estiver sobrecarregado (livre negativo), a fatia "Livre" some e
// vira só Utilizado + Restante (o texto acima já avisa "sobrecarregado").
function DaySummaryChart({
  summary,
}: {
  summary: { budget: number; used: number; remaining: number; free: number };
}) {
  const data = [
    { name: "Utilizado", value: Math.max(0, summary.used), color: DAY_SUMMARY_COLORS.used },
    { name: "Restante", value: Math.max(0, summary.remaining), color: DAY_SUMMARY_COLORS.remaining },
    { name: "Livre", value: Math.max(0, summary.free), color: DAY_SUMMARY_COLORS.free },
  ].filter((slice) => slice.value > 0);

  if (data.length === 0) {
    return (
      <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Sem dados suficientes ainda.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          label={({ name, value }) => `${name}: ${formatMinutes(Number(value))}`}
        >
          {data.map((slice) => (
            <Cell key={slice.name} fill={slice.color} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => formatMinutes(Number(value))} />
      </PieChart>
    </ResponsiveContainer>
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
  const [dayOfWeek, setDayOfWeek] = useState("all");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("17:00");

  function handleSave() {
    if (!label.trim()) return;
    onSave({
      label: label.trim(),
      dayOfWeek: dayOfWeek === "all" ? null : Number(dayOfWeek),
      startTime,
      endTime,
    });
    setLabel("");
    setDayOfWeek("all");
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
                <SelectItem value="all">Todos os dias (semana toda)</SelectItem>
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
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    editingRoutine?.estimatedMinutes != null ? String(editingRoutine.estimatedMinutes) : ""
  );
  const [enabled, setEnabled] = useState(editingRoutine?.enabled ?? true);

  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setName(editingRoutine?.name ?? "");
      setCategory(editingRoutine?.category ?? categories[0] ?? "");
      setIntervalDays(editingRoutine?.intervalDays ?? 7);
      setPriority(editingRoutine?.priority ?? 0);
      setEstimatedMinutes(editingRoutine?.estimatedMinutes != null ? String(editingRoutine.estimatedMinutes) : "");
      setEnabled(editingRoutine?.enabled ?? true);
    }
  }

  function handleSave() {
    if (!name.trim() || !category) return;
    const parsedMinutes = estimatedMinutes.trim() ? Math.max(1, Number(estimatedMinutes)) : null;
    onSave({
      name: name.trim(),
      category,
      intervalDays: Math.max(1, intervalDays),
      priority,
      estimatedMinutes: parsedMinutes,
      enabled,
    });
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="routine-estimate">Tempo estimado (minutos)</Label>
            <Input
              id="routine-estimate"
              type="number"
              min={1}
              value={estimatedMinutes}
              onChange={(e) => setEstimatedMinutes(e.target.value)}
              placeholder="Ex: 20"
            />
            <p className="text-xs text-muted-foreground">
              Sem essa estimativa, a tarefa não aparece em "Iniciar Dia" nem entra no resumo do dia.
            </p>
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
