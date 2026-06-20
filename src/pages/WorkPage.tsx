import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  ListTodo,
  Plus,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskListItem } from "@/components/tasks/TaskListItem";
import { AddTaskDialog } from "@/components/tasks/AddTaskDialog";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { useAgenda } from "@/contexts/AgendaContext";
import { formatDateBR, getTaskTimeStatus, todayISO } from "@/lib/date";

const WORK_CALENDAR_ID = "work-private";

// Tela "/meu-trabalho" — painel independente para o calendário pessoal
// de trabalho, com estatísticas próprias e um calendário exclusivo desta aba.
export function WorkPage() {
  const { tasks } = useAgenda();
  const today = todayISO();
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [month, setMonth] = useState(Number(today.slice(5, 7)) - 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(today);
  const [addTaskOpen, setAddTaskOpen] = useState(false);

  const workTasks = useMemo(
    () => tasks.filter((task) => task.calendarId === WORK_CALENDAR_ID),
    [tasks]
  );

  const stats = useMemo(() => {
    const pending = workTasks.filter((task) => task.status !== "concluida");
    const overdue = pending.filter((task) => getTaskTimeStatus(task) === "vencida");
    const todayTasks = pending.filter((task) => task.date === today);
    const highPriority = pending.filter((task) => task.priority === "alta");

    return {
      pending: pending.length,
      overdue: overdue.length,
      today: todayTasks.length,
      priority: highPriority.length,
    };
  }, [workTasks, today]);

  const markedDates = useMemo(() => {
    const map: Record<string, { count: number; hasOverdue?: boolean }> = {};
    for (const task of workTasks) {
      if (task.status === "concluida") continue;
      const existing = map[task.date] ?? { count: 0 };
      existing.count += 1;
      if (getTaskTimeStatus(task) === "vencida") existing.hasOverdue = true;
      map[task.date] = existing;
    }
    return map;
  }, [workTasks]);

  const tasksForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    return [...workTasks]
      .filter((task) => task.date === selectedDate)
      .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  }, [selectedDate, workTasks]);

  const kitItems = [
    "Multímetro",
    "Chave de fenda",
    "Lanterna",
    "Peças de reposição",
    "Manual técnico",
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meu trabalho</h1>
        <p className="text-sm text-muted-foreground">
          Calendário privado do trabalho, com atividades exclusivas desta área.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-5">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ListTodo className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Rotina</p>
              <p className="text-2xl font-semibold">{stats.pending}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 pt-5">
            <div className="flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <AlertTriangle className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pendências</p>
              <p className="text-2xl font-semibold">{stats.overdue}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 pt-5">
            <div className="flex size-11 items-center justify-center rounded-xl bg-warning/15 text-warning">
              <CalendarClock className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Hoje</p>
              <p className="text-2xl font-semibold">{stats.today}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-3 pt-5">
            <div className="flex size-11 items-center justify-center rounded-xl bg-success/10 text-success">
              <CheckCircle2 className="size-5" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Prioridade</p>
              <p className="text-2xl font-semibold">{stats.priority}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BriefcaseBusiness className="size-4" />
              Calendário do trabalho
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MonthGrid
              year={year}
              month={month}
              onMonthChange={(nextYear, nextMonth) => {
                setYear(nextYear);
                setMonth(nextMonth);
              }}
              markedDates={markedDates}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="size-4" />
              Atividades do dia
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Selecionado</p>
                <p className="font-semibold">
                  {selectedDate ? formatDateBR(selectedDate) : "Selecione um dia"}
                </p>
              </div>
              <Button
                size="sm"
                className="gap-1.5"
                disabled={!selectedDate}
                onClick={() => setAddTaskOpen(true)}
              >
                <Plus className="size-4" />
                Adicionar
              </Button>
            </div>

            <div className="flex flex-col gap-2">
              {tasksForSelectedDate.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhuma atividade marcada para este dia.
                </p>
              ) : (
                tasksForSelectedDate.map((task) => <TaskListItem key={task.id} task={task} />)
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="size-4" />
              Ferramentas e materiais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2">
              {kitItems.map((item) => (
                <div key={item} className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
                  {item}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4" />
              Observações rápidas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Registre falhas, peças trocadas, próximos passos e detalhes importantes da
              rotina.
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedDate && (
        <AddTaskDialog
          calendarId={WORK_CALENDAR_ID}
          date={selectedDate}
          open={addTaskOpen}
          onOpenChange={setAddTaskOpen}
        />
      )}
    </div>
  );
}
