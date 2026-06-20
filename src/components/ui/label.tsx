import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

// Rótulo acessível para campos de formulário. Usa o primitivo do Radix
// para garantir que clicar no texto foque/ative o input associado
// (via prop htmlFor, igual a um <label> nativo).
function Label({
  className,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "text-sm font-medium leading-none select-none",
        className
      )}
      {...props}
    />
  );
}

export { Label };
