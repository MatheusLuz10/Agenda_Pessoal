import {
  Briefcase,
  CalendarDays,
  ClipboardList,
  Home,
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
] as const;

// Usada só pela grade de ícones da tela inicial ("/", ver AppGridPage) —
// mesma lista de NAV_ITEMS (menu lateral/inferior, inalterado), mas com
// "Início" apontando pro dashboard antigo (mini calendário + Próximos
// Avisos), que se mudou pra "/inicio" já que "/" agora é a própria grade.
export const GRID_ITEMS = NAV_ITEMS.map((item) =>
  item.to === "/" ? { ...item, to: "/inicio" } : item
);
