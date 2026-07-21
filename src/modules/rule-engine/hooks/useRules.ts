import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { createRule, fetchRules, removeRule, updateRule } from "../services/ruleEngineApi";
import type { Rule } from "../types";

// Regras de negócio cadastráveis que o motor de decisão vai usar (motor
// em si ainda não existe — só o cadastro por enquanto).
export function useRules() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    fetchRules()
      .then(setRules)
      .finally(() => setLoading(false));
  }, []);

  async function addRule(rule: Omit<Rule, "id" | "createdAt">) {
    if (isSupabaseConfigured) {
      const created = await createRule(rule);
      setRules((prev) => [created, ...prev]);
    } else {
      setRules((prev) => [{ ...rule, id: crypto.randomUUID(), createdAt: new Date().toISOString() }, ...prev]);
    }
  }

  async function editRule(id: string, rule: Omit<Rule, "id" | "createdAt">) {
    setRules((prev) => prev.map((existing) => (existing.id === id ? { ...existing, ...rule } : existing)));
    if (isSupabaseConfigured) await updateRule(id, rule);
  }

  async function deleteRule(id: string) {
    setRules((prev) => prev.filter((rule) => rule.id !== id));
    if (isSupabaseConfigured) await removeRule(id);
  }

  return { rules, loading, addRule, editRule, deleteRule };
}
