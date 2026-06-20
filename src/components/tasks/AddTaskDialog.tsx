import * as React from "react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAgenda } from "@/contexts/AgendaContext";
import { formatDateBR } from "@/lib/date";
import type { Priority } from "@/types";

interface AddTaskDialogProps {
  calendarId: string;
  date: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Modal "controlado" (sempre recebe `open`/`onOpenChange` do componente
// pai — ver CalendarViewPage) para criar uma tarefa numa data e calendário
// específicos. Diferente do AddCalendarDialog, este não tem modo
// "não controlado" porque sempre precisa saber qual dia foi clicado.
export function AddTaskDialog({ calendarId, date, open, onOpenChange }: AddTaskDialogProps) {
  const { addTask } = useAgenda();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState<Priority>("media");
  const [observation, setObservation] = useState("");

  // Limpa o formulário para a próxima vez que o modal for aberto.
  function resetForm() {
    setTitle("");
    setDescription("");
    setTime("");
    setPriority("media");
    setObservation("");
  }

  // Cria a tarefa via contexto com a data/calendário recebidos por props
  // e os valores digitados no formulário, depois fecha o modal.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    addTask({
      calendarId,
      title: title.trim(),
      description: description || undefined,
      date,
      time: time || undefined,
      priority,
      observation: observation || undefined,
    });
    resetForm();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resetForm();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar Atividade</DialogTitle>
          <DialogDescription>{formatDateBR(date)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-title">Nome da atividade</Label>
            <Input
              id="task-title"
              placeholder="Ex: Entregar relatório"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-desc">Descrição</Label>
            <Textarea
              id="task-desc"
              placeholder="Detalhes da atividade..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-time">Horário</Label>
              <Input
                id="task-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-obs">Observação</Label>
            <Textarea
              id="task-obs"
              placeholder="Observações adicionais..."
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!title.trim()}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
