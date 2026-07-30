import {
  Briefcase,
  CalendarDays,
  ClipboardList,
  Home,
  Inbox,
  MessageCircle,
  PiggyBank,
  Settings,
  Timer,
} from "lucide-react";

// "Início" leva direto ao Painel Principal ("/menu", ver AppGridPage) —
// não existe mais uma tela "/" separada, então não há item duplicado
// para o Painel Principal na lista.
export const NAV_ITEMS = [
  { to: "/menu", label: "Início", icon: Home, end: true },
  { to: "/calendarios", label: "Calendários", icon: CalendarDays, end: false },
  { to: "/meu-trabalho", label: "Meu trabalho", icon: Briefcase, end: false },
  { to: "/operacao", label: "OPERAÇÂO", icon: ClipboardList, end: false },
  { to: "/gestao-de-tempo", label: "GESTÃO DE TEMPO", icon: Timer, end: false },
  { to: "/solicitacoes", label: "Solicitações", icon: Inbox, end: false },
  { to: "/assistente", label: "Assistente", icon: MessageCircle, end: false },
  { to: "/financas", label: "Finanças", icon: PiggyBank, end: false },
  { to: "/configuracoes", label: "Configurações", icon: Settings, end: false },
] as const;

// Grade de ícones ("/menu", ver AppGridPage) organizada por categoria —
// cada `to` referencia um item de NAV_ITEMS (mesmo ícone/rótulo usados
// no menu lateral). "Início" fica de fora de propósito: é a própria
// tela "/menu", não faz sentido um ícone dela apontar pra si mesma.
export const GRID_CATEGORIES = [
  { label: "Trabalho", items: ["/meu-trabalho", "/operacao", "/solicitacoes"] },
  { label: "Produtividade", items: ["/calendarios", "/gestao-de-tempo"] },
  { label: "Pessoal", items: ["/financas", "/assistente"] },
  { label: "Sistema", items: ["/configuracoes"] },
] as const;

// Barra inferior fixa do celular: só os 4 destinos mais usados no dia a
// dia do técnico.
export const MOBILE_SHORTCUTS = [
  { to: "/menu", label: "Início", icon: Home, end: true },
  { to: "/meu-trabalho", label: "Meu trabalho", icon: Briefcase, end: false },
  { to: "/gestao-de-tempo", label: "Gestão de tempo", icon: Timer, end: false },
  { to: "/operacao", label: "Operação", icon: ClipboardList, end: false },
] as const;
