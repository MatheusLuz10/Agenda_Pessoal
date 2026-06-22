import { Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatBRL } from "@/lib/finance";
import { useFinance } from "@/contexts/FinanceContext";
import type { Goal } from "@/types";

interface GoalCardProps {
  goal: Goal;
}

// Card de uma meta de economia com barra de progresso automática
// (savedAmount / targetAmount), igual ao exemplo do pedido original
// ("Notebook Novo R$ 2.000 / R$ 5.000 — 40%").
export function GoalCard({ goal }: GoalCardProps) {
  const { deleteGoal } = useFinance();
  const progress = Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100));

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-5">
        <div className="flex items-start justify-between gap-2">
          <p className="font-medium">{goal.name}</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => {
              if (window.confirm("Excluir esta meta?")) deleteGoal(goal.id);
            }}
            aria-label="Excluir meta"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {formatBRL(goal.savedAmount)} / {formatBRL(goal.targetAmount)}
          </span>
          <span className="font-semibold text-primary">{progress}%</span>
        </div>
      </CardContent>
    </Card>
  );
}
