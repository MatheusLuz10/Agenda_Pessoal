import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDateBR } from "@/lib/date";
import { formatBRL } from "@/lib/finance";
import { useFinance } from "@/contexts/FinanceContext";
import type { Transaction } from "@/types";

interface TransactionListItemProps {
  transaction: Transaction;
}

// Linha de uma movimentação financeira, usada nas listas de Receitas,
// Despesas e no widget da Home. O valor é colorido verde/vermelho
// conforme o tipo, igual aos exemplos do pedido original (🟢/🔴).
export function TransactionListItem({ transaction }: TransactionListItemProps) {
  const { deleteTransaction } = useFinance();
  const isEntrada = transaction.type === "entrada";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <span className="text-lg">{isEntrada ? "🟢" : "🔴"}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{transaction.description}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{formatDateBR(transaction.date)}</span>
          <Badge variant="outline">{transaction.category}</Badge>
          {transaction.recurrent && <Badge variant="secondary">Recorrente</Badge>}
        </div>
      </div>
      <span className={`text-sm font-semibold ${isEntrada ? "text-success" : "text-destructive"}`}>
        {isEntrada ? "+" : "-"} {formatBRL(transaction.amount)}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={() => {
          if (window.confirm("Excluir este lançamento?")) deleteTransaction(transaction.id);
        }}
        aria-label="Excluir lançamento"
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
