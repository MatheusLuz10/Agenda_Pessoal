import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { AgendaProvider } from "@/contexts/AgendaContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { FinanceProvider } from "@/contexts/FinanceContext";
import { WorkProvider } from "@/contexts/WorkContext";
import { AssistantPage } from "@/pages/AssistantPage";
import { CalendarViewPage } from "@/pages/CalendarViewPage";
import { CalendarsPage } from "@/pages/CalendarsPage";
import { FinancesPage } from "@/pages/FinancesPage";
import { HomePage } from "@/pages/HomePage";
import { LoginPage } from "@/pages/LoginPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { TasksPage } from "@/pages/TasksPage";
import { WorkPage } from "@/pages/WorkPage";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<RequireAuth />}>
            <Route
              element={
                <AgendaProvider>
                  <FinanceProvider>
                    <WorkProvider>
                      <AppLayout />
                    </WorkProvider>
                  </FinanceProvider>
                </AgendaProvider>
              }
            >
              <Route index element={<HomePage />} />
              <Route path="/calendarios" element={<CalendarsPage />} />
              <Route path="/calendarios/:calendarId" element={<CalendarViewPage />} />
              <Route path="/tarefas" element={<TasksPage />} />
              <Route path="/meu-trabalho" element={<WorkPage />} />
              <Route path="/assistente" element={<AssistantPage />} />
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
