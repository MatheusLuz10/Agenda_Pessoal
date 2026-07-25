import { NavLink } from "react-router-dom";
import { LayoutGrid } from "lucide-react";
import { GRID_ITEMS } from "@/config/navigation";
import { cn } from "@/lib/utils";

// Tela "/menu" — grade de ícones (estilo launcher) com atalho pra todo
// canto do app. Acessível pelo item "Menu" do menu lateral/inferior.
export function AppGridPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <LayoutGrid className="size-5" />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Menu</h1>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        {GRID_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 text-center shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                isActive && "border-primary"
              )
            }
          >
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary sm:size-14">
              <Icon className="size-5 sm:size-6" />
            </div>
            <span className="break-words text-[11px] font-medium uppercase leading-tight text-muted-foreground sm:text-xs">
              {label}
            </span>
          </NavLink>
        ))}
      </div>
    </div>
  );
}
