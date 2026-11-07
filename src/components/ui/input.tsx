import * as React from "react";
import { cn } from "@/lib/utils";

// Campo de texto padronizado (borda, foco, estados desabilitado).
// Recebe qualquer prop nativa de <input> (type, value, onChange, etc).
const TIPOS_SEM_LIMITE_TEXTO = new Set(["number", "date", "time", "datetime-local", "month", "week", "color", "range", "file", "checkbox", "radio", "hidden"]);

function Input({ className, type = "text", maxLength, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      maxLength={maxLength ?? (TIPOS_SEM_LIMITE_TEXTO.has(type) ? undefined : 80)}
      data-slot="input"
      className={cn(
        "flex h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Input };
