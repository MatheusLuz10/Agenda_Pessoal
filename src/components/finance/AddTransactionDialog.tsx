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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFinance } from "@/contexts/FinanceContext";
import { TRANSACTION_CATEGORIES } from "@/types";
import type { RecurrenceFrequency, TransactionCategory, TransactionType } from "@/types";
import { todayISO } from "@/lib/date";

interface AddTransactionDialogProps {
  trigger?: React.ReactNode;
}

// Formulário da atividade especial "💰 Conta": um lançamento financeiro
// de entrada ou saída, com categoria e recorrência opcional. Sempre
// "não controlado" (abre/fecha pelo próprio trigger) porque, diferente
// do AddTaskDialog, não depende de um dia previamente selecionado no
// calendário — qualquer data é digitada no próprio formulário.
export function AddTransactionDialog({ trigger }: AddTransactionDialogProps) {
  const { addTransaction } = useFinance();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TransactionType>("saida");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [category, setCategory] = useState<TransactionCategory>("Outros");
  const [observation, setObservation] = useState("");
  const [recurrent, setRecurrent] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<RecurrenceFrequency>("mensal");

  function resetForm() {
    setType("saida");
    setDescription("");
    setAmount("");
    setDate(todayISO());
    setCategory("Outros");
    setObservation("");
    setRecurrent(false);
    setRecurrenceFrequency("mensal");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numericAmount = Number(amount.replace(",", "."));
    if (!description.trim() || !numericAmount || numericAmount <= 0) return;

    addTransaction({
      type,
      description: description.trim(),
      amount: numericAmount,
      category,
      date,
      observation: observation || undefined,
      recurrent,
      recurrenceFrequency: recurrent ? recurrenceFrequency : undefined,
    });
    resetForm();
    setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>💰 Nova Conta</DialogTitle>
          <DialogDescription>Registre uma entrada ou saída financeira.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Tipo da movimentação</Label>
            <Select value={type} onValueChange={(v) => setType(v as TransactionType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="entrada">🟢 Entrada</SelectItem>
                <SelectItem value="saida">🔴 Saída</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tx-desc">Descrição</Label>
            <Input
              id="tx-desc"
              placeholder="Ex: Conta de luz"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tx-amount">Valor (R$)</Label>
              <Input
                id="tx-amount"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tx-date">Data</Label>
              <Input id="tx-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as TransactionCategory)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRANSACTION_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tx-obs">Observações (opcional)</Label>
            <Textarea
              id="tx-obs"
              placeholder="Observações adicionais..."
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Recorrente</Label>
              <Select
                value={recurrent ? "sim" : "nao"}
                onValueChange={(v) => setRecurrent(v === "sim")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nao">Não</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {recurrent && (
              <div className="flex flex-col gap-1.5">
                <Label>Frequência</Label>
                <Select
                  value={recurrenceFrequency}
                  onValueChange={(v) => setRecurrenceFrequency(v as RecurrenceFrequency)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!description.trim() || !amount}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
