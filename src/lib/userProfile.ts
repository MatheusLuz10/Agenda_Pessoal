// Nome de exibição do usuário, mostrado no cumprimento da tela Início.
// Guardado no localStorage (mesmo padrão do tema em Header.tsx) — este é
// um app pessoal de um usuário só, não precisa de tabela no Supabase.
const DISPLAY_NAME_KEY = "user-display-name";

export function getDisplayName(): string {
  return localStorage.getItem(DISPLAY_NAME_KEY) ?? "";
}

export function setDisplayName(name: string): void {
  localStorage.setItem(DISPLAY_NAME_KEY, name);
}
