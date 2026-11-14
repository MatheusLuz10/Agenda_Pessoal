import { useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Menu, X, type LucideIcon } from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { cn } from "@/lib/utils";

// Estrutura visual comum a todo o app (identidade DEU SEDE!):
//   computador -> menu lateral verde fixo;
//   celular    -> cabeçalho verde + barra inferior (com "Mais" quando
//                 há itens demais para a barra).
// A Agenda (AppLayout) e o DEU SEDE! (DeuSedeLayout) usam este mesmo
// esqueleto, cada um com seus itens de menu.

export interface ItemMenu {
  key: string;
  to: string;
  label: string;
  /** rótulo curto para a barra inferior do celular */
  shortLabel: string;
  icon: LucideIcon;
  /** aparece direto na barra inferior do celular */
  noCelular?: boolean;
  /** destaque só na página exata (padrão: só para o item inicial da marca) */
  end?: boolean;
  /** quantos avisos a aba tem: mostra a bolinha vermelha */
  alerta?: number;
}

function Bolinha({ n, className }: { n?: number; className?: string }) {
  if (!n) return null;
  return (
    <span className={cn("size-2.5 shrink-0 rounded-full bg-red-500 ring-2 ring-red-500/25", className)} title={`${n} ${n === 1 ? "aviso" : "avisos"}`}>
      <span className="sr-only">({n} {n === 1 ? "aviso" : "avisos"})</span>
    </span>
  );
}

interface Marca {
  titulo: string;
  to: string;
}

/** Posição na história do navegador dentro do app (o React Router guarda). */
function posicaoNaHistoria(): number {
  const estado = window.history.state as { idx?: unknown } | null;
  return typeof estado?.idx === "number" ? estado.idx : 0;
}

/**
 * Para onde o "Voltar" leva quando não há página anterior no app (a tela
 * foi aberta direto, por link ou favorito): para a aba da tela; já na aba,
 * para o início. No início, não há para onde voltar.
 */
