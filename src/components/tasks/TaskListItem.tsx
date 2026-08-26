import { useState } from "react";
import { Cake, ChevronDown, ChevronUp, Clock, AlertCircle, Pencil, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { calculateAge, formatDateBR, getTaskTimeStatus } from "@/lib/date";
import { BIRTHDAY_CALENDAR_NAME, useAgenda } from "@/contexts/AgendaContext";
import { AddTaskDialog } from "@/components/tasks/AddTaskDialog";
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
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isBirthdayRevealed, setIsBirthdayRevealed] = useState(false);
  const calendar = getCalendarById(task.calendarId);
  const isBirthday = calendar?.name === BIRTHDAY_CALENDAR_NAME;
  // Aniversário é um lembrete, não uma tarefa com prazo: nunca fica
  // "vencido" mesmo depois que a data passa (o próximo ano já tem sua
  // própria ocorrência) — só "hoje" continua valendo, pra destacar quem
  // faz aniversário hoje.
  const rawTimeStatus = getTaskTimeStatus(task);
  const timeStatus = isBirthday && rawTimeStatus === "vencida" ? "futura" : rawTimeStatus;

  const statusStyles: Record<typeof timeStatus, string> = {
    concluida: "border-success/30 bg-success/5",
    // Mais vermelho que os outros estados de propósito: é o caso mais
    // urgente (prazo já passou), então precisa saltar aos olhos mais que
    // "hoje" ou "futura".
    vencida: "border-destructive/70 bg-destructive/15",
    hoje: "border-warning/40 bg-warning/10",
    futura: "border-border bg-card",
  };

  return (
    <>
    <div
      onClick={() => {
        onClick?.();
        if (isBirthday) setIsBirthdayRevealed((prev) => !prev);
      }}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3 transition-colors",
        (onClick || isBirthday) && "cursor-pointer hover:border-primary/40",
        statusStyles[timeStatus]
      )}
    >
      {/* `onClick` com stopPropagation evita que marcar a checkbox também
          acione o onClick do card (que normalmente navega para outra tela).
          Aniversário não tem checkbox: é um lembrete, não uma tarefa que se
          conclui. */}
      {!isBirthday && (
        <Checkbox
          checked={task.status === "concluida"}
          onCheckedChange={() => toggleTaskStatus(task.id)}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {showCalendarName && calendar && (
            <span className="text-xs text-muted-foreground">
              {calendar.icon} {calendar.name}
            </span>
          )}
          {/* Mesmo motivo do Checkbox: stopPropagation para não disparar
              a navegação do card ao editar/excluir a tarefa. */}
          <div className="flex items-center gap-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                setIsEditOpen(true);
              }}
              aria-label="Editar atividade"
            >
              <Pencil className="size-3.5" />
            </Button>
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
        </div>
        <p
          className={cn(
            "text-sm font-medium",
            task.status === "concluida" && "text-muted-foreground line-through",
            timeStatus === "vencida" && "text-destructive"
          )}
        >
          {task.title}
        </p>
        {!isBirthday && task.description && (
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
          {isBirthday ? (
            <Badge variant="secondary">
              <Cake className="size-3" />
              Aniversário
              {isBirthdayRevealed ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            </Badge>
          ) : (
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
          )}
          {timeStatus === "vencida" && <Badge variant="destructive">Vencida</Badge>}
          {timeStatus === "hoje" && <Badge variant="warning">Hoje</Badge>}
          {timeStatus === "concluida" && <Badge variant="success">Concluída</Badge>}
        </div>
        {isBirthday && isBirthdayRevealed && (
          <div className="mt-2 rounded-lg bg-muted/40 p-2 text-xs">
            <p className="font-medium">Vai fazer {task.description || `${calculateAge(task.date)} anos`}</p>
            <p className="mt-1 text-muted-foreground">{task.observation || "Sem observações."}</p>
          </div>
        )}
      </div>
    </div>
    <AddTaskDialog
      calendarId={task.calendarId}
      date={task.date}
      task={task}
      open={isEditOpen}
      onOpenChange={setIsEditOpen}
    />
    </>
  );
}
