import * as React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Goal, Transaction } from "@/types";
import { mockGoals, mockTransactions } from "@/data/mockData";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { todayISO } from "@/lib/date";
import {
  createGoal,
  createTransaction,
  fetchGoals,
  fetchTransactions,
  removeGoal,
  removeTransaction,
  updateGoalSavedAmount,
} from "@/data/financeApi";

interface FinanceContextValue {
  transactions: Transaction[];
  goals: Goal[];
  loading: boolean;
  addTransaction: (transaction: Omit<Transaction, "id" | "createdAt">) => void;
  deleteTransaction: (transactionId: string) => void;
  addGoal: (goal: Omit<Goal, "id" | "createdAt">) => void;
  updateGoalSaved: (goalId: string, savedAmount: number) => void;
  deleteGoal: (goalId: string) => void;
}

const FinanceContext = createContext<FinanceContextValue | null>(null);

// Mesma estratégia do AgendaContext (ver comentários lá para mais
// detalhes): usa dados mockados quando o Supabase não está configurado,
// e sincroniza com o banco real (com atualização otimista) quando está.
// Fica separado do AgendaContext de propósito — calendários/tarefas e
// finanças são domínios independentes, então cada um tem seu próprio
// provider em vez de um único contexto gigante com tudo dentro.
export function FinanceProvider({ children }: { children: React.ReactNode }) {
  const [transactions, setTransactions] = useState<Transaction[]>(
    isSupabaseConfigured ? [] : mockTransactions
  );
  const [goals, setGoals] = useState<Goal[]>(isSupabaseConfigured ? [] : mockGoals);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let isMounted = true;
    Promise.all([fetchTransactions(), fetchGoals()])
      .then(([transactionsData, goalsData]) => {
        if (!isMounted) return;
        setTransactions(transactionsData);
        setGoals(goalsData);
      })
      .catch((error) => console.error("Falha ao carregar dados financeiros:", error))
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const addTransaction: FinanceContextValue["addTransaction"] = (transaction) => {
    const optimistic: Transaction = {
      ...transaction,
      id: `tx-${Date.now()}`,
      createdAt: todayISO(),
    };
    setTransactions((prev) => [...prev, optimistic]);

    if (isSupabaseConfigured) {
      createTransaction(transaction)
        .then((saved) => {
          setTransactions((prev) => prev.map((t) => (t.id === optimistic.id ? saved : t)));
        })
        .catch((error) => console.error("Falha ao criar lançamento:", error));
    }
  };

  const deleteTransaction = (transactionId: string) => {
    setTransactions((prev) => prev.filter((t) => t.id !== transactionId));

    if (isSupabaseConfigured) {
      removeTransaction(transactionId).catch((error) =>
        console.error("Falha ao excluir lançamento:", error)
      );
    }
  };

  const addGoal: FinanceContextValue["addGoal"] = (goal) => {
    const optimistic: Goal = {
      ...goal,
      id: `goal-${Date.now()}`,
      createdAt: todayISO(),
    };
    setGoals((prev) => [...prev, optimistic]);

    if (isSupabaseConfigured) {
      createGoal(goal)
        .then((saved) => {
          setGoals((prev) => prev.map((g) => (g.id === optimistic.id ? saved : g)));
        })
        .catch((error) => console.error("Falha ao criar meta:", error));
    }
  };

  const updateGoalSaved = (goalId: string, savedAmount: number) => {
    setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, savedAmount } : g)));

    if (isSupabaseConfigured) {
      updateGoalSavedAmount(goalId, savedAmount).catch((error) =>
        console.error("Falha ao atualizar meta:", error)
      );
    }
  };

  const deleteGoal = (goalId: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== goalId));

    if (isSupabaseConfigured) {
      removeGoal(goalId).catch((error) => console.error("Falha ao excluir meta:", error));
    }
  };

  const value = useMemo(
    () => ({
      transactions,
      goals,
      loading,
      addTransaction,
      deleteTransaction,
      addGoal,
      updateGoalSaved,
      deleteGoal,
    }),
    [transactions, goals, loading]
  );

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const ctx = useContext(FinanceContext);
  if (!ctx) throw new Error("useFinance deve ser usado dentro de FinanceProvider");
  return ctx;
}
