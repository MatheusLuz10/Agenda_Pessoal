import * as React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CalendarGroup, Tag, Task } from "@/types";
import { mockCalendars, mockTags, mockTasks } from "@/data/mockData";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { todayISO } from "@/lib/date";
import {
  fetchCalendars,
  fetchTasks,
  fetchTags,
  createCalendar,
  createTask,
  createTag,
  removeTag,
  setTaskTags,
  updateTaskStatus,
  updateTask as updateTaskApi,
  removeTask,
  removeCalendar,
} from "@/data/supabaseApi";

// Formato de tudo que este contexto expõe: os dados (calendars, tasks) e
// as funções para lê-los/alterá-los. Qualquer componente pode acessar
// isso chamando o hook useAgenda() — é assim que, por exemplo, a Home e a
// página de Tarefas mostram os mesmos dados sem precisar passar props
// manualmente por toda a árvore de componentes ("prop drilling").
interface AgendaContextValue {
  calendars: CalendarGroup[];
  tasks: Task[];
  tags: Tag[];
  loading: boolean;
  addCalendar: (calendar: Omit<CalendarGroup, "id" | "createdAt">) => void;
  addTask: (
    task: Omit<Task, "id" | "status" | "tags"> & { status?: Task["status"]; tagIds?: string[] }
  ) => void;
  updateTask: (
    taskId: string,
    fields: Partial<Pick<Task, "title" | "description" | "date" | "time" | "priority" | "observation">> & {
      tagIds?: string[];
    }
  ) => void;
  toggleTaskStatus: (taskId: string) => void;
  deleteTask: (taskId: string) => void;
  deleteCalendar: (calendarId: string) => void;
  addTag: (name: string, color: string) => Promise<Tag>;
  deleteTag: (tagId: string) => void;
  getCalendarById: (calendarId: string) => CalendarGroup | undefined;
  getTasksByCalendar: (calendarId: string) => Task[];
}

const AgendaContext = createContext<AgendaContextValue | null>(null);

