import {
  Briefcase,
  CalendarDays,
  ClipboardList,
  Home,
  LayoutGrid,
  MessageCircle,
  PiggyBank,
  Settings,
  Timer,
} from "lucide-react";

export const NAV_ITEMS = [
  { to: "/", label: "Início", icon: Home, end: true },
  { to: "/calendarios", label: "Calendários", icon: CalendarDays, end: false },
  { to: "/meu-trabalho", label: "Meu trabalho", icon: Briefcase, end: false },
  { to: "/operacao", label: "OPERAÇÂO", icon: ClipboardList, end: false },
  { to: "/gestao-de-tempo", label: "GESTÃO DE TEMPO", icon: Timer, end: false },
  { to: "/assistente", label: "Assistente", icon: MessageCircle, end: false },
  { to: "/financas", label: "Finanças", icon: PiggyBank, end: false },
  { to: "/configuracoes", label: "Configurações", icon: Settings, end: false },
  { to: "/menu", label: "Menu", icon: LayoutGrid, end: true },
] as const;

// Usada só pela grade de ícones ("/menu", ver AppGridPage) — mesma lista
// do menu lateral, exceto o próprio item "Menu" (não faz sentido um
// ícone dentro da grade que leva pra própria grade).
export const GRID_ITEMS = NAV_ITEMS.filter((item) => item.to !== "/menu");
