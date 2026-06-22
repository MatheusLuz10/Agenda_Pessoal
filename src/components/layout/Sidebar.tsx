import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/config/navigation";

function SidebarNav({ mobile = false }: { mobile?: boolean }) {
  return (
    <nav
      className={cn(
        mobile
          ? "fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-card/95 backdrop-blur-md sm:hidden"
          : "hidden w-56 shrink-0 flex-col gap-1 border-r border-border bg-card/50 p-3 sm:flex"
      )}
    >
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              mobile
                ? "flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors"
                : "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? mobile
                  ? "text-primary"
                  : "bg-primary text-primary-foreground shadow-sm"
                : mobile
                  ? "text-muted-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )
          }
        >
          <Icon className={mobile ? "size-5" : "size-4.5"} />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Sidebar() {
  return <SidebarNav />;
}

export function BottomNav() {
  return <SidebarNav mobile />;
}
