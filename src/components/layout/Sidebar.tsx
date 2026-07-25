import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/config/navigation";

// Menu lateral fixo (desktop), visível apenas em telas >= sm. Mostra
// todos os itens — no desktop há espaço vertical de sobra.
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
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium uppercase transition-colors",
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

// Item usado só pela barra inferior (mobile) — leva direto pra grade de
// ícones em "/menu", que já reúne o atalho pra todo o resto do app.
const MOBILE_MENU_ITEM = NAV_ITEMS.find((item) => item.to === "/menu")!;

// Menu inferior (mobile), visível apenas em telas < sm. Em vez de
// espremer todos os itens lado a lado, mostra só o atalho pra grade de
// ícones ("/menu") — a lista completa de destinos mora lá.
export function BottomNav() {
  const { to, label, icon: Icon, end } = MOBILE_MENU_ITEM;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card/95 backdrop-blur-md sm:hidden">
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          cn(
            "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-center text-[10px] font-medium uppercase leading-tight transition-colors",
            isActive ? "text-primary" : "text-muted-foreground"
          )
        }
      >
        <Icon className="size-5 shrink-0" />
        <span>{label}</span>
      </NavLink>
    </nav>
  );
}
