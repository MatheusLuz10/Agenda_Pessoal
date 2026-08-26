import {
  Briefcase,
  CalendarDays,
  ClipboardList,
  Inbox,
} from "lucide-react";

// Único menu de navegação do app: a barra fixa embaixo (ver
// BottomNav em Sidebar.tsx), visível em qualquer tamanho de tela —
// não existe mais grade de ícones nem menu lateral. "Assistente" não
// entra aqui de propósito: virou um popup de conversa flutuante (ver
// AssistantWidget), não uma aba. "Configurações" também fica de fora:
// acessível só pela engrenagem no cabeçalho (ver Header.tsx).
export const NAV_ITEMS = [
  { to: "/calendarios", label: "AGENDA", icon: CalendarDays, end: false },
  { to: "/meu-trabalho", label: "Meu trabalho", icon: Briefcase, end: false },
  { to: "/operacao", label: "OPERAÇÂO", icon: ClipboardList, end: false },
  { to: "/solicitacoes", label: "Conecta Rede", icon: Inbox, end: false },
] as const;
