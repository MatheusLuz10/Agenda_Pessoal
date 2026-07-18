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

-- Equipamentos da aba "Meu trabalho": itens de manutenção do carro,
-- EPIs e conectores/ferramentas de fusão.
create table if not exists public.equipment_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null check (category in ('manutencao', 'epis', 'conectores')),
  condition text not null check (condition in ('Bom', 'Médio', 'Defeituoso')),
  observation text,
  created_at timestamptz not null default now()
);

-- Ordens de serviço (OS) da aba "Meu trabalho", cada uma com sua própria
-- data para permitir calcular "OSs da semana".
create table if not exists public.service_orders (
  id uuid primary key default gen_random_uuid(),
  client text not null,
  description text not null,
  date date not null,
  status text not null default 'pendente' check (status in ('pendente', 'em_andamento', 'concluida')),
  observation text,
  created_at timestamptz not null default now()
);

create index if not exists service_orders_date_idx on public.service_orders (date);

-- Atividades (BA/BD) da aba "Operação", uma por dia+tipo (ou várias, se
-- lançadas em momentos diferentes) — usadas para calcular produção,
-- categoria e prêmio do ciclo.
create table if not exists public.operation_activities (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('BA', 'BD')),
  date date not null,
  quantity integer not null default 1 check (quantity > 0),
  description text,
  created_at timestamptz not null default now()
);

-- "add column if not exists" garante que quem já rodou este schema antes
-- (sem a coluna description) recebe ela numa nova execução, sem erro.
alter table public.operation_activities add column if not exists description text;

create index if not exists operation_activities_date_idx on public.operation_activities (date);

-- Registros de ponto (entrada, almoço, saída) da aba "Operação", usados
-- para calcular horas extras e DSR. Um registro por dia.
create table if not exists public.operation_punches (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  clock_in time not null,
  lunch_start time not null,
  lunch_end time not null,
  clock_out time not null,
  created_at timestamptz not null default now()
);

-- Configurações usadas nos cálculos da aba "Operação" (ciclo, salário,
-- periculosidade, jornada, efetividade). Linha única: o app sempre lê/
-- grava o primeiro registro desta tabela (ver src/data/operationApi.ts).
create table if not exists public.operation_settings (
  id uuid primary key default gen_random_uuid(),
  cycle_start_day integer not null default 1 check (cycle_start_day between 1 and 31),
  cycle_end_day integer not null default 1 check (cycle_end_day between 1 and 31),
  base_salary numeric(12, 2) not null default 0 check (base_salary >= 0),
  hazard_pay_percent numeric(5, 2) not null default 0 check (hazard_pay_percent >= 0),
  weekly_hours numeric(5, 2) not null default 44 check (weekly_hours > 0),
  effectiveness_percent numeric(5, 2) not null default 0 check (effectiveness_percent >= 0),
  updated_at timestamptz not null default now()
);

-- Ajustes manuais do Card "Resumo financeiro" da aba "Operação", um
-- registro por ciclo (cycle_start = data de início do ciclo). Colunas
-- nulas significam "usar o valor calculado automaticamente".
create table if not exists public.operation_financial_overrides (
  id uuid primary key default gen_random_uuid(),
  cycle_start date not null unique,
  base_salary numeric(12, 2),
  hazard_pay numeric(12, 2),
  overtime50_amount numeric(12, 2),
  overtime100_amount numeric(12, 2),
  dsr_amount numeric(12, 2),
  prize_amount numeric(12, 2),
  updated_at timestamptz not null default now()
);

-- Relatórios de "batimento de caixa" (contagem de portas livres/ocupadas
-- de uma CTO) gerados na aba "Meu trabalho" > Ações rápidas > Relatórios.
-- Só os 3 mais recentes são mantidos (ver saveBatimentoReport em
-- src/data/batimentoApi.ts, que apaga o excedente após cada insert) —
-- por isso não há necessidade de índice por data aqui.
create table if not exists public.batimento_reports (
  id uuid primary key default gen_random_uuid(),
  atendente text,
  protocolo text,
  caixa_batida text,
  portas_livres text,
  porta_utilizada text,
  obs text,
  created_at timestamptz not null default now()
);

-- Row Level Security (RLS): obrigatório no Supabase para que a anon key
-- (pública, exposta no front-end) só acesse o que as políticas abaixo
-- permitirem.
alter table public.calendars enable row level security;
alter table public.tasks enable row level security;
alter table public.transactions enable row level security;
alter table public.goals enable row level security;
alter table public.equipment_items enable row level security;
alter table public.service_orders enable row level security;
alter table public.operation_activities enable row level security;
alter table public.operation_punches enable row level security;
alter table public.operation_settings enable row level security;
alter table public.operation_financial_overrides enable row level security;
alter table public.batimento_reports enable row level security;

-- Este é um calendário PESSOAL: qualquer usuário autenticado (logado via
-- a tela de login do app, ver src/pages/LoginPage.tsx) tem acesso total.
-- A chave pública (anon/publishable) sozinha NÃO basta mais para
-- ler/escrever — é preciso um login válido, por isso auth.uid() (id do
-- usuário logado) precisa existir. O "drop policy if exists" de cada
-- política abaixo torna este script seguro para rodar mais de uma vez
-- (ex: ao adicionar uma tabela nova) sem dar erro de política duplicada.
drop policy if exists "anon full access calendars" on public.calendars;
drop policy if exists "anon full access tasks" on public.tasks;
drop policy if exists "authenticated full access calendars" on public.calendars;
drop policy if exists "authenticated full access tasks" on public.tasks;
drop policy if exists "authenticated full access transactions" on public.transactions;
drop policy if exists "authenticated full access goals" on public.goals;
drop policy if exists "authenticated full access equipment_items" on public.equipment_items;
drop policy if exists "authenticated full access service_orders" on public.service_orders;
drop policy if exists "authenticated full access operation_activities" on public.operation_activities;
drop policy if exists "authenticated full access operation_punches" on public.operation_punches;
drop policy if exists "authenticated full access operation_settings" on public.operation_settings;
drop policy if exists "authenticated full access operation_financial_overrides" on public.operation_financial_overrides;
drop policy if exists "authenticated full access batimento_reports" on public.batimento_reports;

create policy "authenticated full access calendars" on public.calendars
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access tasks" on public.tasks
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access transactions" on public.transactions
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access goals" on public.goals
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access equipment_items" on public.equipment_items
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access service_orders" on public.service_orders
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access operation_activities" on public.operation_activities
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access operation_punches" on public.operation_punches
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access operation_settings" on public.operation_settings
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access operation_financial_overrides" on public.operation_financial_overrides
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access batimento_reports" on public.batimento_reports
  for all using (auth.uid() is not null) with check (auth.uid() is not null);
