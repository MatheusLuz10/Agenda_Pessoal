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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAgenda } from "@/contexts/AgendaContext";
import { addMonths, formatDateBR } from "@/lib/date";
import type { Priority, Task } from "@/types";

// Paleta usada pra sortear a cor de uma etiqueta nova (sem precisar de
// um seletor de cor completo — só um ciclo simples de tons distintos).
const TAG_COLOR_PALETTE = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#64748b"];

interface AddTaskDialogProps {
  calendarId: string;
  date: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Quando informada, o modal entra em modo de edição: os campos vêm
  // preenchidos com os dados desta tarefa e o envio atualiza em vez de
  // criar uma nova.
  task?: Task;
}

// Modal "controlado" (sempre recebe `open`/`onOpenChange` do componente
// pai — ver CalendarViewPage) para criar ou editar uma tarefa. Diferente
// do AddCalendarDialog, este não tem modo "não controlado" porque sempre
// precisa saber qual dia/calendário (ou tarefa) está em jogo.
export function AddTaskDialog({ calendarId, date, open, onOpenChange, task }: AddTaskDialogProps) {
  const { addTask, updateTask, tags, addTag } = useAgenda();
  const isEditing = Boolean(task);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskDate, setTaskDate] = useState(date);
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState<Priority>("media");
  const [observation, setObservation] = useState("");
  const [repeatMonthly, setRepeatMonthly] = useState(false);
  const [repeatMonths, setRepeatMonths] = useState("2");
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [newTagName, setNewTagName] = useState("");

  // Limpa o formulário para a próxima vez que o modal for aberto, ou
  // preenche com os dados da tarefa sendo editada.
  function resetForm() {
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setTaskDate(task?.date ?? date);
    setTime(task?.time ?? "");
    setPriority(task?.priority ?? "media");
    setObservation(task?.observation ?? "");
    setRepeatMonthly(false);
    setRepeatMonths("2");
    setSelectedTagIds(task?.tags.map((tag) => tag.id) ?? []);
    setNewTagName("");
  }

  function toggleTag(tagId: string) {
    setSelectedTagIds((prev) => (prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId]));
  }

  // Cria a etiqueta e já espera o id final (real, do Supabase, quando
  // configurado) antes de selecionar — evita selecionar um id
  // temporário que deixa de existir assim que a resposta do servidor
  // chegar (ver comentário de addTag em AgendaContext).
  async function handleCreateTag() {
    const name = newTagName.trim();
    if (!name) return;
    const color = TAG_COLOR_PALETTE[tags.length % TAG_COLOR_PALETTE.length];
    const created = await addTag(name, color);
    setSelectedTagIds((prev) => [...prev, created.id]);
    setNewTagName("");
  }

  // Toda vez que o modal abrir (criação ou edição), garante que o
  // formulário reflita a tarefa atual em vez de manter valores antigos.
  React.useEffect(() => {
    if (open) resetForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task]);

  // Cria ou atualiza a tarefa via contexto, dependendo do modo do modal.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;

    if (isEditing && task) {
      updateTask(task.id, {
        title: title.trim(),
        description: description || undefined,
        date: taskDate,
        time: time || undefined,
        priority,
        observation: observation || undefined,
        tagIds: selectedTagIds,
      });
    } else {
      // "Repetir todo mês": cria uma tarefa independente por mês (mesmo
      // dia, ou o último dia do mês quando ele não existe — ex: 31/01 com
      // repetição vira 28 ou 29/02). São tarefas normais, sem vínculo
      // entre si — editar/excluir uma não afeta as outras.
      const occurrences = repeatMonthly ? Math.max(1, Number(repeatMonths) || 1) : 1;
      for (let i = 0; i < occurrences; i++) {
        addTask({
          calendarId,
          title: title.trim(),
          description: description || undefined,
          date: i === 0 ? taskDate : addMonths(taskDate, i),
          time: time || undefined,
          priority,
          tagIds: selectedTagIds,
          observation: observation || undefined,
        });
      }
    }
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
          <DialogTitle>{isEditing ? "Editar Atividade" : "Adicionar Atividade"}</DialogTitle>
          {!isEditing && <DialogDescription>{formatDateBR(date)}</DialogDescription>}
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
            {isEditing && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="task-date">Data</Label>
                <Input
                  id="task-date"
                  type="date"
                  value={taskDate}
                  onChange={(e) => setTaskDate(e.target.value)}
                />
              </div>
            )}
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

          <div className="flex flex-col gap-1.5">
            <Label>Etiquetas</Label>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => toggleTag(tag.id)}
                    className="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
                    style={
                      isSelected
                        ? { backgroundColor: tag.color, borderColor: tag.color, color: "#fff" }
                        : { borderColor: tag.color, color: tag.color }
                    }
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Nova etiqueta..."
                className="h-8 text-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateTag();
                  }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={handleCreateTag} disabled={!newTagName.trim()}>
                Adicionar
              </Button>
            </div>
          </div>

          {!isEditing && (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="task-repeat"
                  checked={repeatMonthly}
                  onCheckedChange={(v) => setRepeatMonthly(Boolean(v))}
                />
                <Label htmlFor="task-repeat" className="cursor-pointer font-normal">
                  Repetir todo mês
                </Label>
              </div>
              {repeatMonthly && (
                <div className="flex flex-col gap-1.5 pl-6">
                  <Label htmlFor="task-repeat-months">Por quantos meses</Label>
                  <Input
                    id="task-repeat-months"
                    type="number"
                    min={2}
                    max={24}
                    className="w-24"
                    value={repeatMonths}
                    onChange={(e) => setRepeatMonths(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Cria uma atividade por mês, no mesmo dia, começando em {formatDateBR(taskDate)}.
                  </p>
                </div>
              )}
            </div>
          )}

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
