import { Clock, AlertCircle, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateBR, getTaskTimeStatus } from "@/lib/date";
import { useAgenda } from "@/contexts/AgendaContext";
import type { Task } from "@/types";

// Texto exibido para cada nível de prioridade.
const PRIORITY_LABEL: Record<Task["priority"], string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

interface TaskListItemProps {
  task: Task;
  showCalendarName?: boolean;
  onClick?: () => void;
}

// Card de uma única tarefa, reaproveitado em todas as telas que listam
// tarefas (Início, Tarefas, Meu trabalho, dentro de um calendário). A cor
// de fundo/borda muda de acordo com `getTaskTimeStatus` (vencida = vermelho,
// hoje = amarelo, concluída = verde), atendendo à regra de destaque visual.
export function TaskListItem({ task, showCalendarName = false, onClick }: TaskListItemProps) {
  const { toggleTaskStatus, deleteTask, getCalendarById } = useAgenda();
  const timeStatus = getTaskTimeStatus(task);
  const calendar = getCalendarById(task.calendarId);

  const statusStyles: Record<typeof timeStatus, string> = {
    concluida: "border-success/30 bg-success/5",
    vencida: "border-destructive/40 bg-destructive/5",
    hoje: "border-warning/40 bg-warning/10",
    futura: "border-border bg-card",
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3 transition-colors",
        onClick && "cursor-pointer hover:border-primary/40",
        statusStyles[timeStatus]
      )}
    >
      {/* `onClick` com stopPropagation evita que marcar a checkbox também
          acione o onClick do card (que normalmente navega para outra tela). */}
      <Checkbox
        checked={task.status === "concluida"}
        onCheckedChange={() => toggleTaskStatus(task.id)}
        onClick={(e) => e.stopPropagation()}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {showCalendarName && calendar && (
            <span className="text-xs text-muted-foreground">
              {calendar.icon} {calendar.name}
            </span>
          )}
          {/* Mesmo motivo do Checkbox: stopPropagation para não disparar
              a navegação do card ao excluir a tarefa. */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm("Excluir esta atividade?")) {
                deleteTask(task.id);
              }
            }}
            aria-label="Excluir atividade"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
        <p
          className={cn(
            "text-sm font-medium",
            task.status === "concluida" && "text-muted-foreground line-through"
          )}
        >
          {task.title}
        </p>
        {task.description && (
          <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            {timeStatus === "vencida" && <AlertCircle className="size-3.5 text-destructive" />}
            {formatDateBR(task.date)}
          </span>
          {task.time && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {task.time}
            </span>
          )}
          <Badge
            variant={
              task.priority === "alta"
                ? "destructive"
                : task.priority === "media"
                ? "warning"
                : "secondary"
            }
          >
            {PRIORITY_LABEL[task.priority]}
          </Badge>
          {timeStatus === "vencida" && <Badge variant="destructive">Vencida</Badge>}
          {timeStatus === "hoje" && <Badge variant="warning">Hoje</Badge>}
          {timeStatus === "concluida" && <Badge variant="success">Concluída</Badge>}
        </div>
      </div>
    </div>
  );
}
