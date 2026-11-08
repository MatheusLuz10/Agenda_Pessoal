import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Grade no estilo planilha (Excel): um registro por linha, em linha única,
// cabeçalho fixo, colunas ordenáveis, seleção de várias linhas e colunas
// paradas ao rolar para o lado (nome à esquerda, ações à direita) — no
// celular a grade rola dentro do cartão e o essencial continua à vista.

export interface ColunaPlanilha<T> {
  chave: string;
  rotulo: string;
  /** número: alinhado à direita, algarismos de mesma largura */
  num?: boolean;
  /** fica parada à esquerda ao rolar para o lado (use na coluna do nome) */
  fixa?: boolean;
  /** fica parada à direita (use nas ações da linha) */
  fixaDireita?: boolean;
  /** limita a largura e corta com "…" (texto completo no title) */
  larguraMax?: string;
  celula: (linha: T) => ReactNode;
  /** valor para ordenar pela coluna (sem ele, a coluna não ordena) */
  ordenar?: (linha: T) => string | number | null | undefined;
  /** texto completo mostrado ao passar o mouse */
  titulo?: (linha: T) => string | undefined;
  classe?: (linha: T) => string | undefined;
}

type Ordem = { chave: string; sentido: 1 | -1 };

function CaixaTodas({ estado, aoMudar }: { estado: "nenhuma" | "algumas" | "todas"; aoMudar: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = estado === "algumas";
  }, [estado]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="Selecionar todas as linhas"
      checked={estado === "todas"}
      onChange={aoMudar}
      className="size-5 cursor-pointer accent-amarelo align-middle"
    />
  );
}

