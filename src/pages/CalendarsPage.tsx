import { useNavigate } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AddCalendarDialog } from "@/components/calendar/AddCalendarDialog";
import { useAgenda } from "@/contexts/AgendaContext";

// Tela "/calendarios" — lista todos os calendários criados como cards.
// Clicar num card abre o calendário individual; o botão de lixeira exclui
// o calendário e, em cascata, todas as tarefas vinculadas a ele
// (ver AgendaContext.deleteCalendar).
export function CalendarsPage() {
  const { calendars, getTasksByCalendar, deleteCalendar } = useAgenda();
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Calendários</h1>
          <p className="text-sm text-muted-foreground">
            Cada calendário é independente, com suas próprias tarefas.
          </p>
        </div>
        <AddCalendarDialog
          trigger={
            <Button size="sm" className="gap-1.5">
              <Plus className="size-4" />
              Novo
            </Button>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
    </div>
  );
}
