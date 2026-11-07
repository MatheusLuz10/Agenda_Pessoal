import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutro" | "amarelo" | "verde" | "marrom" | "perigo";

const tones: Record<Tone, string> = {
  neutro: "bg-offwhite text-verde",
  amarelo: "bg-amarelo/20 text-marrom",
  verde: "bg-verde text-offwhite",
  marrom: "bg-marrom/15 text-marrom",
  perigo: "bg-perigo/10 text-perigo",
};

export function Badge({ className, tone = "neutro", ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tones[tone], className)}
      {...props}
    />
  );
}
