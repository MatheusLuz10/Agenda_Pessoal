import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { TaskListItem } from "@/components/tasks/TaskListItem";
import { useAgenda } from "@/contexts/AgendaContext";
import { getTaskTimeStatus } from "@/lib/date";
import { ListChecks } from "lucide-react";

// Tela "/tarefas" — lista plana de TODAS as tarefas, com abas para
// filtrar por calendário ("todos" mostra tudo). Diferente da Home, aqui
// não há limite de quantidade nem janela de tempo.
export function TasksPage() {
  const { tasks, calendars } = useAgenda();
  const [calendarFilter, setCalendarFilter] = useState<string>("todos");

  // Filtra pelo calendário escolhido na aba e ordena por urgência:
  // vencidas primeiro, depois hoje, depois futuras, concluídas no final.
  const filteredTasks = useMemo(() => {
    const filtered =
      calendarFilter === "todos" ? tasks : tasks.filter((t) => t.calendarId === calendarFilter);

    return [...filtered].sort((a, b) => {
      const statusA = getTaskTimeStatus(a);
      const statusB = getTaskTimeStatus(b);
      const order = { vencida: 0, hoje: 1, futura: 2, concluida: 3 };
      if (order[statusA] !== order[statusB]) return order[statusA] - order[statusB];
      return a.date.localeCompare(b.date);
    });
  }, [tasks, calendarFilter]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tarefas</h1>
        <p className="text-sm text-muted-foreground">
          Todas as tarefas de todos os calendários, em um só lugar.
        </p>
      </div>

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
  );
}
