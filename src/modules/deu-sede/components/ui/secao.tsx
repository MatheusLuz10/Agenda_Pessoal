import type { ReactNode } from "react";
import { Card } from "@/modules/deu-sede/components/ui/card";
import { cn } from "@/lib/utils";

/** Bloco com título (e ações opcionais) — base das telas de detalhe. */
export function Secao({
  titulo,
  descricao,
  acoes,
  children,
  className,
  semPadding,
}: {
  titulo: string;
  descricao?: ReactNode;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
  semPadding?: boolean;
}) {
  return (
    <Card className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4 sm:px-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-verde">{titulo}</h2>
          {descricao && <p className="text-sm text-texto-suave">{descricao}</p>}
        </div>
        {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
      </div>
      <div className={cn(semPadding ? "pt-3 pb-1" : "px-4 pt-3 pb-4 sm:px-5 sm:pb-5")}>{children}</div>
    </Card>
  );
}

/** Lista "rótulo: valor" em duas colunas no computador. */
export function Dados({ itens }: { itens: [string, ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {itens
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([rotulo, valor]) => (
          <div key={rotulo} className="min-w-0">
            <dt className="text-xs font-medium tracking-wide text-texto-suave uppercase">{rotulo}</dt>
            <dd className="text-sm break-words text-verde">{valor}</dd>
          </div>
        ))}
    </dl>
  );
}

/** Tabela que rola dentro do cartão (a página nunca rola para o lado). */
export function Tabela({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-max border-collapse text-sm [&_td]:border-t [&_td]:border-linha [&_td]:px-3 [&_td]:py-2.5 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:tracking-wide [&_th]:text-texto-suave [&_th]:uppercase [&_td.num]:text-right [&_th.num]:text-right [&_td.num]:tabular-nums">
        {children}
      </table>
    </div>
  );
}
