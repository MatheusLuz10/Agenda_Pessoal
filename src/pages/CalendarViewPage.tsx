import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, ChevronUp, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { TaskListItem } from "@/components/tasks/TaskListItem";
import { AddTaskDialog } from "@/components/tasks/AddTaskDialog";
import { useAgenda } from "@/contexts/AgendaContext";
import { formatDateBR, getTaskTimeStatus, todayISO } from "@/lib/date";

// Tela "/calendarios/:calendarId" — calendário de um grupo específico.
// Mostra a grade do mês + um painel lateral com as tarefas do dia
// selecionado. Aceita um parâmetro de busca opcional "?date=yyyy-MM-dd"
// (usado pelos links da Home/Tarefas) para abrir já num dia específico.
export function CalendarViewPage() {
  // useParams lê o segmento dinâmico da rota (":calendarId" em App.tsx).
  const { calendarId } = useParams<{ calendarId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { getCalendarById, getTasksByCalendar } = useAgenda();

  const calendar = calendarId ? getCalendarById(calendarId) : undefined;
  const allTasks = calendarId ? getTasksByCalendar(calendarId) : [];

  // Data inicial: vem da URL se presente, senão usa hoje.
  const initialDate = searchParams.get("date") ?? todayISO();
  const [year, setYear] = useState(Number(initialDate.slice(0, 4)));
  const [month, setMonth] = useState(Number(initialDate.slice(5, 7)) - 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(initialDate);
  const [addTaskOpen, setAddTaskOpen] = useState(false);
  const [isCompletedOpen, setIsCompletedOpen] = useState(false);

  // Marca no calendário apenas os dias com tarefas DESTE calendário
  // (diferente do markedDates da Home, que olha todos os calendários).
  const markedDates = useMemo(() => {
    const map: Record<string, { count: number; hasOverdue?: boolean }> = {};
    for (const task of allTasks) {
      if (task.status === "concluida") continue;
      const existing = map[task.date] ?? { count: 0 };
      existing.count += 1;
      if (getTaskTimeStatus(task) === "vencida") existing.hasOverdue = true;
      map[task.date] = existing;
    }
    return map;
  }, [allTasks]);

  // Tarefas do dia atualmente selecionado na grade, ordenadas por horário.
  const tasksForSelectedDate = useMemo(
    () =>
      selectedDate
        ? allTasks
            .filter((t) => t.date === selectedDate)
            .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""))
        : [],
    [allTasks, selectedDate]
  );

  // Concluídas ficam escondidas por padrão (ver isCompletedOpen) — só
  // pendentes aparecem direto na lista.
  const pendingTasksForSelectedDate = useMemo(
    () => tasksForSelectedDate.filter((t) => t.status !== "concluida"),
    [tasksForSelectedDate]
  );
  const completedTasksForSelectedDate = useMemo(
    () => tasksForSelectedDate.filter((t) => t.status === "concluida"),
    [tasksForSelectedDate]
  );

  // Guarda contra um :calendarId inválido/inexistente na URL.
  if (!calendar) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-muted-foreground">Calendário não encontrado.</p>
        <Button variant="outline" onClick={() => navigate("/calendarios")}>
          Voltar para Calendários
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/calendarios")}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-xl">
          {calendar.icon}
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{calendar.name}</h1>
          {calendar.observation && (
            <p className="text-xs text-muted-foreground">{calendar.observation}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="pt-5">
            <MonthGrid
              year={year}
              month={month}
              onMonthChange={(y, m) => {
                setYear(y);
                setMonth(m);
              }}
              markedDates={markedDates}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-4 pt-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Data selecionada</p>
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
                  Nenhuma tarefa para este dia.
                </p>
              ) : (
                <>
                  {pendingTasksForSelectedDate.length === 0 ? (
                    <p className="py-2 text-center text-sm text-muted-foreground">
                      Nenhuma tarefa pendente para este dia.
                    </p>
                  ) : (
                    pendingTasksForSelectedDate.map((task) => <TaskListItem key={task.id} task={task} />)
                  )}

                  {completedTasksForSelectedDate.length > 0 && (
                    <div className="mt-1 flex flex-col gap-2 border-t border-border pt-2">
                      <button
                        type="button"
                        onClick={() => setIsCompletedOpen((prev) => !prev)}
                        className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-left text-sm font-medium"
                        aria-expanded={isCompletedOpen}
                      >
                        Tarefas concluídas
                        <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                          {completedTasksForSelectedDate.length}
                          {isCompletedOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                        </span>
                      </button>
                      {isCompletedOpen &&
                        completedTasksForSelectedDate.map((task) => <TaskListItem key={task.id} task={task} />)}
                    </div>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Só renderiza o modal quando há um dia selecionado, pois ele
          precisa saber em qual data criar a tarefa. */}
      {selectedDate && (
        <AddTaskDialog
          calendarId={calendar.id}
          date={selectedDate}
          open={addTaskOpen}
          onOpenChange={setAddTaskOpen}
        />
      )}
    </div>
  );
}
