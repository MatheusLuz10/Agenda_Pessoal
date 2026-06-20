import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { TaskListItem } from "@/components/tasks/TaskListItem";
import { useAgenda } from "@/contexts/AgendaContext";
import { getTaskTimeStatus, todayISO } from "@/lib/date";
import { Inbox } from "lucide-react";

// Tela "/" — visão geral: mini calendário do mês com marcadores de
// tarefas pendentes + lista de "Próximos Avisos" da semana atual,
// reunindo tarefas de TODOS os calendários (a única tela que faz isso).
export function HomePage() {
  const { tasks } = useAgenda();
  const navigate = useNavigate();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const generalTasks = useMemo(
    () => tasks.filter((task) => task.calendarId !== "work-private"),
    [tasks]
  );

  // Agrupa as tarefas pendentes por data, para o MonthGrid saber em quais
  // dias desenhar a bolinha indicadora (e se algum dia tem atraso).
  const markedDates = useMemo(() => {
    const map: Record<string, { count: number; hasOverdue?: boolean }> = {};
    for (const task of generalTasks) {
      if (task.status === "concluida") continue;
      const existing = map[task.date] ?? { count: 0 };
      existing.count += 1;
      if (getTaskTimeStatus(task) === "vencida") existing.hasOverdue = true;
      map[task.date] = existing;
    }
    return map;
  }, [generalTasks]);

  // Calcula as tarefas pendentes dentro da semana atual (segunda a
  // domingo), ordenadas por data/horário, limitando a 3 para não poluir
  // a tela inicial.
  const upcomingTasks = useMemo(() => {
    const start = new Date(todayISO());
    const day = start.getDay();
    // Ajusta para a segunda-feira da semana atual (getDay() retorna 0
    // para domingo, por isso o caso especial).
    const diff = day === 0 ? -6 : 1 - day;
    start.setDate(start.getDate() + diff);
    start.setHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setDate(end.getDate() + 6); // domingo da mesma semana
    end.setHours(23, 59, 59, 999);

    return generalTasks
      .filter((t) => t.status !== "concluida")
      .filter((t) => {
        const taskDate = new Date(`${t.date}T00:00:00`);
        return taskDate >= start && taskDate <= end;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.time ?? "").localeCompare(b.time ?? "");
      })
      .slice(0, 3);
  }, [generalTasks]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Olá! 👋</h1>
        <p className="text-sm text-muted-foreground">
          Hoje é {new Date(todayISO() + "T00:00:00").toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          })}
        </p>
      </div>

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
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Próximos Avisos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {upcomingTasks.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
              <Inbox className="size-8" />
              <p className="text-sm">Nenhum compromisso por aqui.</p>
            </div>
          ) : (
            upcomingTasks.map((task) => (
              // Ao clicar, navega para o calendário da tarefa já com a
              // data selecionada via query param (?date=...), lido pela
              // CalendarViewPage.
              <TaskListItem
                key={task.id}
                task={task}
                showCalendarName
                onClick={() => navigate(`/calendarios/${task.calendarId}?date=${task.date}`)}
              />
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
