import { NavLink } from "react-router-dom";
import { Home, CalendarDays, ListChecks, Settings, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";

// Lista única de navegação, compartilhada pela Sidebar (desktop) e pela
// BottomNav (mobile) — manter num só lugar evita que as duas listas de
// menu fiquem dessincronizadas se uma rota for adicionada/removida.
const NAV_ITEMS = [
  { to: "/", label: "Início", icon: Home, end: true },
  { to: "/calendarios", label: "Calendários", icon: CalendarDays, end: false },
  { to: "/tarefas", label: "Tarefas", icon: ListChecks, end: false },
  { to: "/meu-trabalho", label: "Meu trabalho", icon: Briefcase, end: false },
  { to: "/configuracoes", label: "Configurações", icon: Settings, end: false },
];

// Menu lateral fixo, visível apenas em telas >= sm (ver classe "hidden
// ... sm:flex"). NavLink do react-router marca automaticamente o link
// ativo via a função de className que recebe `isActive`.
export function Sidebar() {
  return (
    <nav className="hidden w-56 shrink-0 flex-col gap-1 border-r border-border bg-card/50 p-3 sm:flex">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )
          }
        >
          <Icon className="size-4.5" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

// Versão mobile do menu, fixada na parte inferior da tela (visível
// apenas em telas pequenas, escondida em >= sm). Mesmos itens de NAV_ITEMS,
// só o layout muda de coluna vertical para distribuição horizontal.
export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card/95 backdrop-blur-md sm:hidden">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors",
              isActive ? "text-primary" : "text-muted-foreground"
            )
          }
        >
          <Icon className="size-5" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