function destinoAcima(pathname: string, itens: ItemMenu[], inicio: string): string | null {
  const caminho = pathname.replace(/\/+$/, "") || "/";
  if (caminho === inicio) return null;
  const aba = itens
    .filter((i) => caminho === i.to || caminho.startsWith(`${i.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];
  return aba && aba.to !== caminho ? aba.to : inicio;
}

// Logo recortada do banner da distribuidora (fundo transparente):
//   empilhada  -> menu lateral do computador;
//   horizontal -> cabeçalho do celular (canecas ao lado do nome).
function LogoMarca({ marca, horizontal = false }: { marca: Marca; horizontal?: boolean }) {
  return (
    <Link
      to={marca.to}
      className={cn("flex min-w-0 items-center", !horizontal && "justify-center")}
      aria-label={`${marca.titulo} — início`}
    >
      {horizontal ? (
        <img
          src="/logo-deu-sede-horizontal.webp"
          alt="Distribuidora DEU SEDE!"
          width={720}
          height={155}
          className="h-10 w-auto min-w-0 max-w-full object-contain object-left"
        />
      ) : (
        <img
          src="/logo-deu-sede.webp"
          alt="Distribuidora DEU SEDE!"
          width={560}
          height={385}
          className="h-auto w-full max-w-52"
        />
      )}
    </Link>
  );
}

export function Shell({
  marca,
  itens,
  rotuloMenu,
  rodape,
  acaoCabecalho,
  extrasMenuMais,
  aviso,
  telaCheia = false,
  children,
}: {
  marca: Marca;
  itens: ItemMenu[];
  rotuloMenu: string;
  /** rodapé do menu lateral (computador) */
  rodape?: ReactNode;
  /** canto direito do cabeçalho (celular) */
  acaoCabecalho?: ReactNode;
  /** itens extras no fim do menu "Mais" (celular) */
  extrasMenuMais?: ReactNode;
  /** faixa de aviso logo abaixo do cabeçalho */
  aviso?: ReactNode;
  /** oculta a navegação global e usa toda a janela para fluxos imersivos */
  telaCheia?: boolean;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  // "Voltar" em todas as telas: volta para a página anterior do app; sem
  // página anterior (abriu direto), sobe para a aba ou para o início.
  const acima = destinoAcima(pathname, itens, marca.to);
  const podeVoltar = posicaoNaHistoria() > 0 || acima !== null;
  const voltar = () => {
    if (posicaoNaHistoria() > 0) navigate(-1);
    else if (acima) navigate(acima);
  };
  // Guarda em qual tela o menu "Mais" foi aberto: ao trocar de tela
  // (inclusive pelo botão voltar) ele fecha sozinho.
  const [maisAbertoEm, setMaisAbertoEm] = useState<string | null>(null);
  const maisAberto = maisAbertoEm === pathname;
  const setMaisAberto = (aberto: boolean) => setMaisAbertoEm(aberto ? pathname : null);

  const naBarra = itens.length <= 5 ? itens : itens.filter((i) => i.noCelular).slice(0, 4);
  const temMais = naBarra.length < itens.length || !!extrasMenuMais;
  // avisos das abas que só aparecem no "Mais"
  const alertaMais = itens.filter((i) => !naBarra.includes(i)).reduce((s, i) => s + (i.alerta ?? 0), 0);
  const colunas = naBarra.length + (temMais ? 1 : 0);

  return (
    <div className={cn("min-h-dvh bg-fundo text-texto lg:pl-64", telaCheia && "h-dvh overflow-hidden lg:pl-0")}>
      {/* ---------- Computador: menu lateral ---------- */}
      {!telaCheia && <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-verde px-3 py-5 lg:flex">
        <div className="px-2 pb-6">
          <LogoMarca marca={marca} />
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto" aria-label={rotuloMenu}>
          {itens.map((m) => {
            const Icon = m.icon;
            return (
              <NavLink
                key={m.key}
                to={m.to}
                end={m.end ?? m.to === marca.to}
                className={({ isActive }) =>
                  cn(
                    "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                    isActive ? "bg-amarelo text-verde" : "text-creme/85 hover:bg-verde-600 hover:text-creme",
                  )
                }
              >
                <Icon className="size-5 shrink-0" />
                <span className="min-w-0 flex-1">{m.label}</span>
                <Bolinha n={m.alerta} />
              </NavLink>
            );
          })}
        </nav>
        <div className="mt-4 border-t border-verde-600 px-2 pt-4 text-sm">
          {rodape}
        </div>
      </aside>}

      {/* ---------- Celular: cabeçalho ---------- */}
      {!telaCheia && <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 bg-verde px-4 lg:hidden">
        <div className="flex min-w-0 items-center gap-1">
          {podeVoltar && (
            <button
              type="button"
              onClick={voltar}
              className="-ml-2 flex size-10 shrink-0 items-center justify-center rounded-xl text-creme hover:bg-verde-600"
              aria-label="Voltar"
              title="Voltar"
            >
              <ArrowLeft className="size-5" />
            </button>
          )}
          <LogoMarca marca={marca} horizontal />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {acaoCabecalho}
          <ThemeToggle />
        </div>
      </header>}

      {/* Computador: "Voltar" à esquerda e tema claro/escuro (só o ícone) à
          direita, alinhados com o conteúdo */}
      {!telaCheia && (
        <div className="mx-auto hidden w-full max-w-6xl items-center justify-between gap-3 px-8 pt-3 lg:flex">
          {podeVoltar ? (
            <button
              type="button"
              onClick={voltar}
              className="-ml-3 flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-verde hover:bg-offwhite"
            >
              <ArrowLeft className="size-4" /> Voltar
            </button>
          ) : (
            <span />
          )}
          <ThemeToggle variante="pagina" />
        </div>
      )}

      {!telaCheia && aviso}

      <main className={cn(
        "mx-auto w-full max-w-6xl px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-3 lg:pb-10",
        telaCheia && "h-dvh max-w-none overflow-hidden p-0",
      )}>{children}</main>

      {/* ---------- Celular: barra inferior ---------- */}
      {!telaCheia && <nav
        aria-label={rotuloMenu}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-linha bg-superficie pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${colunas}, minmax(0, 1fr))` }}>
          {naBarra.map((m) => {
            const Icon = m.icon;
            return (
              <li key={m.key}>
                <NavLink
                  to={m.to}
                  end={m.end ?? m.to === marca.to}
                  className={({ isActive }) =>
                    cn(
                      "flex h-16 flex-col items-center justify-center gap-1 px-1 text-center text-[11px] leading-tight font-medium",
                      isActive ? "text-verde" : "text-texto-suave",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={cn("relative flex h-7 w-12 items-center justify-center rounded-full", isActive && "bg-amarelo")}>
                        <Icon className="size-5" />
                        <Bolinha n={m.alerta} className="absolute top-0 right-2" />
                      </span>
                      {m.shortLabel}
                    </>
                  )}
                </NavLink>
              </li>
            );
          })}
          {temMais && (
            <li>
              <button
                type="button"
                onClick={() => setMaisAberto(true)}
                className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-texto-suave"
                aria-haspopup="dialog"
                aria-expanded={maisAberto}
              >
                <span className="relative flex h-7 w-12 items-center justify-center rounded-full">
                  <Menu className="size-5" />
                  <Bolinha n={alertaMais} className="absolute top-0 right-2" />
                </span>
                Mais
              </button>
            </li>
          )}
        </ul>
      </nav>}

      {/* ---------- Celular: menu "Mais" ---------- */}
      {maisAberto && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu completo">
          <button type="button" className="absolute inset-0 bg-verde/50" aria-label="Fechar menu" onClick={() => setMaisAberto(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-superficie px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-base font-semibold text-verde">Menu</p>
              <button
                type="button"
                onClick={() => setMaisAberto(false)}
                className="flex size-11 items-center justify-center rounded-xl text-verde hover:bg-offwhite"
                aria-label="Fechar"
              >
                <X className="size-5" />
              </button>
            </div>
            <ul className="grid grid-cols-3 gap-2">
              {itens.map((m) => {
                const Icon = m.icon;
                return (
                  <li key={m.key}>
                    <NavLink
                      to={m.to}
                      end={m.end ?? m.to === marca.to}
                      onClick={() => setMaisAberto(false)}
                      className={({ isActive }) =>
                        cn(
                          "flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl border px-1 text-center text-xs font-medium",
                          isActive ? "border-amarelo bg-amarelo/15 text-verde" : "border-linha text-verde",
                        )
                      }
                    >
                      <span className="relative">
                        <Icon className="size-5" />
                        <Bolinha n={m.alerta} className="absolute -top-1 -right-2" />
                      </span>
                      {m.label}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
            {extrasMenuMais && <div className="mt-3 flex flex-col gap-2">{extrasMenuMais}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
