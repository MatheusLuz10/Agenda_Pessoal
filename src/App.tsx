import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { AgendaProvider } from "@/contexts/AgendaContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { FinanceProvider } from "@/contexts/FinanceContext";
import { OperationProvider } from "@/contexts/OperationContext";
import { ServiceRequestsProvider } from "@/contexts/ServiceRequestsContext";
import { WorkProvider } from "@/contexts/WorkContext";
import { CalendarViewPage } from "@/pages/CalendarViewPage";
import { CalendarsPage } from "@/pages/CalendarsPage";
import { FinancesPage } from "@/pages/FinancesPage";
import { LoginPage } from "@/pages/LoginPage";
import { OperationsPage } from "@/pages/OperationsPage";
import { ReportsPage } from "@/pages/ReportsPage";
import { ServiceRequestPublicPage } from "@/pages/ServiceRequestPublicPage";
import { ServiceRequestsPage } from "@/pages/ServiceRequestsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { TimeManagementPage } from "@/pages/TimeManagementPage";
import { TtkPage } from "@/pages/TtkPage";
import { WorkPage } from "@/pages/WorkPage";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Única rota pública do app: sem RequireAuth, sem AppLayout,
              acessível por QR Code ou link direto, sem login. */}
          <Route path="/solicitar-servico" element={<ServiceRequestPublicPage />} />

          <Route element={<RequireAuth />}>
            <Route
              element={
                <AgendaProvider>
                  <FinanceProvider>
                    <WorkProvider>
                      <OperationProvider>
                        <ServiceRequestsProvider>
                          <AppLayout />
                        </ServiceRequestsProvider>
                      </OperationProvider>
                    </WorkProvider>
                  </FinanceProvider>
                </AgendaProvider>
              }
            >
              <Route index element={<Navigate to="/calendarios" replace />} />
              <Route path="/calendarios" element={<CalendarsPage />} />
              <Route path="/calendarios/:calendarId" element={<CalendarViewPage />} />
              <Route path="/meu-trabalho" element={<WorkPage />} />
              <Route path="/meu-trabalho/ttk" element={<TtkPage />} />
              <Route path="/meu-trabalho/relatorios" element={<ReportsPage />} />
              <Route path="/operacao" element={<OperationsPage />} />
              <Route path="/gestao-de-tempo" element={<TimeManagementPage />} />
              <Route path="/solicitacoes" element={<ServiceRequestsPage />} />
              <Route path="/financas" element={<FinancesPage />} />
              <Route path="/configuracoes" element={<SettingsPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
