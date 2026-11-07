import type { ReactNode } from "react";
import { AlertTriangle, CircleCheck, Info, LoaderCircle, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tom = "info" | "sucesso" | "atencao" | "erro";

const tons: Record<Tom, { classe: string; icone: LucideIcon }> = {
  info: { classe: "border-linha bg-offwhite/70 text-verde", icone: Info },
  sucesso: { classe: "border-sucesso/30 bg-sucesso/10 text-sucesso", icone: CircleCheck },
  atencao: { classe: "border-amarelo/50 bg-amarelo/15 text-marrom", icone: AlertTriangle },
  erro: { classe: "border-perigo/30 bg-perigo/10 text-perigo", icone: XCircle },
};

export function Aviso({ tom = "info", children, className }: { tom?: Tom; children: ReactNode; className?: string }) {
  const { classe, icone: Icone } = tons[tom];
  return (
    <div role={tom === "erro" ? "alert" : "status"} className={cn("flex gap-2.5 rounded-xl border px-3.5 py-3 text-sm", classe, className)}>
      <Icone className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-texto-suave" role="status">
      <LoaderCircle className="size-5 animate-spin" /> {texto}
    </div>
  );
}

export function Vazio({ icone: Icone, titulo, children }: { icone: LucideIcon; titulo: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-linha px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-offwhite text-marrom">
        <Icone className="size-6" />
      </span>
      <p className="font-semibold text-verde">{titulo}</p>
      {children && <div className="max-w-sm text-sm text-texto-suave">{children}</div>}
    </div>
  );
}
