import { supabase } from "@/lib/supabaseClient";
import type { Goal, Transaction } from "@/types";

// Mesma ideia de src/data/supabaseApi.ts: isola o formato das tabelas do
// Postgres (snake_case) do formato usado no app (camelCase).

interface TransactionRow {
  id: string;
  type: Transaction["type"];
  description: string;
  amount: number;
  category: Transaction["category"];
  date: string;
  observation: string | null;
  recurrent: boolean;
  recurrence_frequency: Transaction["recurrenceFrequency"] | null;
  created_at: string;
}

interface GoalRow {
  id: string;
  name: string;
  target_amount: number;
  saved_amount: number;
  created_at: string;
}

function rowToTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    type: row.type,
    description: row.description,
    amount: Number(row.amount),
    category: row.category,
    date: row.date,
    observation: row.observation ?? undefined,
    recurrent: row.recurrent,
    recurrenceFrequency: row.recurrence_frequency ?? undefined,
    createdAt: row.created_at,
  };
}

function rowToGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    name: row.name,
    targetAmount: Number(row.target_amount),
    savedAmount: Number(row.saved_amount),
    createdAt: row.created_at,
  };
}

export async function fetchTransactions(): Promise<Transaction[]> {
  const { data, error } = await supabase!
    .from("transactions")
    .select("*")
    .order("date", { ascending: false });
  if (error) throw error;
  return (data as TransactionRow[]).map(rowToTransaction);
}

export async function fetchGoals(): Promise<Goal[]> {
  const { data, error } = await supabase!
    .from("goals")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as GoalRow[]).map(rowToGoal);
}

export async function createTransaction(
  transaction: Omit<Transaction, "id" | "createdAt">
): Promise<Transaction> {
  const { data, error } = await supabase!
    .from("transactions")
    .insert({
      type: transaction.type,
      description: transaction.description,
      amount: transaction.amount,
      category: transaction.category,
      date: transaction.date,
      observation: transaction.observation ?? null,
      recurrent: transaction.recurrent,
      recurrence_frequency: transaction.recurrenceFrequency ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToTransaction(data as TransactionRow);
}

export async function removeTransaction(transactionId: string) {
  const { error } = await supabase!.from("transactions").delete().eq("id", transactionId);
  if (error) throw error;
}

export async function createGoal(goal: Omit<Goal, "id" | "createdAt">): Promise<Goal> {
  const { data, error } = await supabase!
    .from("goals")
    .insert({
      name: goal.name,
      target_amount: goal.targetAmount,
      saved_amount: goal.savedAmount,
    })
    .select()
    .single();
  if (error) throw error;
  return rowToGoal(data as GoalRow);
}

export async function updateGoalSavedAmount(goalId: string, savedAmount: number) {
  const { error } = await supabase!
    .from("goals")
    .update({ saved_amount: savedAmount })
    .eq("id", goalId);
  if (error) throw error;
}

export async function removeGoal(goalId: string) {
  const { error } = await supabase!.from("goals").delete().eq("id", goalId);
  if (error) throw error;
}
