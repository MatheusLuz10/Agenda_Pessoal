import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function CampoBusca({
  valor,
  aoMudar,
  placeholder = "Pesquisar",
  className,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-texto-suave" />
      <input
        type="search"
        maxLength={80}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 w-full rounded-xl border border-linha bg-white pr-10 pl-9 text-base text-verde placeholder:text-texto-suave/70 focus:border-amarelo focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {valor && (
        <button
          type="button"
          onClick={() => aoMudar("")}
          className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-texto-suave hover:text-verde"
          aria-label="Limpar busca"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}

/** Botões de escolha única (ex.: Ativos / Inativos / Todos). */
export function Segmentado<T extends string>({
  opcoes,
  valor,
  aoMudar,
  rotulo,
}: {
  opcoes: { valor: T; rotulo: string }[];
  valor: T;
  aoMudar: (v: T) => void;
  rotulo: string;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-offwhite p-1">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => aoMudar(o.valor)}
          className={cn(
            "h-9 shrink-0 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors",
            valor === o.valor ? "bg-superficie text-verde shadow-sm" : "text-texto-suave hover:text-verde",
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}
