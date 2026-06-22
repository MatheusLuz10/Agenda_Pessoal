import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Wallet, TrendingUp, TrendingDown, CalendarClock, Inbox } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthGrid } from "@/components/calendar/MonthGrid";
import { TaskListItem } from "@/components/tasks/TaskListItem";
import { useAgenda } from "@/contexts/AgendaContext";
import { useFinance } from "@/contexts/FinanceContext";
import { getTaskTimeStatus, nowInBrasilia, todayISO } from "@/lib/date";
import { calcBalance, filterByMonth, formatBRL, sumEntradas, sumSaidas } from "@/lib/finance";

// Tela "/" — visão geral: mini calendário do mês com marcadores de
// tarefas pendentes + lista de "Próximos Avisos" da semana atual,
// reunindo tarefas de TODOS os calendários (a única tela que faz isso),
// além de um resumo financeiro rápido (saldo, entradas/saídas do mês e
// a próxima conta a vencer).
export function HomePage() {
  const { tasks } = useAgenda();
  const { transactions } = useFinance();
  const navigate = useNavigate();
  const today = nowInBrasilia();
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

  // Marca também os dias com movimentação financeira (verde = entrada,
  // vermelho = saída, amarelo = os dois no mesmo dia), só no mês em
  // exibição no MonthGrid.
  const financeMarkedDates = useMemo(() => {
    const map: Record<string, "entrada" | "saida" | "ambos"> = {};
    for (const t of filterByMonth(transactions, year, month)) {
      const existing = map[t.date];
      const kind = t.type === "entrada" ? "entrada" : "saida";
      map[t.date] = !existing || existing === kind ? kind : "ambos";
    }
    return map;
  }, [transactions, year, month]);

  // Calcula as tarefas pendentes dentro da semana atual (segunda a
  // domingo), ordenadas por data/horário, limitando a 3 para não poluir
  // a tela inicial.
  const upcomingTasks = useMemo(() => {
    // "T00:00:00" (sem "Z") faz o JS interpretar a data como horário
    // local em vez de UTC — sem isso, dispositivos em fusos atrás de UTC
    // (como o de Brasília) calculam a "segunda-feira" um dia adiantada.
    const start = new Date(`${todayISO()}T00:00:00`);
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

  // Resumo financeiro do widget: saldo acumulado, entradas/saídas do mês
  // atual e a próxima saída com data igual ou posterior a hoje.
  const financeSummary = useMemo(() => {
    const thisMonth = filterByMonth(transactions, today.getFullYear(), today.getMonth());
    const nextBill = transactions
      .filter((t) => t.type === "saida" && t.date >= todayISO())
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    return {
      balance: calcBalance(transactions),
      entradas: sumEntradas(thisMonth),
      saidas: sumSaidas(thisMonth),
      nextBill,
    };
  }, [transactions]);

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceSummaryCard
          icon={<Wallet className="size-5" />}
          iconClassName="bg-primary/10 text-primary"
          label="Saldo Atual"
          value={formatBRL(financeSummary.balance)}
        />
        <FinanceSummaryCard
          icon={<TrendingUp className="size-5" />}
          iconClassName="bg-success/10 text-success"
          label="Entradas do Mês"
          value={formatBRL(financeSummary.entradas)}
        />
        <FinanceSummaryCard
          icon={<TrendingDown className="size-5" />}
          iconClassName="bg-destructive/10 text-destructive"
          label="Saídas do Mês"
          value={formatBRL(financeSummary.saidas)}
        />
        <FinanceSummaryCard
          icon={<CalendarClock className="size-5" />}
          iconClassName="bg-warning/15 text-warning"
          label="Próxima Conta a Vencer"
          value={
            financeSummary.nextBill
              ? `${financeSummary.nextBill.description} · ${formatBRL(financeSummary.nextBill.amount)}`
              : "Nenhuma"
          }
        />
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
            financeMarkedDates={financeMarkedDates}
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

function FinanceSummaryCard({
  icon,
  iconClassName,
  label,
  value,
}: {
  icon: ReactNode;
  iconClassName: string;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-5">
        <div className={`flex size-11 items-center justify-center rounded-xl ${iconClassName}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-sm font-semibold sm:text-base">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
