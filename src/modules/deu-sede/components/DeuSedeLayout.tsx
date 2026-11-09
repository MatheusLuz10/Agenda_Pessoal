import { Link, Outlet } from "react-router-dom";
import { ArrowLeft, CalendarDays, FlaskConical, LogOut, Phone } from "lucide-react";
import { Shell } from "@/components/layout/Shell";
import { TELEFONE_CONTATO, TELEFONE_LINK } from "@/config/contato";
import { DEU_SEDE_BASE, MODULES } from "@/modules/deu-sede/config/modules";
import { useSessaoDeuSede } from "@/modules/deu-sede/sessao";
import { useConsulta, useRecarregarAoVoltar } from "@/modules/deu-sede/data/cliente";
import { AreaProtegida, SenhaProvider } from "@/modules/deu-sede/senha";
import { INICIO_PEDIDOS, useSoPedidos } from "@/modules/deu-sede/soPedidos";
import { useAvisos } from "@/modules/deu-sede/data/avisos";
import type { Acesso } from "@/modules/deu-sede/data/tipos";
import { Aviso, Carregando } from "@/modules/deu-sede/components/ui/aviso";

// Seção de compras dentro do app: mesmo esqueleto visual da área principal
// (components/layout/Shell), com o menu de compras e o atalho de volta
// para o Calendário.
const AGENDA_HOME = "/calendarios";

function AvisoModoLocal() {
  const { mode } = useSessaoDeuSede();
  if (mode !== "local") return null;
  return (
    <div className="flex items-center gap-2 border-b border-amarelo/40 bg-amarelo/15 px-4 py-2 text-xs text-marrom sm:text-sm">
      <FlaskConical className="size-4 shrink-0" />
      <span>
        <strong>Modo de teste local</strong> — sem login. O que você cadastrar fica salvo só neste navegador.
      </span>
    </div>
  );
}

// Só mostra as telas para quem tem perfil no DEU SEDE! (no modo local,
// o usuário de teste é administrador).
function ConteudoProtegido() {
  const { dados: acesso, erro, carregando } = useConsulta<Acesso | null>("meu_acesso");
  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (carregando && acesso === undefined) return <Carregando texto="Preparando o DEU SEDE!…" />;
  if (!acesso) {
    return (
      <Aviso tom="atencao">
        <strong>Seu usuário ainda não tem acesso ao DEU SEDE!.</strong> Peça ao administrador para liberar o seu perfil.
      </Aviso>
    );
  }
  return (
    <AreaProtegida area="deu-sede">
      <Outlet />
    </AreaProtegida>
  );
}

export function DeuSedeLayout() {
  const { mode, signOut } = useSessaoDeuSede();
  useRecarregarAoVoltar();
  // login "só pedidos de compra": menu só com Pedidos, sem volta para o Calendário
  const soPedidos = useSoPedidos() === true;
  const avisos = useAvisos();
  const itens = (soPedidos ? MODULES.filter((m) => m.key === "pedidos") : MODULES).map((m) => ({
    ...m,
    alerta: avisos[m.key as keyof typeof avisos] ?? 0,
  }));
  const sair = mode === "supabase" && (
    <button type="button" onClick={() => signOut()} className="mt-1 flex h-10 items-center gap-2 text-creme/85 hover:text-creme">
      <LogOut className="size-4" /> Sair
    </button>
  );

  return (
    <div className="deu-sede">
      <Shell
        marca={{ titulo: "DEU SEDE!", to: soPedidos ? INICIO_PEDIDOS : DEU_SEDE_BASE }}
        itens={itens}
        rotuloMenu="Menu DEU SEDE!"
        aviso={<AvisoModoLocal />}
        acaoCabecalho={
          soPedidos ? (
            <button
              type="button"
              onClick={() => signOut()}
              className="flex size-10 shrink-0 items-center justify-center rounded-xl text-creme/90 hover:bg-verde-600"
              aria-label="Sair"
            >
              <LogOut className="size-5" />
            </button>
          ) : (
          <Link
            to={AGENDA_HOME}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-creme/90 hover:bg-verde-600"
          >
            <ArrowLeft className="size-4" /> Calendário
          </Link>
          )
        }
        rodape={
          <>
            {!soPedidos && (
              <Link to={AGENDA_HOME} className="flex h-10 items-center gap-2 font-medium text-creme/85 hover:text-creme">
                <CalendarDays className="size-4" /> Voltar para o Calendário
              </Link>
            )}
            <a href={TELEFONE_LINK} className="flex h-10 items-center gap-2 text-creme/85 hover:text-creme">
              <Phone className="size-4" /> {TELEFONE_CONTATO}
            </a>
            {sair}
          </>
        }
        extrasMenuMais={
          soPedidos ? undefined : (
          <>
            <Link
              to={AGENDA_HOME}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-verde text-sm font-semibold text-creme"
            >
              <CalendarDays className="size-4" /> Voltar ao Calendário
            </Link>
            {mode === "supabase" && (
              <button
                type="button"
                onClick={() => signOut()}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-linha text-sm font-medium text-verde"
              >
                <LogOut className="size-4" /> Sair
              </button>
            )}
          </>
          )
        }
      >
        <SenhaProvider>
          <ConteudoProtegido />
        </SenhaProvider>
      </Shell>
    </div>
  );
}
