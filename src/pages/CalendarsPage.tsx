import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, ListChecks, Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddCalendarDialog } from "@/components/calendar/AddCalendarDialog";
import { TaskListItem } from "@/components/tasks/TaskListItem";
import { useAgenda } from "@/contexts/AgendaContext";
import { getTaskTimeStatus } from "@/lib/date";

// Tela "/calendarios" — unifica a antiga lista de calendários com a antiga
// lista de tarefas ("/tarefas"): calendários à esquerda, tarefas filtráveis
// à direita. Clicar num card de calendário ainda abre o calendário
// individual; o botão de lixeira exclui o calendário em cascata (ver
// AgendaContext.deleteCalendar).
export function CalendarsPage() {
  const { calendars, tasks, getTasksByCalendar, deleteCalendar } = useAgenda();
  const navigate = useNavigate();
  const [calendarFilter, setCalendarFilter] = useState<string>("todos");
  const [isCalendarsOpen, setIsCalendarsOpen] = useState(false);

  const visibleTasks = useMemo(
    () => tasks.filter((task) => task.calendarId !== "work-private"),
    [tasks]
  );

  const filteredTasks = useMemo(() => {
    const filtered =
      calendarFilter === "todos"
        ? visibleTasks
        : visibleTasks.filter((t) => t.calendarId === calendarFilter);

    return [...filtered].sort((a, b) => {
      const statusA = getTaskTimeStatus(a);
      const statusB = getTaskTimeStatus(b);
      const order = { vencida: 0, hoje: 1, futura: 2, concluida: 3 };
      if (order[statusA] !== order[statusB]) return order[statusA] - order[statusB];
      return a.date.localeCompare(b.date);
    });
  }, [visibleTasks, calendarFilter]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Calendários</h1>
        <p className="text-sm text-muted-foreground">
          Cada calendário é independente, com suas próprias tarefas.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_1fr]">
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
                      {/* stopPropagation: sem isso, excluir também acionaria o
                          onClick do Card (navegar para o calendário). */}
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
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Tarefas</h2>

          <Tabs value={calendarFilter} onValueChange={setCalendarFilter}>
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="todos">Todos</TabsTrigger>
              {calendars.map((c) => (
                <TabsTrigger key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Card>
            <CardContent className="flex flex-col gap-2 pt-5">
              {filteredTasks.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
                  <ListChecks className="size-8" />
                  <p className="text-sm">Nenhuma tarefa encontrada.</p>
                </div>
              ) : (
                filteredTasks.map((task) => (
                  <TaskListItem key={task.id} task={task} showCalendarName />
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
