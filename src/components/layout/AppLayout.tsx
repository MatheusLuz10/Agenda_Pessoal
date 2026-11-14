import { Outlet, useLocation } from "react-router-dom";
import { FlaskConical, LogOut, Phone } from "lucide-react";
import { Shell } from "@/components/layout/Shell";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import { NAV_ITEMS } from "@/config/navigation";
import { TELEFONE_CONTATO, TELEFONE_LINK } from "@/config/contato";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { totalAvisos, useAvisos } from "@/modules/deu-sede/data/avisos";

// Esqueleto principal da Distribuidora DEU SEDE! (Shell). O botão "Voltar"
// de todas as telas fica no Shell.
export function AppLayout() {
  const { pathname } = useLocation();
  const { signOut } = useAuth();
  // bolinha vermelha em "DEU SEDE! Compras" quando alguma aba de lá tem aviso
  const avisosDeuSede = totalAvisos(useAvisos());
  const itens = NAV_ITEMS.map((i) => (i.key === "deu-sede" ? { ...i, alerta: avisosDeuSede } : i));

  return (
    <Shell
      marca={{ titulo: "Distribuidora DEU SEDE!", to: "/calendarios" }}
      itens={itens}
      rotuloMenu="Menu principal"
      telaCheia={pathname === "/pdv"}
      acaoCabecalho={
        isSupabaseConfigured ? (
          <button
            type="button"
            onClick={() => signOut()}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl text-creme/90 hover:bg-verde-600"
            aria-label="Sair"
          >
            <LogOut className="size-5" />
          </button>
        ) : null
      }
      rodape={
        isSupabaseConfigured ? (
          <>
            <a href={TELEFONE_LINK} className="flex h-10 items-center gap-2 text-creme/85 hover:text-creme">
              <Phone className="size-4" /> {TELEFONE_CONTATO}
            </a>
            <button type="button" onClick={() => signOut()} className="mt-1 flex h-10 items-center gap-2 text-creme/85 hover:text-creme">
              <LogOut className="size-4" /> Sair
            </button>
          </>
        ) : (
          <>
            <a href={TELEFONE_LINK} className="flex h-10 items-center gap-2 text-creme/85 hover:text-creme">
              <Phone className="size-4" /> {TELEFONE_CONTATO}
            </a>
            <p className="mt-1 flex items-center gap-2 text-creme/60">
              <FlaskConical className="size-4" /> Modo de teste local
            </p>
          </>
        )
      }
    >
      <Outlet />
      {pathname !== "/pdv" && <AssistantWidget />}
    </Shell>
  );
}
