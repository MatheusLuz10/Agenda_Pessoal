import { useState } from "react";
import { NavLink } from "react-router-dom";
import { ProfileCard } from "@/components/profile/ProfileCard";
import { GRID_ITEMS } from "@/config/navigation";
import { todayISO } from "@/lib/date";
import { getDisplayName } from "@/lib/userProfile";
import { cn } from "@/lib/utils";

// Tela "/" — grade de ícones (estilo launcher), a nova tela inicial do
// app. A barra de perfil (foto + saudação) só existe aqui; as demais
// telas (incluindo o antigo dashboard, agora em "/inicio") não a têm.
export function AppGridPage() {
  const [displayName] = useState(getDisplayName);

  return (
    <div className="flex flex-col gap-6">
      <ProfileCard>
        <h1 className="text-2xl font-semibold tracking-tight">
          Olá{displayName ? `, ${displayName}` : ""}!
        </h1>
        <p className="text-sm text-muted-foreground">
          {new Date(todayISO() + "T00:00:00").toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          })}
        </p>
      </ProfileCard>

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
