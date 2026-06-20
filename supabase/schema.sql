-- Schema do "Minha Agenda" para o Supabase (Postgres).
-- Como rodar: abra seu projeto em supabase.com -> SQL Editor -> cole este
-- arquivo inteiro -> Run. Depois copie a "Project URL" e a "anon key"
-- (Project Settings > API) para o seu .env.local (ver .env.example).

-- Tabela de calendários (grupos independentes, ex: "Faculdade", "Pets").
create table if not exists public.calendars (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null,
  color text not null,
  start_date date,
  end_date date,
  observation text,
  created_at timestamptz not null default now()
);

-- Tabela de tarefas, cada uma pertencente a um calendário (calendar_id).
-- on delete cascade: excluir um calendário já remove suas tarefas no
-- banco, espelhando o que AgendaContext.deleteCalendar faz no front-end.
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.calendars (id) on delete cascade,
  title text not null,
  description text,
  date date not null,
  time time,
  priority text not null check (priority in ('baixa', 'media', 'alta')),
  observation text,
  status text not null default 'pendente' check (status in ('pendente', 'concluida')),
  created_at timestamptz not null default now()
);

-- Índice para acelerar a busca de tarefas de um calendário específico
-- (usado por getTasksByCalendar no AgendaContext).
create index if not exists tasks_calendar_id_idx on public.tasks (calendar_id);

-- Row Level Security (RLS): obrigatório no Supabase para que a anon key
-- (pública, exposta no front-end) só acesse o que as políticas abaixo
-- permitirem.
alter table public.calendars enable row level security;
alter table public.tasks enable row level security;

-- Este projeto é um calendário PESSOAL de um único usuário, sem tela de
-- login. Por isso as políticas abaixo liberam acesso total via anon key.
-- Se este app ganhar múltiplos usuários no futuro, troque estas políticas
-- por regras que filtrem por auth.uid() (ex: adicionar uma coluna
-- user_id e exigir user_id = auth.uid() em cada política).
create policy "anon full access calendars" on public.calendars
  for all using (true) with check (true);

create policy "anon full access tasks" on public.tasks
  for all using (true) with check (true);
