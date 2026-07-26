import {
  Briefcase,
  CalendarDays,
  ClipboardList,
  Home,
  Inbox,
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
  { to: "/solicitacoes", label: "Solicitações", icon: Inbox, end: false },
  { to: "/assistente", label: "Assistente", icon: MessageCircle, end: false },
  { to: "/financas", label: "Finanças", icon: PiggyBank, end: false },
  { to: "/configuracoes", label: "Configurações", icon: Settings, end: false },
  { to: "/menu", label: "Painel Principal", icon: LayoutGrid, end: true },
] as const;

// Grade de ícones ("/menu", ver AppGridPage) organizada por categoria —
// cada `to` referencia um item de NAV_ITEMS (mesmo ícone/rótulo usados
// no menu lateral). "Início" fica de fora de propósito: só existe na
// barra de atalhos do celular (ver MOBILE_SHORTCUTS), não repete aqui.
export const GRID_CATEGORIES = [
  { label: "Trabalho", items: ["/meu-trabalho", "/operacao", "/solicitacoes"] },
  { label: "Produtividade", items: ["/calendarios", "/gestao-de-tempo"] },
  { label: "Pessoal", items: ["/financas", "/assistente"] },
  { label: "Sistema", items: ["/configuracoes"] },
] as const;

// Barra inferior fixa do celular: 5 atalhos diretos pros destinos mais
// usados, em vez de só um botão genérico pro Painel Principal (que
// continua acessível pela logo no cabeçalho, ver Header.tsx). Rótulos
// próprios (ex: "Agenda" em vez de "Calendários") — cabem melhor no
// espaço apertado da barra.
export const MOBILE_SHORTCUTS = [
  { to: "/", label: "Início", icon: Home, end: true },
  { to: "/calendarios", label: "Agenda", icon: CalendarDays, end: false },
  { to: "/operacao", label: "Operação", icon: ClipboardList, end: false },
  { to: "/assistente", label: "Assistente", icon: MessageCircle, end: false },
  { to: "/configuracoes", label: "Config.", icon: Settings, end: false },
] as const;
