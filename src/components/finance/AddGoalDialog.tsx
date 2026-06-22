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
import { useFinance } from "@/contexts/FinanceContext";

interface AddGoalDialogProps {
  trigger: React.ReactNode;
}

// Modal de criação de uma meta de economia (nome, valor objetivo e
// quanto já foi guardado até agora).
export function AddGoalDialog({ trigger }: AddGoalDialogProps) {
  const { addGoal } = useFinance();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [savedAmount, setSavedAmount] = useState("");

  function resetForm() {
    setName("");
    setTargetAmount("");
    setSavedAmount("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const target = Number(targetAmount.replace(",", "."));
    const saved = Number(savedAmount.replace(",", ".") || "0");
    if (!name.trim() || !target || target <= 0) return;

    addGoal({ name: name.trim(), targetAmount: target, savedAmount: saved });
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
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>🎯 Nova Meta</DialogTitle>
          <DialogDescription>Defina um objetivo e acompanhe seu progresso.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-name">Nome da meta</Label>
            <Input
              id="goal-name"
              placeholder="Ex: Notebook novo"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-target">Valor objetivo (R$)</Label>
              <Input
                id="goal-target"
                inputMode="decimal"
                placeholder="5000"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-saved">Já guardado (R$)</Label>
              <Input
                id="goal-saved"
                inputMode="decimal"
                placeholder="0"
                value={savedAmount}
                onChange={(e) => setSavedAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!name.trim() || !targetAmount}>
              Criar Meta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
