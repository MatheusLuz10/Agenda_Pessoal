import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/config/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

// Quantos itens cabem confortavelmente na barra inferior do celular,
// lado a lado com rótulo, antes de ficar apertado. O resto vai para o
// botão "Mais", que abre um modal com a lista completa restante.
const MOBILE_PRIMARY_COUNT = 4;

// Menu inferior (mobile), visível apenas em telas < sm. Com mais de
// MOBILE_PRIMARY_COUNT itens no app, mostrar todos lado a lado espreme
// demais cada botão — por isso só os primeiros ficam fixos, e os demais
// (incluindo Configurações) entram num botão "Mais" que abre um modal.
export function BottomNav() {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const primaryItems = NAV_ITEMS.slice(0, MOBILE_PRIMARY_COUNT);
  const overflowItems = NAV_ITEMS.slice(MOBILE_PRIMARY_COUNT);
  const isOverflowActive = overflowItems.some((item) => location.pathname === item.to);

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card/95 backdrop-blur-md sm:hidden">
        {primaryItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium uppercase transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )
            }
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        ))}

        {overflowItems.length > 0 && (
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium uppercase transition-colors",
              isOverflowActive ? "text-primary" : "text-muted-foreground"
            )}
          >
            <MoreHorizontal className="size-5" />
            Mais
          </button>
        )}
      </nav>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mais opções</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1">
            {overflowItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setMoreOpen(false)}
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
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
