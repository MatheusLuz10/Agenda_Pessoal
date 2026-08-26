import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/config/navigation";

// Menu fixo embaixo, único mecanismo de navegação do app (substitui o
// antigo menu lateral de desktop e a grade de ícones "Painel
// Principal") — visível em qualquer tamanho de tela.
export function BottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card/95 backdrop-blur-md">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              "flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2.5 text-center text-[10px] font-medium uppercase leading-tight transition-colors",
              isActive ? "text-primary" : "text-muted-foreground"
            )
          }
        >
          <Icon className="size-5 shrink-0" />
          <span className="w-full break-words px-0.5">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
