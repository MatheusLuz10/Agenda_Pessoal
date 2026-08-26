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
import { BIRTHDAY_CALENDAR_NAME, useAgenda } from "@/contexts/AgendaContext";
import { addMonths, birthdayInYear, calculateAge, formatDateBR, todayISO } from "@/lib/date";
import type { Priority, Task } from "@/types";

// Quantos anos de uma vez a opção "Aniversário" cria. Não é uma
// recorrência de verdade (essas tarefas são independentes entre si) —
// é só grande o suficiente pra, na prática, não precisar mexer nisso de
// novo tão cedo.
const ANIVERSARIO_YEARS = 40;

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
  const { addTask, updateTask, getCalendarById } = useAgenda();
  const isEditing = Boolean(task);
  // O calendário "Aniversário" (fixo, ver BIRTHDAY_CALENDAR_NAME) usa um
  // formulário diferente: nome da pessoa + data de nascimento (com idade
  // calculada) + observações sobre ela, sem horário/prioridade/descrição
  // (que não fazem sentido pra esse caso) — e sempre repete todo ano
  // sozinho, sem precisar escolher isso na tela.
  const isBirthdayCalendar = getCalendarById(calendarId)?.name === BIRTHDAY_CALENDAR_NAME;
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskDate, setTaskDate] = useState(date);
  const [time, setTime] = useState("");
  const [priority, setPriority] = useState<Priority>("media");
  const [observation, setObservation] = useState("");
  // "nenhuma" = tarefa única. "mensal" cria N tarefas independentes
  // (sem vínculo entre si — editar/excluir uma não afeta as outras),
  // uma por mês, com N escolhido pelo usuário. "aniversario" é fixo: não
  // pergunta "quantos anos" — já cria ANIVERSARIO_YEARS anos de uma vez,
  // pra funcionar como "todo ano, indefinidamente" sem precisar voltar
  // aqui depois. addMonths(..., 12) já trata o dia 29/02 em anos não
  // bissextos, virando 28/02.
  const [repeatFrequency, setRepeatFrequency] = useState<"nenhuma" | "mensal" | "aniversario">("nenhuma");
  const [repeatCount, setRepeatCount] = useState("2");

  // Limpa o formulário para a próxima vez que o modal for aberto, ou
  // preenche com os dados da tarefa sendo editada.
  function resetForm() {
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setTaskDate(task?.date ?? date);
    setTime(task?.time ?? "");
    setPriority(task?.priority ?? "media");
    setObservation(task?.observation ?? "");
    setRepeatFrequency("nenhuma");
    setRepeatCount("2");
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
      });
    } else if (isBirthdayCalendar) {
      // Ao contrário da repetição genérica (que soma anos a partir da
      // própria data digitada), aqui as ocorrências começam no aniversário
      // deste ano (ou no ano que vem, se o deste ano já passou) — não faz
      // sentido criar lembretes pra aniversários que já ficaram no
      // passado, mesmo que a pessoa tenha nascido décadas atrás. A idade
      // de cada ocorrência é calculada e guardada (campo `description`)
      // na hora da criação, já que cada tarefa é independente das outras
      // e não haveria como recalcular depois sem saber o ano de
      // nascimento original.
      const birthYear = Number(taskDate.slice(0, 4));
      const currentYear = Number(todayISO().slice(0, 4));
      const firstYear = birthdayInYear(taskDate, currentYear) >= todayISO() ? currentYear : currentYear + 1;
      for (let i = 0; i < ANIVERSARIO_YEARS; i++) {
        const occurrenceYear = firstYear + i;
        addTask({
          calendarId,
          title: title.trim(),
          description: `${occurrenceYear - birthYear} anos`,
          date: birthdayInYear(taskDate, occurrenceYear),
          priority: "baixa",
          observation: observation || undefined,
        });
      }
    } else {
      const occurrences =
        repeatFrequency === "nenhuma"
          ? 1
          : repeatFrequency === "aniversario"
          ? ANIVERSARIO_YEARS
          : Math.max(1, Number(repeatCount) || 1);
      const stepMonths = repeatFrequency === "aniversario" ? 12 : 1;
      for (let i = 0; i < occurrences; i++) {
        addTask({
          calendarId,
          title: title.trim(),
          description: description || undefined,
          date: i === 0 ? taskDate : addMonths(taskDate, i * stepMonths),
          time: time || undefined,
          priority,
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
          <DialogTitle>
            {isBirthdayCalendar
              ? isEditing
                ? "Editar aniversário"
                : "Adicionar aniversário"
              : isEditing
              ? "Editar Atividade"
              : "Adicionar Atividade"}
          </DialogTitle>
          {!isEditing && !isBirthdayCalendar && <DialogDescription>{formatDateBR(date)}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-title">{isBirthdayCalendar ? "Nome da pessoa" : "Nome da atividade"}</Label>
            <Input
              id="task-title"
              placeholder={isBirthdayCalendar ? "Ex: Ana Paula" : "Ex: Entregar relatório"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
            />
          </div>

          {!isBirthdayCalendar && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-desc">Descrição</Label>
              <Textarea
                id="task-desc"
                placeholder="Detalhes da atividade..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          )}

          {isBirthdayCalendar ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-date">Data de nascimento</Label>
              <Input
                id="task-date"
                type="date"
                value={taskDate}
                onChange={(e) => setTaskDate(e.target.value)}
              />
              {taskDate && (
                <p className="text-xs text-muted-foreground">Vai fazer {calculateAge(taskDate)} anos no próximo aniversário.</p>
              )}
            </div>
          ) : (
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
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-obs">{isBirthdayCalendar ? "Observações sobre a pessoa" : "Observação"}</Label>
            <Textarea
              id="task-obs"
              placeholder={
                isBirthdayCalendar
                  ? "Ex: ideias de presente, telefone, como se conheceram..."
                  : "Observações adicionais..."
              }
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
            />
          </div>

          {!isEditing && isBirthdayCalendar && (
            <p className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              Esse calendário é feito pra aniversários: ao salvar, criamos um lembrete por ano a partir do próximo
              aniversário, pelos próximos {ANIVERSARIO_YEARS} anos — não precisa configurar nada.
            </p>
          )}

          {!isEditing && !isBirthdayCalendar && (
            <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
              <Label htmlFor="task-repeat">Repetir</Label>
              <Select
                value={repeatFrequency}
                onValueChange={(v) => setRepeatFrequency(v as typeof repeatFrequency)}
              >
                <SelectTrigger id="task-repeat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Não repetir</SelectItem>
                  <SelectItem value="mensal">Todo mês</SelectItem>
                  <SelectItem value="aniversario">Aniversário (todo ano)</SelectItem>
                </SelectContent>
              </Select>

              {repeatFrequency === "mensal" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="task-repeat-count">Por quantos meses</Label>
                  <Input
                    id="task-repeat-count"
                    type="number"
                    min={2}
                    max={24}
                    className="w-24"
                    value={repeatCount}
                    onChange={(e) => setRepeatCount(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Cria uma atividade por mês, no mesmo dia, começando em {formatDateBR(taskDate)}.
                  </p>
                </div>
              )}

              {repeatFrequency === "aniversario" && (
                <p className="text-xs text-muted-foreground">
                  Cria uma atividade por ano, no mesmo dia, pelos próximos {ANIVERSARIO_YEARS} anos a partir de{" "}
                  {formatDateBR(taskDate)} — não precisa mexer nisso de novo.
                </p>
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
