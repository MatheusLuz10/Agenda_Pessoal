import { useMemo } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  ListTodo,
  Wrench,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TaskListItem } from "@/components/tasks/TaskListItem";
import { useAgenda } from "@/contexts/AgendaContext";
import { getTaskTimeStatus, todayISO } from "@/lib/date";

// Tela "/meu-trabalho" — painel de rotina profissional: cartões de
// estatísticas (pendências, vencidas, hoje, prioridade alta), um
// checklist fixo e uma lista de "ferramentas" estáticas (não vêm do
// AgendaContext, são apenas conteúdo de exemplo da página).
export function WorkPage() {
  const { tasks } = useAgenda();
  const today = todayISO();

  // Contagens usadas nos 4 cartões de estatística no topo da página.
  const stats = useMemo(() => {
    const pending = tasks.filter((task) => task.status !== "concluida");
    const overdue = pending.filter((task) => getTaskTimeStatus(task) === "vencida");
    const todayTasks = pending.filter((task) => task.date === today);
    const highPriority = pending.filter((task) => task.priority === "alta");

    return {
      pending: pending.length,
      overdue: overdue.length,
      today: todayTasks.length,
      priority: highPriority.length,
    };
  }, [tasks, today]);

  // As 5 tarefas pendentes mais próximas, para a lista "Atividades técnicas".
  const routineTasks = useMemo(() => {
    return [...tasks]
      .filter((task) => task.status !== "concluida")
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.time ?? "").localeCompare(b.time ?? "");
      })
      .slice(0, 5);
  }, [tasks]);

  const checklist = [
    "Checar ferramentas e acessórios",
    "Confirmar materiais e peças",
    "Revisar ordem de serviço",
    "Atualizar registros técnicos",
    "Anotar observações da visita",
  ];

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
          Organize sua rotina técnica, prioridades e ferramentas.
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
              <ClipboardList className="size-4" />
              Checklist técnico
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {checklist.map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm">
                  <span className="mt-0.5 size-2 rounded-full bg-primary" />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

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
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BriefcaseBusiness className="size-4" />
              Atividades técnicas
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {routineTasks.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma atividade registrada.
              </p>
            ) : (
              routineTasks.map((task) => <TaskListItem key={task.id} task={task} />)
            )}
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
              Registrar falhas, peças trocadas, próximos passos e detalhes importantes da
              rotina.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
