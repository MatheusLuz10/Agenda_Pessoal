import * as React from "react";
import { useState } from "react";
import {
  Dialog,
  DialogTrigger,
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
import { useAgenda } from "@/contexts/AgendaContext";

const ICON_OPTIONS = ["📚", "🐶", "💼", "💡", "🌿", "✈️", "🏠", "💪", "🎵", "🛒"];
const COLOR_OPTIONS = ["blue", "amber", "violet", "rose", "emerald", "cyan"];

interface AddCalendarDialogProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// Modal de criação de um novo calendário independente. Pode ser usado de
// duas formas: "não controlado" (gerencia seu próprio aberto/fechado,
// basta passar `trigger`) ou "controlado" (o componente pai decide quando
// abrir/fechar via props `open`/`onOpenChange`) — útil quando não há um
// botão de gatilho visível na tela.
export function AddCalendarDialog({ trigger, open, onOpenChange }: AddCalendarDialogProps) {
  const { addCalendar } = useAgenda();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState(ICON_OPTIONS[0]);
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [observation, setObservation] = useState("");
  const [internalOpen, setInternalOpen] = useState(false);

  // Se o pai passou `open`, este componente é "controlado": usamos o
  // estado e o setter recebidos por props em vez do estado interno.
  const isControlled = open !== undefined;
  const dialogOpen = isControlled ? open : internalOpen;
  const setDialogOpen = isControlled ? onOpenChange! : setInternalOpen;

  // Limpa todos os campos do formulário (chamado após salvar ou fechar).
  function resetForm() {
    setName("");
    setIcon(ICON_OPTIONS[0]);
    setColor(COLOR_OPTIONS[0]);
    setStartDate("");
    setEndDate("");
    setObservation("");
  }

  // Envia o formulário: valida que há um nome, cria o calendário via
  // contexto (addCalendar) e fecha o modal.
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    addCalendar({
      name: name.trim(),
      icon,
      color,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      observation: observation || undefined,
    });
    resetForm();
    setDialogOpen(false);
  }

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(next) => {
        setDialogOpen(next);
        if (!next) resetForm();
      }}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar novo calendário</DialogTitle>
          <DialogDescription>
            Cada calendário é independente e tem suas próprias tarefas.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cal-name">Nome do calendário</Label>
            <Input
              id="cal-name"
              placeholder="Ex: Faculdade, Pets, Contas..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Ícone</Label>
            <div className="flex flex-wrap gap-2">
              {ICON_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setIcon(opt)}
                  className={`flex size-9 items-center justify-center rounded-lg border text-lg transition-colors ${
                    icon === opt ? "border-primary bg-accent" : "border-border"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {COLOR_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setColor(opt)}
                  className={`size-7 rounded-full border-2 bg-${opt}-400 transition-transform ${
                    color === opt ? "scale-110 border-foreground" : "border-transparent"
                  }`}
                  style={{ backgroundColor: colorToHex(opt) }}
                  aria-label={opt}
                />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cal-start">Data Inicial</Label>
              <Input
                id="cal-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cal-end">Data Final</Label>
              <Input
                id="cal-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cal-obs">Observação</Label>
            <Textarea
              id="cal-obs"
              placeholder="Observações sobre este calendário..."
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!name.trim()}>
              Criar Calendário
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Converte o token de cor (ex: "blue") num valor hexadecimal real, usado
// no `style` inline da bolinha de seleção de cor (Tailwind não permite
// gerar classes dinâmicas como `bg-${color}-400` em tempo de execução).
function colorToHex(color: string): string {
  const map: Record<string, string> = {
    blue: "#60a5fa",
    amber: "#fbbf24",
    violet: "#a78bfa",
    rose: "#fb7185",
    emerald: "#34d399",
    cyan: "#22d3ee",
  };
  return map[color] ?? "#60a5fa";
}
