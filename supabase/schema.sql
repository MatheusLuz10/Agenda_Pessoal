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

-- Histórico de trocas de itens que estavam "Defeituoso" (botão "Registrar
-- troca" no Card "Controle" da aba Meu trabalho, ver src/pages/WorkPage.tsx).
-- Guarda o nome do item na hora da troca (não só a referência) pra
-- continuar aparecendo no relatório de defeitos mesmo que o item original
-- seja excluído depois — por isso "on delete set null" em item_id, em vez
-- de cascade.
create table if not exists public.equipment_replacements (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references public.equipment_items (id) on delete set null,
  item_name text not null,
  category text not null check (category in ('manutencao', 'epis', 'conectores')),
  observation text,
  replaced_at date not null default current_date,
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

-- Perfil (nome + foto) editado na tela Configurações: linha única com a
-- posição/zoom escolhidos no editor (ver src/data/userProfileApi.ts). A
-- foto em si fica no Storage (bucket "avatars" abaixo), aqui só a URL
-- pública.
create table if not exists public.user_profile (
  id uuid primary key default gen_random_uuid(),
  photo_url text,
  photo_position_x numeric(5, 2) not null default 50,
  photo_position_y numeric(5, 2) not null default 50,
  photo_zoom numeric(5, 2) not null default 1,
  updated_at timestamptz not null default now()
);

-- "add column if not exists" garante que quem já rodou este schema antes
-- também ganhe a coluna nova sem precisar recriar a tabela.
alter table public.user_profile add column if not exists name text not null default '';

-- Bucket público (leitura livre da foto, sem precisar de token) onde a
-- foto de perfil é enviada. "on conflict do nothing" torna seguro rodar
-- este script mais de uma vez.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "authenticated manage avatars" on storage.objects;
create policy "authenticated manage avatars" on storage.objects
  for all using (bucket_id = 'avatars' and auth.uid() is not null)
  with check (bucket_id = 'avatars' and auth.uid() is not null);

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

-- ==========================================================================
-- Módulo "Motor de Regras" (src/modules/rule-engine) — completamente
-- isolado do resto do app: organiza automaticamente as tarefas do
-- usuário por regras determinísticas (sem IA). Tabelas prefixadas com
-- "rule_engine_" para não colidir com nada existente.
-- ==========================================================================

-- Ordem de prioridade das categorias (Desenvolvimento pessoal, Saúde,
-- Relacionamento, Casa, Pets, Financeiro por padrão) — configurável pelo
-- usuário. Vazio = o front-end usa a ordem padrão até o usuário reordenar
-- pela primeira vez (mesmo padrão de operation_settings: null/vazio =
-- "usar valor padrão").
create table if not exists public.rule_engine_priorities (
  id uuid primary key default gen_random_uuid(),
  category text not null unique,
  position integer not null,
  created_at timestamptz not null default now()
);

-- Horários fixos/bloqueados da rotina (trabalho, faculdade, sono etc.),
-- recorrentes por dia da semana (0 = domingo .. 6 = sábado). day_of_week
-- nulo = todos os dias da semana (ex: sono, que bloqueia todo dia).
create table if not exists public.rule_engine_blocked_schedules (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  day_of_week integer check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  mid_start time,
  mid_end time,
  created_at timestamptz not null default now()
);

-- Permite rodar este script de novo em quem já tinha a coluna como
-- "not null" de uma versão anterior, sem dar erro.
alter table public.rule_engine_blocked_schedules alter column day_of_week drop not null;

-- Pausa no meio do bloqueio (ex: almoço no meio do horário de
-- trabalho) — colunas novas, opcionais, adicionadas com segurança em
-- quem já tinha a tabela sem elas.
alter table public.rule_engine_blocked_schedules add column if not exists mid_start time;
alter table public.rule_engine_blocked_schedules add column if not exists mid_end time;

-- Regras de negócio cadastráveis (ex: "Nunca sacrificar horário de
-- estudo") que o motor de decisão usa pra organizar o dia.
create table if not exists public.rule_engine_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  enabled boolean not null default true,
  priority integer not null default 0,
  created_at timestamptz not null default now()
);

-- Índice único usado pelo "on conflict (name)" do seed de regras mais
-- abaixo, pra rodar este script de novo sem duplicar a regra padrão.
create unique index if not exists rule_engine_rules_name_idx on public.rule_engine_rules (name);

-- Histórico de decisões tomadas pelo motor (ex: "Banheiro adiado porque
-- estudo possui prioridade maior"), exibido na aba Histórico.
create table if not exists public.rule_engine_planner_logs (
  id uuid primary key default gen_random_uuid(),
  decision text not null,
  reason text not null,
  created_at timestamptz not null default now()
);

-- "Leitura atual": tema/título + link externo (ex: um arquivo do
-- usuário hospedado no Mega) mostrado como sugestão de fallback em
-- "Iniciar Dia"/"Off Work" quando nenhuma tarefa cabe no tempo livre
-- restante. É um registro só (singleton) — salvar sempre apaga o
-- anterior e insere um novo, então nunca acumula histórico aqui.
create table if not exists public.rule_engine_current_reading (
  id uuid primary key default gen_random_uuid(),
  theme text not null,
  link text not null,
  updated_at timestamptz not null default now()
);

-- Registro de execução de cada atividade da vida diária (não é do
-- trabalho) medido pelo cronômetro de "Gestão de tempo", vinculado a
-- uma categoria de prioridade — usado internamente pelo motor pra
-- calcular o tempo médio de cada atividade e melhorar o planejamento
-- ("montar o dia" com base no tempo real de cada uma). task_id não tem
-- FK pra public.tasks de propósito: o histórico deve sobreviver mesmo
-- que a tarefa original seja apagada depois.
create table if not exists public.rule_engine_execution_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid,
  activity_name text,
  category text,
  started_at timestamptz not null,
  finished_at timestamptz,
  duration_seconds integer,
  created_at timestamptz not null default now()
);

-- "add column if not exists" garante que quem já rodou este schema
-- antes (sem essas colunas) recebe elas numa nova execução, sem erro.
alter table public.rule_engine_execution_history add column if not exists activity_name text;
alter table public.rule_engine_execution_history add column if not exists category text;

-- Estado do planejamento do dia (gerado ao clicar em "Iniciar Dia"), uma
-- linha por data.
create table if not exists public.rule_engine_daily_plan (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  status text not null default 'nao_iniciado' check (status in ('nao_iniciado', 'em_andamento', 'concluido')),
  current_task_id uuid,
  generated_at timestamptz not null default now()
);

-- Tarefas de rotina (casa, saúde, relacionamento etc.) — diferente de
-- public.tasks (compromissos com data fixa em Calendários): aqui é
-- "faça isso a cada N dias", sem data marcada. "Iniciar Dia" cruza
-- interval_days com o último registro em rule_engine_execution_history
-- (task_id = id desta tarefa de rotina) pra saber se já venceu.
-- name é unique pra permitir seed idempotente (on conflict do nothing).
create table if not exists public.rule_engine_routine_tasks (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null,
  interval_days integer not null check (interval_days > 0),
  priority integer not null default 0,
  -- Duração estimada (em minutos) da tarefa. Sem isso definido, o item
  -- não aparece em "Iniciar Dia" (só fica "ativo" depois de ter uma
  -- estimativa de tempo) e não entra na conta do resumo do dia.
  estimated_minutes integer,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- "add column if not exists" garante que quem já rodou este schema
-- antes (sem essa coluna) recebe ela numa nova execução, sem erro.
alter table public.rule_engine_routine_tasks add column if not exists estimated_minutes integer;

-- Carga inicial da rotina de casa, saúde, relacionamento etc. — só
-- entra na primeira vez (on conflict do nothing pelo nome), então é
-- seguro editar/apagar essas linhas pelo app depois: rodar este script
-- de novo não vai trazê-las de volta nem duplicar.
insert into public.rule_engine_routine_tasks (name, category, interval_days, priority, estimated_minutes) values
  ('Lavar roupas brancas', 'Casa', 7, 0, 10),
  ('Lavar roupas pretas', 'Casa', 7, 0, 10),
  ('Lavar roupas de cores', 'Casa', 7, 0, 10),
  ('Lavar roupa de trabalho', 'Casa', 2, 1, 10),
  ('Lavar lençol dos pets', 'Pets', 7, 0, 15),
  ('Dobrar e guardar roupa', 'Casa', 3, 0, 20),
  ('Limpar a máquina de lavar', 'Casa', 30, 0, 20),
  ('Arrumar armário da cozinha', 'Casa', 30, 0, 30),
  ('Limpar geladeira', 'Casa', 30, 0, 30),
  ('Lavar e guardar louça', 'Casa', 1, 1, 20),
  ('Limpar fogão', 'Casa', 7, 0, 15),
  ('Limpar forno do fogão', 'Casa', 30, 0, 25),
  ('Aguar planta da cozinha', 'Casa', 3, 0, 5),
  ('Limpar forno e airfryer (quando houver uso)', 'Casa', 14, 0, 15),
  ('Organizar armário do quarto', 'Casa', 30, 0, 30),
  ('Organizar material de limpeza', 'Casa', 30, 0, 20),
  ('Trocar água (antes de acabar o 4º garrafão de 20L)', 'Casa', 20, 0, 5),
  ('Varrer a casa', 'Casa', 2, 0, 20),
  ('Organizar quarto', 'Casa', 3, 0, 20),
  ('Organizar escritório', 'Casa', 7, 0, 20),
  ('Alimentar os pets', 'Pets', 1, 2, 10),
  ('Limpar a sala (onde os pets ficam)', 'Pets', 2, 0, 15),
  ('Passear com os pets', 'Pets', 2, 1, 30),
  ('Lavar garagem', 'Casa', 2, 0, 20),
  ('Juntar cocô dos pets (manhã)', 'Pets', 1, 2, 10),
  ('Limpar areia dos gatos (manhã)', 'Pets', 1, 2, 10),
  ('Limpar e organizar o carro', 'Casa', 7, 0, 40),
  ('Estudar material da faculdade', 'Desenvolvimento pessoal', 1, 2, 60),
  ('Estudar material no Prime Video', 'Desenvolvimento pessoal', 2, 1, 45),
  ('Tempo de qualidade com o marido', 'Relacionamento', 2, 1, 60),
  ('Fazer uma surpresa para o marido', 'Relacionamento', 30, 0, 45),
  ('Limpar banheiro', 'Casa', 7, 0, 30),
  ('Faxina bruta', 'Casa', 40, 0, 120),
  ('Cuidar das plantas', 'Casa', 30, 0, 30),
  ('Correr', 'Saúde', 2, 0, 40),
  ('Ir para academia', 'Saúde', 2, 0, 60),
  ('Sexo', 'Relacionamento', 3, 1, 30),
  ('Pegar sol', 'Saúde', 30, 0, 30),
  ('Rodar de Uber', 'Financeiro', 2, 0, 120)
on conflict (name) do nothing;

-- Regra que documenta o princípio de priorização pedido explicitamente:
-- desenvolvimento pessoal nunca deve ser sacrificado por tarefas de
-- prioridade mais baixa (ver DEFAULT_PRIORITY_CATEGORIES). O motor de
-- decisão já respeita isso ao ordenar a fila por posição em
-- Prioridades — esta linha só torna a regra visível/editável pro
-- usuário na aba Regras.
insert into public.rule_engine_rules (name, description, enabled, priority) values (
  'Nunca sacrificar desenvolvimento pessoal',
  'Tarefas de Desenvolvimento pessoal (estudo, faculdade) sempre vêm antes de tarefas de Casa, Pets ou Financeiro na fila do dia, mesmo que estas estejam atrasadas — a não ser que o atraso da tarefa de casa seja crítico.',
  true,
  10
)
on conflict (name) do nothing;

-- Row Level Security (RLS): obrigatório no Supabase para que a anon key
-- (pública, exposta no front-end) só acesse o que as políticas abaixo
-- permitirem.
alter table public.calendars enable row level security;
alter table public.tasks enable row level security;
alter table public.transactions enable row level security;
alter table public.goals enable row level security;
alter table public.equipment_items enable row level security;
alter table public.equipment_replacements enable row level security;
alter table public.service_orders enable row level security;
alter table public.operation_activities enable row level security;
alter table public.operation_punches enable row level security;
alter table public.operation_settings enable row level security;
alter table public.operation_financial_overrides enable row level security;
alter table public.batimento_reports enable row level security;
alter table public.user_profile enable row level security;
alter table public.rule_engine_priorities enable row level security;
alter table public.rule_engine_blocked_schedules enable row level security;
alter table public.rule_engine_rules enable row level security;
alter table public.rule_engine_planner_logs enable row level security;
alter table public.rule_engine_execution_history enable row level security;
alter table public.rule_engine_daily_plan enable row level security;
alter table public.rule_engine_routine_tasks enable row level security;
alter table public.rule_engine_current_reading enable row level security;

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
drop policy if exists "authenticated full access equipment_replacements" on public.equipment_replacements;
drop policy if exists "authenticated full access service_orders" on public.service_orders;
drop policy if exists "authenticated full access operation_activities" on public.operation_activities;
drop policy if exists "authenticated full access operation_punches" on public.operation_punches;
drop policy if exists "authenticated full access operation_settings" on public.operation_settings;
drop policy if exists "authenticated full access operation_financial_overrides" on public.operation_financial_overrides;
drop policy if exists "authenticated full access batimento_reports" on public.batimento_reports;
drop policy if exists "authenticated full access user_profile" on public.user_profile;
drop policy if exists "authenticated full access rule_engine_priorities" on public.rule_engine_priorities;
drop policy if exists "authenticated full access rule_engine_blocked_schedules" on public.rule_engine_blocked_schedules;
drop policy if exists "authenticated full access rule_engine_rules" on public.rule_engine_rules;
drop policy if exists "authenticated full access rule_engine_planner_logs" on public.rule_engine_planner_logs;
drop policy if exists "authenticated full access rule_engine_execution_history" on public.rule_engine_execution_history;
drop policy if exists "authenticated full access rule_engine_daily_plan" on public.rule_engine_daily_plan;
drop policy if exists "authenticated full access rule_engine_routine_tasks" on public.rule_engine_routine_tasks;
drop policy if exists "authenticated full access rule_engine_current_reading" on public.rule_engine_current_reading;

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

create policy "authenticated full access equipment_replacements" on public.equipment_replacements
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

create policy "authenticated full access user_profile" on public.user_profile
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access rule_engine_priorities" on public.rule_engine_priorities
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access rule_engine_blocked_schedules" on public.rule_engine_blocked_schedules
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access rule_engine_rules" on public.rule_engine_rules
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access rule_engine_planner_logs" on public.rule_engine_planner_logs
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access rule_engine_execution_history" on public.rule_engine_execution_history
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access rule_engine_daily_plan" on public.rule_engine_daily_plan
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access rule_engine_routine_tasks" on public.rule_engine_routine_tasks
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated full access rule_engine_current_reading" on public.rule_engine_current_reading
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ==========================================================================
-- Módulo "Solicitações de Serviços" — a única parte pública do app: um
-- cliente abre um chamado pela página "/solicitar-servico" (QR Code ou
-- link, sem login) e a solicitação some na aba privada "Solicitações"
-- (autenticada, como o resto do app) pra o técnico gerenciar.
-- ==========================================================================

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  -- Preenchido sozinho por trigger (ver set_service_request_number
  -- abaixo) no formato "MM/AAAA-NNN", reiniciando a cada mês — nunca
  -- calculado pelo cliente (que pode ser um visitante sem login).
  request_number text unique,
  client_name text not null,
  company text,
  phone text not null,
  address text not null,
  service_type text not null,
  description text not null,
  status text not null default 'nova' check (
    status in ('nova', 'em_analise', 'agendada', 'em_atendimento', 'concluida', 'cancelada')
  ),
  -- Só o técnico preenche (área privada) — anotações internas, não
  -- vistas pelo cliente em lugar nenhum.
  observations text,
  created_at timestamptz not null default now()
);

create table if not exists public.service_request_photos (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests (id) on delete cascade,
  photo_url text not null,
  created_at timestamptz not null default now()
);

create index if not exists service_request_photos_request_id_idx
  on public.service_request_photos (request_id);

-- Calcula "MM/AAAA-NNN" (ex: 07/2026-001) sozinho a cada nova
-- solicitação. security definer: roda com o privilégio de quem criou a
-- função (não do visitante anônimo que está inserindo), então consegue
-- contar as solicitações do mês mesmo sem ter permissão de leitura —
-- um visitante público nunca precisa (nem consegue) ler a tabela.
--
-- Os 100 primeiros números de cada mês (001-100) são sorteados em ordem
-- aleatória (não em sequência), pra não expor o volume/ritmo de chamados
-- por quem só olha os códigos. A partir do 101º chamado do mês, já não
-- sobra número sorteável no intervalo 1-100, então volta a ser sequencial
-- (101, 102, 103...) normalmente.
create or replace function public.set_service_request_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  month_prefix text := to_char(now(), 'MM/YYYY');
  used_count integer;
  next_seq integer;
begin
  select count(*) into used_count
    from public.service_requests
    where request_number like month_prefix || '-%';

  if used_count < 100 then
    select n into next_seq
      from generate_series(1, 100) as n
      where not exists (
        select 1 from public.service_requests
        where request_number = month_prefix || '-' || lpad(n::text, 3, '0')
      )
      order by random()
      limit 1;
  else
    select coalesce(max(substring(request_number from '-(\d+)$')::integer), 100) + 1
      into next_seq
      from public.service_requests
      where request_number like month_prefix || '-%';
  end if;

  new.request_number := month_prefix || '-' || lpad(next_seq::text, 3, '0');
  return new;
end;
$$;

drop trigger if exists set_service_request_number_trigger on public.service_requests;
create trigger set_service_request_number_trigger
  before insert on public.service_requests
  for each row
  execute function public.set_service_request_number();

-- Bucket público (mesmo padrão do bucket "avatars"): as fotos precisam
-- ser lidas sem token, tanto na hora da pré-visualização quanto depois
-- na aba privada.
insert into storage.buckets (id, name, public)
values ('service-request-photos', 'service-request-photos', true)
on conflict (id) do nothing;

alter table public.service_requests enable row level security;
alter table public.service_request_photos enable row level security;

drop policy if exists "public insert service_requests" on public.service_requests;
drop policy if exists "authenticated select service_requests" on public.service_requests;
drop policy if exists "authenticated update service_requests" on public.service_requests;
drop policy if exists "authenticated delete service_requests" on public.service_requests;
drop policy if exists "public insert service_request_photos" on public.service_request_photos;
drop policy if exists "authenticated select service_request_photos" on public.service_request_photos;
drop policy if exists "authenticated delete service_request_photos" on public.service_request_photos;
drop policy if exists "public upload service-request-photos" on storage.objects;

-- Diferente de TODO o resto do app: qualquer pessoa (mesmo sem login)
-- pode CRIAR uma solicitação — é a própria página pública de abertura
-- de chamado. Mas só quem está autenticado consegue LER/ATUALIZAR/
-- EXCLUIR (gerenciar na aba "Solicitações") — um visitante não
-- consegue ver os chamados de ninguém, só enviar o próprio.
create policy "public insert service_requests" on public.service_requests
  for insert
  with check (true);

create policy "authenticated select service_requests" on public.service_requests
  for select using (auth.uid() is not null);

create policy "authenticated update service_requests" on public.service_requests
  for update using (auth.uid() is not null) with check (auth.uid() is not null);

create policy "authenticated delete service_requests" on public.service_requests
  for delete using (auth.uid() is not null);

create policy "public insert service_request_photos" on public.service_request_photos
  for insert
  with check (true);

create policy "authenticated select service_request_photos" on public.service_request_photos
  for select using (auth.uid() is not null);

create policy "authenticated delete service_request_photos" on public.service_request_photos
  for delete using (auth.uid() is not null);

-- Upload público só neste bucket específico — os demais buckets (ex:
-- "avatars") continuam exigindo login pelas próprias políticas, que não
-- são alteradas aqui.
create policy "public upload service-request-photos" on storage.objects
  for insert
  with check (bucket_id = 'service-request-photos');

-- Código de acompanhamento: o próprio request_number ("MM/AAAA-NNN", já
-- gerado pelo trigger acima) serve de código — o cliente não tem
-- permissão de SELECT na tabela, então usa estas duas funções
-- security definer (rodam com privilégio de quem criou, não do
-- visitante) pra (1) ver o código da solicitação que acabou de criar e
-- (2) consultar o andamento depois, só com os campos relevantes pro
-- status — nunca telefone/endereço/nome de outros clientes.
create or replace function public.get_service_request_number(p_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select request_number from public.service_requests where id = p_id;
$$;

-- Nunca devolve "observations": são anotações internas do técnico (área
-- privada, ver comentário na coluna em service_requests), o cliente não
-- pode ver isso em lugar nenhum — aqui ele só recebe o que precisa pra
-- acompanhar o andamento do próprio pedido.
-- "drop function" primeiro porque o Postgres não deixa um "create or
-- replace" trocar o formato de retorno de uma função existente (só o
-- código da função é descartado aqui, nenhuma linha de tabela é afetada).
drop function if exists public.lookup_service_request(text);

create or replace function public.lookup_service_request(p_request_number text)
returns table (
  request_number text,
  service_type text,
  status text,
  description text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select request_number, service_type, status, description, created_at
  from public.service_requests
  where request_number = p_request_number
  limit 1;
$$;

grant execute on function public.get_service_request_number(uuid) to anon, authenticated;
grant execute on function public.lookup_service_request(text) to anon, authenticated;
