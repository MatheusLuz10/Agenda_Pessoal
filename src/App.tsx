import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AgendaProvider } from "@/contexts/AgendaContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { HomePage } from "@/pages/HomePage";
import { CalendarsPage } from "@/pages/CalendarsPage";
import { CalendarViewPage } from "@/pages/CalendarViewPage";
import { TasksPage } from "@/pages/TasksPage";
import { WorkPage } from "@/pages/WorkPage";
import { SettingsPage } from "@/pages/SettingsPage";

// Componente raiz: define a árvore de rotas e envolve tudo com o
// AgendaProvider, para que qualquer página possa chamar useAgenda() e
// ler/alterar calendários e tarefas. AppLayout é a rota "pai" — todas as
// páginas abaixo dela são renderizadas dentro do <Outlet /> do layout
// (cabeçalho + menu sempre visíveis).
function App() {
  return (
    <AgendaProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/calendarios" element={<CalendarsPage />} />
            <Route path="/calendarios/:calendarId" element={<CalendarViewPage />} />
            <Route path="/tarefas" element={<TasksPage />} />
            <Route path="/meu-trabalho" element={<WorkPage />} />
            <Route path="/configuracoes" element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AgendaProvider>
  );
}

export default App;