// Provedor de estado global da agenda. Estratégia de dados:
//
//   - Se VITE_SUPABASE_URL/ANON_KEY não estão configuradas
//     (isSupabaseConfigured === false), o app usa os arrays mockados de
//     src/data/mockData.ts, guardados em useState — tudo vive só na
//     memória do navegador e se perde ao recarregar a página.
//
//   - Se o Supabase está configurado, ao montar o provider buscamos os
//     dados reais do banco (useEffect abaixo) e cada função de escrita
//     (addCalendar, addTask, etc.) também grava no Supabase, além de
//     atualizar o estado local para a tela responder instantaneamente
//     ("atualização otimista": a UI muda antes da confirmação do
//     servidor, assumindo que a escrita vai funcionar).
//
// Isso permite estudar/desenvolver o app sem precisar de credenciais, e
// trocar para dados reais só preenchendo o .env.local — sem mudar nenhum
// componente de tela.
export function AgendaProvider({ children }: { children: React.ReactNode }) {
  const [calendars, setCalendars] = useState<CalendarGroup[]>(
    isSupabaseConfigured ? [] : mockCalendars
  );
  const [tasks, setTasks] = useState<Task[]>(isSupabaseConfigured ? [] : mockTasks);
  const [tags, setTags] = useState<Tag[]>(isSupabaseConfigured ? [] : mockTags);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  // Busca os dados reais uma única vez, quando o app inicia (array de
  // dependências vazio = roda só na montagem do componente).
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let isMounted = true;
    Promise.all([fetchCalendars(), fetchTasks(), fetchTags()])
      .then(([calendarsData, tasksData, tagsData]) => {
        if (!isMounted) return;
        setCalendars(calendarsData);
        setTasks(tasksData);
        setTags(tagsData);
      })
      .catch((error) => {
        console.error("Falha ao carregar dados do Supabase:", error);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    // Função de limpeza: evita atualizar o estado se o componente foi
    // desmontado antes da resposta do Supabase chegar.
    return () => {
      isMounted = false;
    };
  }, []);

  // Cria um calendário. Gera um id temporário para exibir na tela
  // imediatamente; se o Supabase estiver configurado, grava no banco em
  // segundo plano e troca pelo id real quando a resposta chega.
  const addCalendar: AgendaContextValue["addCalendar"] = (calendar) => {
    const optimisticCalendar: CalendarGroup = {
      ...calendar,
      id: `cal-${Date.now()}`,
      createdAt: todayISO(),
    };
    setCalendars((prev) => [...prev, optimisticCalendar]);

    if (isSupabaseConfigured) {
      createCalendar(calendar)
        .then((saved) => {
          setCalendars((prev) =>
            prev.map((c) => (c.id === optimisticCalendar.id ? saved : c))
          );
        })
        .catch((error) => console.error("Falha ao criar calendário:", error));
    }
  };

  // Mesma lógica de atualização otimista usada em addCalendar, aplicada
  // à criação de tarefas. tagIds vira `tags` (objetos completos) só na
  // UI local, resolvidos a partir do estado `tags` já carregado — o
  // Supabase guarda só o vínculo (task_tags), não os objetos.
  const addTask: AgendaContextValue["addTask"] = (task) => {
    const { tagIds, ...taskFields } = task;
    const resolvedTags = tags.filter((tag) => tagIds?.includes(tag.id));
    const optimisticTask: Task = {
      ...taskFields,
      id: `task-${Date.now()}`,
      status: task.status ?? "pendente",
      tags: resolvedTags,
    };
    setTasks((prev) => [...prev, optimisticTask]);

    if (isSupabaseConfigured) {
      createTask(task)
        .then((saved) => {
          setTasks((prev) =>
            prev.map((t) => (t.id === optimisticTask.id ? { ...saved, tags: resolvedTags } : t))
          );
        })
        .catch((error) => console.error("Falha ao criar tarefa:", error));
    }
  };

  // Atualiza os campos editáveis de uma tarefa já existente. Mesma
  // estratégia otimista das demais funções de escrita. tagIds, quando
  // presente, substitui a lista de etiquetas da tarefa por completo.
  const updateTask: AgendaContextValue["updateTask"] = (taskId, fields) => {
    const { tagIds, ...restFields } = fields;
    const resolvedTags = tagIds ? tags.filter((tag) => tagIds.includes(tag.id)) : undefined;
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, ...restFields, ...(resolvedTags ? { tags: resolvedTags } : {}) } : t))
    );

    if (isSupabaseConfigured) {
      if (tagIds) {
        setTaskTags(taskId, tagIds).catch((error) => console.error("Falha ao atualizar etiquetas:", error));
      }
      updateTaskApi(taskId, restFields).catch((error) =>
        console.error("Falha ao atualizar tarefa:", error)
      );
    }
  };

  // Alterna pendente <-> concluída. Atualiza o estado local primeiro
  // (resposta instantânea ao clique na checkbox) e só então sincroniza
  // com o Supabase, se configurado.
  const toggleTaskStatus = (taskId: string) => {
    const current = tasks.find((t) => t.id === taskId);
    if (!current) return;
    const nextStatus: Task["status"] = current.status === "concluida" ? "pendente" : "concluida";

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: nextStatus } : t)));

    if (isSupabaseConfigured) {
      updateTaskStatus(taskId, nextStatus).catch((error) =>
        console.error("Falha ao atualizar status da tarefa:", error)
      );
    }
  };

  const deleteTask = (taskId: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== taskId));

    if (isSupabaseConfigured) {
      removeTask(taskId).catch((error) => console.error("Falha ao excluir tarefa:", error));
    }
  };

  // Remove o calendário e, localmente, todas as tarefas vinculadas a ele.
  // No Supabase, a exclusão em cascata das tarefas é feita pelo próprio
  // banco (ON DELETE CASCADE definido em supabase/schema.sql).
  const deleteCalendar = (calendarId: string) => {
    setCalendars((prev) => prev.filter((calendar) => calendar.id !== calendarId));
    setTasks((prev) => prev.filter((task) => task.calendarId !== calendarId));

    if (isSupabaseConfigured) {
      removeCalendar(calendarId).catch((error) =>
        console.error("Falha ao excluir calendário:", error)
      );
    }
  };

  // Cria uma etiqueta nova (ex: "Urgente"), disponível pra qualquer
  // tarefa a partir de então. Devolve (via Promise) o id final da
  // etiqueta — quando o Supabase está configurado, espera o id real do
  // banco em vez do id otimista temporário, pra quem chamou (ex: o
  // seletor de etiquetas do formulário de tarefa) poder selecionar a
  // etiqueta certa sem risco de ficar com um id que vai deixar de
  // existir assim que a resposta do servidor chegar.
  const addTag: AgendaContextValue["addTag"] = async (name, color) => {
    const optimisticTag: Tag = { id: `tag-${Date.now()}`, name, color };
    setTags((prev) => [...prev, optimisticTag]);

    if (isSupabaseConfigured) {
      try {
        const saved = await createTag(name, color);
        setTags((prev) => prev.map((tag) => (tag.id === optimisticTag.id ? saved : tag)));
        return saved;
      } catch (error) {
        console.error("Falha ao criar etiqueta:", error);
        return optimisticTag;
      }
    }
    return optimisticTag;
  };

  // Remove a etiqueta e, localmente, tira ela de qualquer tarefa que a
  // usava. No Supabase, task_tags é limpo pelo próprio banco (ON DELETE
  // CASCADE, ver supabase/schema.sql).
  const deleteTag = (tagId: string) => {
    setTags((prev) => prev.filter((tag) => tag.id !== tagId));
    setTasks((prev) => prev.map((task) => ({ ...task, tags: task.tags.filter((tag) => tag.id !== tagId) })));

    if (isSupabaseConfigured) {
      removeTag(tagId).catch((error) => console.error("Falha ao excluir etiqueta:", error));
    }
  };

  const getCalendarById = (calendarId: string) =>
    calendars.find((c) => c.id === calendarId);

  const getTasksByCalendar = (calendarId: string) =>
    tasks.filter((t) => t.calendarId === calendarId);

  // useMemo evita recriar este objeto (e disparar re-renders em cascata
  // nos componentes que usam o contexto) a cada render do Provider,
  // recalculando só quando calendars/tasks/tags/loading realmente mudam.
  const value = useMemo(
    () => ({
      calendars,
      tasks,
      tags,
      loading,
      addCalendar,
      addTask,
      updateTask,
      toggleTaskStatus,
      deleteTask,
      deleteCalendar,
      addTag,
      deleteTag,
      getCalendarById,
      getTasksByCalendar,
    }),
    [calendars, tasks, tags, loading]
  );

  return <AgendaContext.Provider value={value}>{children}</AgendaContext.Provider>;
}

// Hook de acesso ao contexto. Lança um erro claro se for usado fora do
// AgendaProvider, em vez de falhar silenciosamente com `ctx` undefined.
export function useAgenda() {
  const ctx = useContext(AgendaContext);
  if (!ctx) throw new Error("useAgenda deve ser usado dentro de AgendaProvider");
  return ctx;
}
