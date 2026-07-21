import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import {
  createExecutionHistoryEntry,
  fetchExecutionHistory,
  removeExecutionHistoryEntry,
  updateExecutionHistoryEntry,
} from "../services/ruleEngineApi";
import type { ExecutionHistoryEntry } from "../types";

// Histórico de atividades cronometradas (vida diária, vinculadas a uma
// categoria de prioridade) — a base de dados que o motor de decisão vai
// usar depois pra aprender o tempo médio de cada atividade. Sem Supabase
// configurado, fica só em memória (modo mock local).
export function useExecutionHistory() {
  const [entries, setEntries] = useState<ExecutionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    fetchExecutionHistory()
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  async function addEntry(entry: Omit<ExecutionHistoryEntry, "id">) {
    if (isSupabaseConfigured) {
      const created = await createExecutionHistoryEntry(entry);
      setEntries((prev) => [created, ...prev]);
    } else {
      setEntries((prev) => [{ ...entry, id: crypto.randomUUID() }, ...prev]);
    }
  }

  async function editEntry(id: string, entry: Omit<ExecutionHistoryEntry, "id">) {
    setEntries((prev) => prev.map((existing) => (existing.id === id ? { ...existing, ...entry } : existing)));
    if (isSupabaseConfigured) await updateExecutionHistoryEntry(id, entry);
  }

  async function deleteEntry(id: string) {
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    if (isSupabaseConfigured) await removeExecutionHistoryEntry(id);
  }

  async function deleteEntries(ids: string[]) {
    const idSet = new Set(ids);
    setEntries((prev) => prev.filter((entry) => !idSet.has(entry.id)));
    if (isSupabaseConfigured) await Promise.all(ids.map((id) => removeExecutionHistoryEntry(id)));
  }

  return { entries, loading, addEntry, editEntry, deleteEntry, deleteEntries };
}