export function Planilha<T>({
  rotulo,
  colunas,
  linhas,
  chave,
  aoAbrir,
  destaqueLinha,
  totais,
  ordemInicial,
  selecionados,
  aoSelecionar,
  nomeLinha,
}: {
  /** nome da tabela para leitores de tela */
  rotulo: string;
  colunas: ColunaPlanilha<T>[];
  linhas: T[];
  chave: (linha: T) => string;
  /** clique na linha (ex.: abrir o produto) */
  aoAbrir?: (linha: T) => void;
  /** classe extra da linha (ex.: abaixo do mínimo) — use fundo opaco */
  destaqueLinha?: (linha: T) => string | undefined;
  /** linha de totais no fim, por chave de coluna */
  totais?: Partial<Record<string, ReactNode>>;
  ordemInicial?: Ordem;
  /** com seleção: caixa de marcar em cada linha e "selecionar todas" */
  selecionados?: Set<string>;
  aoSelecionar?: (ids: Set<string>) => void;
  /** nome da linha para a caixa de marcar ("Selecionar <nome>") */
  nomeLinha?: (linha: T) => string;
}) {
  const [ordem, setOrdem] = useState<Ordem | null>(ordemInicial ?? null);
  const comSelecao = !!selecionados && !!aoSelecionar;

  const ordenadas = useMemo(() => {
    const col = ordem && colunas.find((c) => c.chave === ordem.chave);
    if (!col?.ordenar) return linhas;
    const valor = col.ordenar;
    return [...linhas].sort((a, b) => {
      const va = valor(a);
      const vb = valor(b);
      if (va === vb) return 0;
      if (va === null || va === undefined || va === "") return 1; // vazios sempre no fim
      if (vb === null || vb === undefined || vb === "") return -1;
      const r = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR", { numeric: true });
      return r * ordem!.sentido;
    });
  }, [linhas, colunas, ordem]);

  function alternar(c: ColunaPlanilha<T>) {
    if (!c.ordenar) return;
    setOrdem((o) => (o?.chave === c.chave ? { chave: c.chave, sentido: o.sentido === 1 ? -1 : 1 } : { chave: c.chave, sentido: c.num ? -1 : 1 }));
  }

  const idsVisiveis = linhas.map(chave);
  const marcadasVisiveis = comSelecao ? idsVisiveis.filter((id) => selecionados!.has(id)).length : 0;
  const estadoTodas = marcadasVisiveis === 0 ? "nenhuma" : marcadasVisiveis === idsVisiveis.length ? "todas" : "algumas";
  function alternarTodas() {
    const novo = new Set(selecionados);
    if (estadoTodas === "todas") idsVisiveis.forEach((id) => novo.delete(id));
    else idsVisiveis.forEach((id) => novo.add(id));
    aoSelecionar!(novo);
  }
  function alternarLinha(id: string) {
    const novo = new Set(selecionados);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    aoSelecionar!(novo);
  }

  // com a caixa de marcar parada à esquerda, a coluna fixa fica logo depois dela
  const esquerdaFixa = comSelecao ? "left-11" : "left-0";
  const celulaCaixa = "sticky left-0 w-11 min-w-11 border-r border-linha px-0 text-center";

  return (
    <div className="max-h-[calc(100dvh-15rem)] min-h-40 overflow-auto rounded-xl border border-linha bg-superficie lg:max-h-[calc(100dvh-13rem)]">
      <table className="w-full min-w-max border-separate border-spacing-0 text-sm">
        <caption className="sr-only">{rotulo}</caption>
        <thead>
          <tr>
            {comSelecao && (
              <th scope="col" className={cn(celulaCaixa, "top-0 z-30 border-b bg-superficie py-2")}>
                <CaixaTodas estado={estadoTodas} aoMudar={alternarTodas} />
              </th>
            )}
            {colunas.map((c) => {
              const ativa = ordem?.chave === c.chave;
              const Icone = ativa ? (ordem!.sentido === 1 ? ArrowUp : ArrowDown) : ArrowUpDown;
              return (
                <th
                  key={c.chave}
                  scope="col"
                  aria-sort={ativa ? (ordem!.sentido === 1 ? "ascending" : "descending") : undefined}
                  className={cn(
                    "sticky top-0 z-10 border-b border-linha bg-superficie px-3 py-2 text-xs font-semibold tracking-wide whitespace-nowrap text-texto-suave uppercase",
                    c.num ? "text-right" : "text-left",
                    c.fixa && cn(esquerdaFixa, "z-20 border-r"),
                    c.fixaDireita && "right-0 z-20 border-l",
                  )}
                >
                  {c.ordenar ? (
                    <button
                      type="button"
                      onClick={() => alternar(c)}
                      className={cn("inline-flex min-h-8 items-center gap-1 uppercase hover:text-verde", c.num && "flex-row-reverse", ativa && "text-verde")}
                    >
                      {c.rotulo}
                      <Icone className={cn("size-3.5 shrink-0", !ativa && "opacity-40")} aria-hidden />
                    </button>
                  ) : (
                    c.rotulo || <span className="sr-only">Ações</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ordenadas.map((l, i) => {
            const id = chave(l);
            const marcada = comSelecao && selecionados!.has(id);
            return (
              <tr
                key={id}
                onClick={aoAbrir ? () => aoAbrir(l) : undefined}
                aria-selected={comSelecao ? marcada : undefined}
                className={cn(
                  // fundos opacos: as colunas fixas herdam e cobrem o que rola por baixo
                  marcada ? "bg-offwhite" : i % 2 === 1 ? "bg-fundo" : "bg-superficie",
                  aoAbrir && "cursor-pointer hover:bg-offwhite",
                  marcada && "[&>td:first-child]:shadow-[inset_4px_0_0_var(--color-amarelo)]",
                  destaqueLinha?.(l),
                )}
              >
                {comSelecao && (
                  <td className={cn(celulaCaixa, "z-[1] border-b bg-inherit py-0")} onClick={(e) => e.stopPropagation()}>
                    <label className="flex h-10 cursor-pointer items-center justify-center">
                      <input
                        type="checkbox"
                        checked={marcada}
                        onChange={() => alternarLinha(id)}
                        aria-label={`Selecionar ${nomeLinha?.(l) ?? id}`}
                        className="size-5 cursor-pointer accent-amarelo"
                      />
                    </label>
                  </td>
                )}
                {colunas.map((c) => (
                  <td
                    key={c.chave}
                    title={c.titulo?.(l)}
                    className={cn(
                      "border-b border-linha px-3 py-2 whitespace-nowrap text-texto",
                      c.num && "text-right tabular-nums",
                      c.fixa && cn("sticky z-[1] border-r bg-inherit", esquerdaFixa),
                      c.fixaDireita && "sticky right-0 z-[1] border-l bg-inherit py-1",
                      c.larguraMax && cn(c.larguraMax, "truncate"),
                      c.classe?.(l),
                    )}
                  >
                    {c.celula(l)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        {totais && (
          <tfoot>
            <tr>
              {comSelecao && <td className={cn(celulaCaixa, "bottom-0 z-20 border-t-2 bg-superficie")} />}
              {colunas.map((c) => (
                <td
                  key={c.chave}
                  className={cn(
                    "sticky bottom-0 z-10 border-t-2 border-linha bg-superficie px-3 py-2 font-semibold whitespace-nowrap text-verde",
                    c.num && "text-right tabular-nums",
                    c.fixa && cn(esquerdaFixa, "z-20 border-r"),
                    c.fixaDireita && "right-0 z-20 border-l",
                  )}
                >
                  {totais[c.chave]}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
