import * as React from "react";
import { cn } from "@/lib/utils";

// Área de texto multilinha padronizada, mesma ideia do Input mas para
// campos de descrição/observação.
function Textarea({ className, maxLength, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      maxLength={maxLength ?? 80}
      className={cn(
        "flex min-h-20 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
