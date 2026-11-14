import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { AgendaProvider } from "@/contexts/AgendaContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { LoginPage } from "@/pages/LoginPage";
import { deuSedeRoutes } from "@/modules/deu-sede/routes";
import { SenhaProvider } from "@/modules/deu-sede/senha";
import { TravaSoPedidos } from "@/modules/deu-sede/acessoPedidos";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { telaSobDemanda } from "@/lib/telaSobDemanda";

// Telas baixadas só quando são abertas (ver src/lib/telaSobDemanda.tsx).
const CalendarsPage = telaSobDemanda(() => import("@/pages/CalendarsPage"), "CalendarsPage");
const CalendarViewPage = telaSobDemanda(() => import("@/pages/CalendarViewPage"), "CalendarViewPage");
const PdvPage = telaSobDemanda(() => import("@/modules/deu-sede/pages/PdvPage"), "PdvPage");

// Abas do app: ADM - DEU SEDE! (compras, estoque, financeiro...), PDV e
// Calendário.
//
// "Meu trabalho" (com TTK e relatórios), "Conecta Rede" (com a página
// pública /solicitar-servico), "Gestão de tempo", "Finanças", "Documentos"
// e as Configurações da Agenda saíram do app. Os arquivos continuam em src/pages e src/contexts, sem uso — para
// voltar com alguma, basta recolocar a rota e o provider aqui.
function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<RequireAuth />}>
            {/* login "só pedidos de compra": fica preso em /deu-sede/pedidos */}
            <Route element={<TravaSoPedidos />}>
            {/* DEU SEDE! (gestão de compras): menu próprio, mesmo visual —
                ver src/modules/deu-sede. */}
            {deuSedeRoutes}

            <Route
              element={
                <AgendaProvider>
                  <AppLayout />
                </AgendaProvider>
              }
            >
              <Route index element={<Navigate to="/calendarios" replace />} />
              <Route path="/calendarios" element={<CalendarsPage />} />
              <Route path="/calendarios/:calendarId" element={<CalendarViewPage />} />
              <Route
                path="/pdv"
                element={
                  <SenhaProvider>
                    <PdvPage />
                  </SenhaProvider>
                }
              />
              <Route path="*" element={<Navigate to="/calendarios" replace />} />
            </Route>
            </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
