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

-- Lançamentos financeiros (entrada/saída) da funcionalidade "Conta".
-- Não pertencem a um calendário específico — aparecem agregados na
-- página Finanças e como marcadores na visão geral da agenda.
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('entrada', 'saida')),
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  category text not null,
  date date not null,
  observation text,
  recurrent boolean not null default false,
  recurrence_frequency text check (recurrence_frequency in ('mensal', 'semanal', 'anual')),
  created_at timestamptz not null default now()
);

create index if not exists transactions_date_idx on public.transactions (date);

-- Metas de economia (ex: "Notebook novo", valor guardado / valor objetivo).
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_amount numeric(12, 2) not null check (target_amount > 0),
  saved_amount numeric(12, 2) not null default 0 check (saved_amount >= 0),
  created_at timestamptz not null default now()
);

-- Row Level Security (RLS): obrigatório no Supabase para que a anon key
-- (pública, exposta no front-end) só acesse o que as políticas abaixo
-- permitirem.
alter table public.calendars enable row level security;
alter table public.tasks enable row level security;
alter table public.transactions enable row level security;
alter table public.goals enable row level security;

-- Este é um calendário PESSOAL: qualquer usuário autenticado (logado via
-- a tela de login do app, ver src/pages/LoginPage.tsx) tem acesso total.
-- A chave pública (anon/publishable) sozinha NÃO basta mais para
-- ler/escrever — é preciso um login válido, por isso auth.uid() (id do
-- usuário logado) precisa existir. Se quiser reaplicar este schema do
-- zero, rode "drop policy" das políticas antigas antes (se existirem).
drop policy if exists "anon full access calendars" on public.calendars;
drop policy if exists "anon full access tasks" on public.tasks;

create policy "authenticated full access calendars" on public.calendars
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access tasks" on public.tasks
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access transactions" on public.transactions
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access goals" on public.goals
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
