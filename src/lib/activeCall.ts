// Persiste a ligação em andamento (setor + horário de início) no
// localStorage, para sobreviver à navegação entre "Meu trabalho" (onde o
// técnico toca no contato e o telefone abre o discador) e a tela de
// Retenção/C.O (onde ele encerra a ligação e o relatório é gerado).

const ACTIVE_CALL_KEY = "active-call";

export interface ActiveCall {
  setor: string;
  start: number;
}

export function saveActiveCall(setor: string, startMs: number): void {
  localStorage.setItem(ACTIVE_CALL_KEY, JSON.stringify({ setor, start: startMs }));
}

export function loadActiveCall(): ActiveCall | null {
  try {
    const raw = localStorage.getItem(ACTIVE_CALL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.start !== "number") return null;
    return { setor: typeof parsed.setor === "string" ? parsed.setor : "", start: parsed.start };
  } catch {
    return null;
  }
}

export function clearActiveCall(): void {
  localStorage.removeItem(ACTIVE_CALL_KEY);
}
