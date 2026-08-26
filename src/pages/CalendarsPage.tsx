import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, ListChecks, Plus, Trash2, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AddCalendarDialog } from "@/components/calendar/AddCalendarDialog";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { TaskListItem } from "@/components/tasks/TaskListItem";
import { BIRTHDAY_CALENDAR_NAME, useAgenda } from "@/contexts/AgendaContext";
import { formatDateBR, getTaskTimeStatus, todayISO } from "@/lib/date";

// Tela "/calendarios" — lista de calendários em cima, calendário mensal
// (com todas as tarefas de todos os calendários) logo abaixo, e a lista
// de tarefas por último. Clicar num card de calendário ainda abre o
// calendário individual; o botão de lixeira exclui o calendário em
// cascata (ver AgendaContext.deleteCalendar).
export function CalendarsPage() {
  const { calendars, tasks, getTasksByCalendar, getCalendarById, deleteCalendar } = useAgenda();
  const navigate = useNavigate();
  const [isCalendarsOpen, setIsCalendarsOpen] = useState(false);
  const [isCompletedTasksOpen, setIsCompletedTasksOpen] = useState(false);
  const [gridYear, setGridYear] = useState(Number(todayISO().slice(0, 4)));
  const [gridMonth, setGridMonth] = useState(Number(todayISO().slice(5, 7)) - 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const visibleTasks = useMemo(
    () => tasks.filter((task) => task.calendarId !== "work-private"),
    [tasks]
  );

  const filteredTasks = useMemo(() => {
    return [...visibleTasks].sort((a, b) => {
      const statusA = getTaskTimeStatus(a);
      const statusB = getTaskTimeStatus(b);
      const order = { vencida: 0, hoje: 1, futura: 2, concluida: 3 };
      if (order[statusA] !== order[statusB]) return order[statusA] - order[statusB];
      return a.date.localeCompare(b.date);
    });
  }, [visibleTasks]);

  // Dias marcados na grade, com base em todas as tarefas de todos os
  // calendários (não há mais filtro por calendário nesta tela).
  // Aniversário não tem "vencido" (é lembrete, não tarefa com prazo — ver
  // TaskListItem), então essas tarefas nunca acendem a bolinha vermelha.
  const markedDates = useMemo(() => {
    const map: Record<string, { count: number; hasOverdue?: boolean }> = {};
    for (const task of filteredTasks) {
      if (task.status === "concluida") continue;
      const existing = map[task.date] ?? { count: 0 };
      existing.count += 1;
      const isBirthdayTask = getCalendarById(task.calendarId)?.name === BIRTHDAY_CALENDAR_NAME;
      if (!isBirthdayTask && getTaskTimeStatus(task) === "vencida") existing.hasOverdue = true;
      map[task.date] = existing;
    }
    return map;
  }, [filteredTasks, getCalendarById]);

  // Clicar num dia da grade estreita a lista pra só aquela data; clicar
  // de novo no mesmo dia (ou no botão de limpar) volta a mostrar todas.
  const dateFilteredTasks = useMemo(
    () => (selectedDate ? filteredTasks.filter((t) => t.date === selectedDate) : filteredTasks),
    [filteredTasks, selectedDate]
  );

  // Concluídas ficam escondidas por padrão (ver isCompletedTasksOpen) —
  // só pendentes aparecem direto na lista.
  const pendingFilteredTasks = useMemo(
    () => dateFilteredTasks.filter((t) => t.status !== "concluida"),
    [dateFilteredTasks]
  );
  const completedFilteredTasks = useMemo(
    () => dateFilteredTasks.filter((t) => t.status === "concluida"),
    [dateFilteredTasks]
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AGENDA</h1>
        <p className="text-sm text-muted-foreground">
          Cada calendário é independente, com suas próprias tarefas.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setIsCalendarsOpen((prev) => !prev)}
            className="flex items-center gap-2 text-lg font-semibold"
            aria-expanded={isCalendarsOpen}
          >
            Meus calendários
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {calendars.length}
            </span>
            {isCalendarsOpen ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </button>
          <AddCalendarDialog
            trigger={
              <Button size="sm" className="gap-1.5">
                <Plus className="size-4" />
                Novo
              </Button>
            }
          />
        </div>

        {isCalendarsOpen && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {calendars.map((calendar) => {
            const calendarTasks = getTasksByCalendar(calendar.id);
            const pending = calendarTasks.filter((t) => t.status === "pendente").length;

            return (
              <Card
                key={calendar.id}
                className="cursor-pointer transition-shadow hover:shadow-md"
                onClick={() => navigate(`/calendarios/${calendar.id}`)}
              >
                <CardContent className="flex items-center gap-3 pt-5">
                  <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-2xl text-foreground">
                    {calendar.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{calendar.name}</p>
                    {calendar.observation && (
                      <p className="truncate text-xs text-muted-foreground">
                        {calendar.observation}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-foreground">
                      {pending} pend.
                    </Badge>
                    {/* O calendário "Aniversário" é fixo — nunca pode ser
                        excluído pela UI (ver BIRTHDAY_CALENDAR_NAME em
                        AgendaContext, que também garante que ele sempre
                        exista). stopPropagation nos demais: sem isso,
                        excluir também acionaria o onClick do Card
                        (navegar para o calendário). */}
                    {calendar.name !== BIRTHDAY_CALENDAR_NAME && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm("Excluir este calendário e todas as atividades vinculadas?")) {
                            deleteCalendar(calendar.id);
                          }
                        }}
                        aria-label="Excluir calendário"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        )}
      </div>

      <Card>
        <CardContent className="pt-5">
          <MonthGrid
            year={gridYear}
            month={gridMonth}
            onMonthChange={(y, m) => {
              setGridYear(y);
              setGridMonth(m);
            }}
            markedDates={markedDates}
            selectedDate={selectedDate}
            onSelectDate={(iso) => setSelectedDate((prev) => (prev === iso ? null : iso))}
          />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Tarefas</h2>

        {selectedDate && (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2 text-sm">
            <span>
              Mostrando tarefas de <strong>{formatDateBR(selectedDate)}</strong>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-muted-foreground"
              onClick={() => setSelectedDate(null)}
            >
              <X className="size-3.5" />
              Ver todas
            </Button>
          </div>
        )}

        <Card>
          <CardContent className="flex flex-col gap-2 pt-5">
            {dateFilteredTasks.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                <ListChecks className="size-8" />
                <p className="text-sm">
                  {selectedDate
                    ? `Nenhuma tarefa para ${formatDateBR(selectedDate)}.`
                    : "Nenhuma tarefa encontrada."}
                </p>
              </div>
            ) : (
              <>
                {pendingFilteredTasks.length === 0 ? (
                  <p className="py-2 text-center text-sm text-muted-foreground">Nenhuma tarefa pendente.</p>
                ) : (
                  pendingFilteredTasks.map((task) => (
                    <TaskListItem key={task.id} task={task} showCalendarName />
                  ))
                )}

                {completedFilteredTasks.length > 0 && (
                  <div className="mt-1 flex flex-col gap-2 border-t border-border pt-2">
                    <button
                      type="button"
                      onClick={() => setIsCompletedTasksOpen((prev) => !prev)}
                      className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-left text-sm font-medium"
                      aria-expanded={isCompletedTasksOpen}
                    >
                      Tarefas concluídas
                      <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                        {completedFilteredTasks.length}
                        {isCompletedTasksOpen ? (
                          <ChevronUp className="size-3.5" />
                        ) : (
                          <ChevronDown className="size-3.5" />
                        )}
                      </span>
                    </button>
                    {isCompletedTasksOpen &&
                      completedFilteredTasks.map((task) => (
                        <TaskListItem key={task.id} task={task} showCalendarName />
                      ))}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
