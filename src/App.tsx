import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AgendaProvider } from "@/contexts/AgendaContext";
import { RequireAuth } from "@/components/layout/RequireAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { LoginPage } from "@/pages/LoginPage";
import { HomePage } from "@/pages/HomePage";
import { CalendarsPage } from "@/pages/CalendarsPage";
import { CalendarViewPage } from "@/pages/CalendarViewPage";
import { TasksPage } from "@/pages/TasksPage";
import { WorkPage } from "@/pages/WorkPage";
import { SettingsPage } from "@/pages/SettingsPage";

// Componente raiz: define a árvore de rotas.
//
// Camadas de fora para dentro:
//   AuthProvider   -> sabe se há um usuário logado (useAuth em qualquer tela)
//   BrowserRouter  -> habilita navegação por URL (react-router)
//   RequireAuth    -> bloqueia tudo, exceto "/login", se não há sessão
//   AgendaProvider -> dados de calendários/tarefas (useAgenda), só
//                     montado depois que o acesso foi liberado
//   AppLayout      -> cabeçalho + menu fixos; cada página entra no <Outlet />
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
                  <AppLayout />
                </AgendaProvider>
              }
            >
              <Route path="/" element={<HomePage />} />
              <Route path="/calendarios" element={<CalendarsPage />} />
              <Route path="/calendarios/:calendarId" element={<CalendarViewPage />} />
              <Route path="/tarefas" element={<TasksPage />} />
              <Route path="/meu-trabalho" element={<WorkPage />} />
              <Route path="/configuracoes" element={<SettingsPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
