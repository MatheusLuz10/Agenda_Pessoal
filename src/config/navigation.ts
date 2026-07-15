import {
  Briefcase,
  CalendarDays,
  ClipboardList,
  Home,
  MessageCircle,
  PiggyBank,
  Settings,
} from "lucide-react";

export const NAV_ITEMS = [
  { to: "/", label: "Início", icon: Home, end: true },
  { to: "/calendarios", label: "Calendários", icon: CalendarDays, end: false },
  { to: "/meu-trabalho", label: "Meu trabalho", icon: Briefcase, end: false },
  { to: "/operacao", label: "OPERAÇÂO", icon: ClipboardList, end: false },
  { to: "/assistente", label: "Assistente", icon: MessageCircle, end: false },
  { to: "/financas", label: "Finanças", icon: PiggyBank, end: false },
  { to: "/configuracoes", label: "Configurações", icon: Settings, end: false },
] as const;
