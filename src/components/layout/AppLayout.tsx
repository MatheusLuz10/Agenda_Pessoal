import { Outlet, useLocation } from "react-router-dom";
import { FlaskConical, LogOut, Phone } from "lucide-react";
import { Shell } from "@/components/layout/Shell";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import { NAV_ITEMS } from "@/config/navigation";
import { TELEFONE_CONTATO, TELEFONE_LINK } from "@/config/contato";
import { useAuth } from "@/contexts/AuthContext";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { totalAvisos, useAvisos } from "@/modules/deu-sede/data/avisos";

// Destino do botão "Voltar" (celular) derivado do próprio caminho, sem
// depender do histórico do navegador: quem entra direto numa rota
// aninhada (ex: "/calendarios/abc123", link compartilhado) sobe um nível.
function destinoVoltar(pathname: string): string | null {
  if (NAV_ITEMS.some((item) => item.to === pathname)) return null;
  const partes = pathname.split("/").filter(Boolean);
  if (partes.length <= 1) return "/calendarios";
  return `/${partes.slice(0, -1).join("/")}`;
}

// Esqueleto principal da Distribuidora DEU SEDE! (Shell).
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
      voltarPara={destinoVoltar(pathname)}
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
