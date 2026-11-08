import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { BIRTHDAY_CALENDAR_NAME, useAgenda } from "@/contexts/AgendaContext";
import { getTaskTimeStatus, todayISO } from "@/lib/date";

// Tela "/calendarios" — só o calendário mensal, com as tarefas de todos os
// calendários marcadas nos dias. Não há mais lista de calendários (nem
// opção de criar calendário) nem lista de tarefas nesta tela.
export function CalendarsPage() {
  const { tasks, getCalendarById } = useAgenda();
  const [gridYear, setGridYear] = useState(Number(todayISO().slice(0, 4)));
  const [gridMonth, setGridMonth] = useState(Number(todayISO().slice(5, 7)) - 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Dias marcados na grade, com base em todas as tarefas de todos os
  // calendários. Aniversário não tem "vencido" (é lembrete, não tarefa com
  // prazo — ver TaskListItem), então essas tarefas nunca acendem a bolinha
  // vermelha.
  const markedDates = useMemo(() => {
    const map: Record<string, { count: number; hasOverdue?: boolean }> = {};
    for (const task of tasks) {
      if (task.calendarId === "work-private" || task.status === "concluida") continue;
      const existing = map[task.date] ?? { count: 0 };
      existing.count += 1;
      const isBirthdayTask = getCalendarById(task.calendarId)?.name === BIRTHDAY_CALENDAR_NAME;
      if (!isBirthdayTask && getTaskTimeStatus(task) === "vencida") existing.hasOverdue = true;
      map[task.date] = existing;
    }
    return map;
  }, [tasks, getCalendarById]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">AGENDA</h1>

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
    </div>
  );
}
