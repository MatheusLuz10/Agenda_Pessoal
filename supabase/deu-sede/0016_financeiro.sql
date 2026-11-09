-- =====================================================================
-- DEU SEDE! — Gestão de Compras
-- Migração 0016: FINANCEIRO (contas a pagar e caixa), lucro no painel e
-- entrada manual de estoque.
--
--   * Caixa: todo dinheiro da empresa. Entram as vendas do PDV (todas as
--     formas de pagamento); saem os pagamentos de contas. Pode ficar
--     negativo. Entradas/saídas avulsas (saldo inicial, retirada…) também.
--   * Contas a pagar: lançadas à mão ou a partir do pedido de compra.
--     À vista = paga na hora (sai do caixa); parcelado = parcelas mensais
--     pagas depois, uma a uma. Pedido cancelado cancela a conta (o que já
--     foi pago volta para o caixa).
--   * Lucro = vendas − custo dos produtos vendidos (custo gravado na venda).
--   * Estoque: entrada manual (quantidade e custo opcional).
--
-- Como aplicar: SQL Editor -> colar este arquivo inteiro -> Run.
-- Pode rodar de novo sem problema (idempotente).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Permissões do financeiro
-- ---------------------------------------------------------------------
-- Ver: qualquer perfil do DEU SEDE!, menos o login só de pedidos.
create or replace function deusede.pode_ver_financeiro()
returns boolean language sql stable as $$
  select deusede.pode_ler() and not deusede.e_so_pedidos()
$$;

create or replace function deusede.exigir_financeiro()
returns void language plpgsql stable as $$
begin
  if not deusede.pode_editar() then
    raise exception 'Seu usuário não tem permissão para mexer nas contas e no caixa.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2) Tabelas
-- ---------------------------------------------------------------------
create sequence if not exists deusede.contas_pagar_numero_seq;

create table if not exists deusede.contas_pagar (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('deusede.contas_pagar_numero_seq'),
  descricao text not null check (length(trim(descricao)) >= 2),
  fornecedor_id uuid references deusede.fornecedores (id) on delete restrict,
  fornecedor_nome text,
  pedido_id uuid references deusede.pedidos (id) on delete restrict,
  forma text not null check (forma in ('a_vista', 'parcelado')),
  valor_total numeric(14, 2) not null check (valor_total > 0),
  observacoes text,
  status text not null default 'aberta' check (status in ('aberta', 'paga', 'cancelada')),
  cancelada_em timestamptz,
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (status <> 'cancelada' or length(trim(coalesce(motivo_cancelamento, ''))) >= 3)
);
-- um pedido vai uma vez só para contas a pagar (a não ser que a conta seja cancelada)
create unique index if not exists contas_pagar_um_por_pedido
  on deusede.contas_pagar (pedido_id) where pedido_id is not null and status <> 'cancelada';

create table if not exists deusede.contas_pagar_parcelas (
  id uuid primary key default gen_random_uuid(),
  conta_id uuid not null references deusede.contas_pagar (id) on delete restrict,
  numero integer not null check (numero > 0),
  vencimento date not null,
  valor numeric(14, 2) not null check (valor > 0),
  status text not null default 'aberta' check (status in ('aberta', 'paga', 'cancelada')),
  paga_em date,
  created_at timestamptz not null default now(),
  unique (conta_id, numero),
  check (status <> 'paga' or paga_em is not null)
);
create index if not exists contas_pagar_parcelas_abertas on deusede.contas_pagar_parcelas (vencimento) where status = 'aberta';

create table if not exists deusede.caixa_movimentos (
  id bigint generated always as identity primary key,
  data date not null default deusede.data_brasil(now()),
  origem text not null check (origem in (
    'venda', 'estorno_venda', 'pagamento_conta', 'estorno_pagamento', 'entrada_manual', 'saida_manual'
  )),
  -- positivo entra no caixa, negativo sai
  valor numeric(14, 2) not null check (valor <> 0),
  descricao text not null,
  venda_id uuid references deusede.vendas (id) on delete restrict,
  parcela_id uuid references deusede.contas_pagar_parcelas (id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
-- cada venda entra uma vez (e sai uma vez, se cancelada)
create unique index if not exists caixa_movimentos_venda_unica
  on deusede.caixa_movimentos (venda_id, origem) where venda_id is not null;

-- O caixa é um extrato: não se altera nem apaga (corrige-se com outro lançamento).
create or replace function deusede.caixa_imutavel()
returns trigger language plpgsql as $$
begin
  raise exception 'Lançamentos do caixa não podem ser alterados nem apagados. Faça um lançamento de correção.';
end $$;
drop trigger if exists caixa_movimentos_imutavel on deusede.caixa_movimentos;
create trigger caixa_movimentos_imutavel before update or delete on deusede.caixa_movimentos
  for each row execute function deusede.caixa_imutavel();

-- Conta e parcela não se apagam (cancela-se com motivo).
create or replace function deusede.contas_sem_exclusao()
returns trigger language plpgsql as $$
begin
  raise exception 'Contas a pagar não podem ser apagadas: cancele a conta (com motivo).';
end $$;
drop trigger if exists contas_pagar_sem_exclusao on deusede.contas_pagar;
create trigger contas_pagar_sem_exclusao before delete on deusede.contas_pagar
  for each row execute function deusede.contas_sem_exclusao();
drop trigger if exists contas_pagar_parcelas_sem_exclusao on deusede.contas_pagar_parcelas;
create trigger contas_pagar_parcelas_sem_exclusao before delete on deusede.contas_pagar_parcelas
  for each row execute function deusede.contas_sem_exclusao();

-- ---------------------------------------------------------------------
-- 3) Segurança (RLS): só leitura direta; gravação só pelas funções abaixo
-- ---------------------------------------------------------------------
alter table deusede.contas_pagar enable row level security;
alter table deusede.contas_pagar_parcelas enable row level security;
alter table deusede.caixa_movimentos enable row level security;
drop policy if exists contas_pagar_select on deusede.contas_pagar;
create policy contas_pagar_select on deusede.contas_pagar for select to authenticated using (deusede.pode_ver_financeiro());
drop policy if exists contas_pagar_parcelas_select on deusede.contas_pagar_parcelas;
create policy contas_pagar_parcelas_select on deusede.contas_pagar_parcelas for select to authenticated using (deusede.pode_ver_financeiro());
drop policy if exists caixa_movimentos_select on deusede.caixa_movimentos;
create policy caixa_movimentos_select on deusede.caixa_movimentos for select to authenticated using (deusede.pode_ver_financeiro());
revoke all on deusede.contas_pagar, deusede.contas_pagar_parcelas, deusede.caixa_movimentos from anon;
revoke insert, update, delete on deusede.contas_pagar, deusede.contas_pagar_parcelas, deusede.caixa_movimentos from authenticated;
grant select on deusede.contas_pagar, deusede.contas_pagar_parcelas, deusede.caixa_movimentos to authenticated;
grant all on deusede.contas_pagar, deusede.contas_pagar_parcelas, deusede.caixa_movimentos to service_role;
grant usage, select on all sequences in schema deusede to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4) Leitura
-- ---------------------------------------------------------------------
create or replace function deusede.saldo_caixa()
returns numeric language sql stable as $$
  select coalesce(sum(valor), 0) from deusede.caixa_movimentos
$$;

create or replace function deusede.conta_pagar_json(c deusede.contas_pagar)
returns jsonb language sql stable as $$
  select to_jsonb(c) || jsonb_build_object(
    'numero_formatado', deusede.formatar_numero('CP', c.numero),
    'pedido_numero', (select deusede.formatar_numero('PED', x.numero) from deusede.pedidos x where x.id = c.pedido_id),
    'valor_pago', coalesce((select sum(valor) from deusede.contas_pagar_parcelas where conta_id = c.id and status = 'paga'), 0),
    'valor_aberto', coalesce((select sum(valor) from deusede.contas_pagar_parcelas where conta_id = c.id and status = 'aberta'), 0),
    'parcelas', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.numero) from deusede.contas_pagar_parcelas x where x.conta_id = c.id), '[]'))
$$;

-- Lista de contas + resumo (saldo do caixa, em aberto, vencidas…).
-- p.status: 'abertas' (padrão) | 'pagas' | 'canceladas' | 'todas'
create or replace function deusede.contas_pagar(p jsonb default '{}')
returns jsonb language plpgsql stable as $$
declare
  v_status text := coalesce(deusede.txt(p, 'status'), 'abertas');
  v_hoje date := current_date;
begin
  if not deusede.pode_ver_financeiro() then raise exception 'Seu usuário não tem acesso às contas a pagar.'; end if;
  return jsonb_build_object(
    'saldo_caixa', deusede.saldo_caixa(),
    'em_aberto', coalesce((select sum(valor) from deusede.contas_pagar_parcelas where status = 'aberta'), 0),
    'qtd_em_aberto', (select count(*) from deusede.contas_pagar_parcelas where status = 'aberta'),
    'vencidas', coalesce((select sum(valor) from deusede.contas_pagar_parcelas where status = 'aberta' and vencimento < v_hoje), 0),
    'qtd_vencidas', (select count(*) from deusede.contas_pagar_parcelas where status = 'aberta' and vencimento < v_hoje),
    'vence_7_dias', coalesce((select sum(valor) from deusede.contas_pagar_parcelas
                              where status = 'aberta' and vencimento between v_hoje and v_hoje + 7), 0),
    'pagas_mes', coalesce((select sum(valor) from deusede.contas_pagar_parcelas
                           where status = 'paga' and date_trunc('month', paga_em) = date_trunc('month', v_hoje)), 0),
    'contas', coalesce((
      select jsonb_agg(deusede.conta_pagar_json(c) order by
               (select min(x.vencimento) from deusede.contas_pagar_parcelas x where x.conta_id = c.id and x.status = 'aberta') nulls last,
               c.created_at desc)
        from deusede.contas_pagar c
       where case v_status
               when 'abertas' then c.status = 'aberta'
               when 'pagas' then c.status = 'paga'
               when 'canceladas' then c.status = 'cancelada'
               else true end), '[]')
  );
end $$;

-- Uma conta (p.id) ou a conta de um pedido (p.pedido_id; null se não houver).
create or replace function deusede.obter_conta_pagar(p jsonb)
returns jsonb language plpgsql stable as $$
declare
  c deusede.contas_pagar;
begin
  if not deusede.pode_ver_financeiro() then raise exception 'Seu usuário não tem acesso às contas a pagar.'; end if;
  if deusede.uid(p, 'id') is not null then
    select * into c from deusede.contas_pagar where id = deusede.uid(p, 'id');
  else
    select * into c from deusede.contas_pagar where pedido_id = deusede.uid(p, 'pedido_id')
     order by (status = 'cancelada'), created_at desc limit 1;
  end if;
  if c.id is null then return null; end if;
  return deusede.conta_pagar_json(c);
end $$;

-- Extrato do caixa no período (vendas do PDV somadas por dia).
create or replace function deusede.caixa(p jsonb default '{}')
returns jsonb language plpgsql stable as $$
declare
  v_de date := coalesce(deusede.txt(p, 'de')::date, current_date - 30);
  v_ate date := coalesce(deusede.txt(p, 'ate')::date, current_date);
begin
  if not deusede.pode_ver_financeiro() then raise exception 'Seu usuário não tem acesso ao caixa.'; end if;
  return jsonb_build_object(
    'de', v_de, 'ate', v_ate,
    'saldo', deusede.saldo_caixa(),
    'saldo_anterior', coalesce((select sum(valor) from deusede.caixa_movimentos where data < v_de), 0),
    'entradas', coalesce((select sum(valor) from deusede.caixa_movimentos where data between v_de and v_ate and valor > 0), 0),
    'saidas', coalesce((select -sum(valor) from deusede.caixa_movimentos where data between v_de and v_ate and valor < 0), 0),
    'movimentos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'data', g.data, 'origem', g.origem, 'descricao', g.descricao, 'valor', g.valor,
               'quantidade', g.qtd, 'saldo_apos', g.saldo_apos) order by g.data desc, g.ordem desc)
        from (
          select a.*, sum(a.valor) over (order by a.data, a.ordem) as saldo_apos
            from (
              select m.data,
                     case when m.origem in ('venda', 'estorno_venda') then 'vendas' else m.origem end as origem,
                     case when m.origem in ('venda', 'estorno_venda') then 'Vendas do PDV' else m.descricao end as descricao,
                     sum(m.valor) as valor,
                     count(*) as qtd,
                     min(m.id) as ordem
                from deusede.caixa_movimentos m
               group by m.data,
                        case when m.origem in ('venda', 'estorno_venda') then 'vendas' else m.origem end,
                        case when m.origem in ('venda', 'estorno_venda') then 'Vendas do PDV' else m.descricao end,
                        case when m.origem in ('venda', 'estorno_venda') then 0 else m.id end
            ) a
        ) g
       where g.data between v_de and v_ate), '[]')
  );
end $$;

-- Painel: lucro (vendas − custo dos produtos vendidos), caixa e contas.
create or replace function deusede.painel_financeiro(p jsonb default '{}')
returns jsonb language plpgsql stable as $$
declare
  v_de date := deusede.periodo_de(p);
  v_ate date := deusede.periodo_ate(p);
  v_ver boolean := deusede.pode_ver_financeiro();
begin
  -- lucro e caixa: fora do alcance do login só de pedidos
  if not v_ver then raise exception 'Seu usuário não tem acesso ao financeiro.'; end if;
  return jsonb_build_object(
    'de', v_de, 'ate', v_ate,
    'vendas_total', coalesce((select sum(total) from deusede.vendas where status = 'concluida'), 0),
    'lucro_total', coalesce((select sum(total - coalesce(custo_total, 0)) from deusede.vendas where status = 'concluida'), 0),
    'vendas_periodo', coalesce((select sum(total) from deusede.vendas
                                where status = 'concluida' and deusede.data_brasil(created_at) between v_de and v_ate), 0),
    'lucro_periodo', coalesce((select sum(total - coalesce(custo_total, 0)) from deusede.vendas
                               where status = 'concluida' and deusede.data_brasil(created_at) between v_de and v_ate), 0),
    -- itens vendidos sem custo conhecido: o lucro deles aparece cheio
    'itens_sem_custo', (select count(*) from deusede.venda_itens i join deusede.vendas v on v.id = i.venda_id
                        where v.status = 'concluida' and i.custo_unitario is null),
    'saldo_caixa', case when v_ver then deusede.saldo_caixa() end,
    'contas_vencidas', case when v_ver then coalesce((select sum(valor) from deusede.contas_pagar_parcelas
                                                     where status = 'aberta' and vencimento < current_date), 0) end,
    'qtd_contas_vencidas', case when v_ver then (select count(*) from deusede.contas_pagar_parcelas
                                                 where status = 'aberta' and vencimento < current_date) end,
    'contas_em_aberto', case when v_ver then coalesce((select sum(valor) from deusede.contas_pagar_parcelas where status = 'aberta'), 0) end
  );
end $$;

-- ---------------------------------------------------------------------
-- 5) Gravação (internas: sem acesso direto pelo app)
-- ---------------------------------------------------------------------
create or replace function deusede.pagar_parcela_interno(p_parcela uuid, p_data date)
returns void language plpgsql security definer set search_path = deusede as $$
declare
  v_par deusede.contas_pagar_parcelas;
  v_conta deusede.contas_pagar;
  v_qtd integer;
begin
  select * into v_par from deusede.contas_pagar_parcelas where id = p_parcela for update;
  if not found then raise exception 'Parcela não encontrada.'; end if;
  if v_par.status = 'paga' then raise exception 'Esta parcela já foi paga.'; end if;
  if v_par.status = 'cancelada' then raise exception 'Esta parcela é de uma conta cancelada.'; end if;
  select * into v_conta from deusede.contas_pagar where id = v_par.conta_id for update;
  select count(*) into v_qtd from deusede.contas_pagar_parcelas where conta_id = v_conta.id;
  update deusede.contas_pagar_parcelas set status = 'paga', paga_em = p_data where id = v_par.id;
  insert into deusede.caixa_movimentos (data, origem, valor, descricao, parcela_id)
  values (p_data, 'pagamento_conta', -v_par.valor,
          v_conta.descricao || case when v_qtd > 1 then ' — parcela ' || v_par.numero || '/' || v_qtd else '' end,
          v_par.id);
  if not exists (select 1 from deusede.contas_pagar_parcelas where conta_id = v_conta.id and status = 'aberta') then
    update deusede.contas_pagar set status = 'paga' where id = v_conta.id;
  end if;
end $$;

create or replace function deusede.cancelar_conta_interno(p_conta uuid, p_motivo text)
returns void language plpgsql security definer set search_path = deusede as $$
declare
  v_conta deusede.contas_pagar;
  v_par record;
begin
  select * into v_conta from deusede.contas_pagar where id = p_conta for update;
  if not found then raise exception 'Conta não encontrada.'; end if;
  if v_conta.status = 'cancelada' then return; end if;
  -- o que já foi pago volta para o caixa
  for v_par in select * from deusede.contas_pagar_parcelas where conta_id = v_conta.id and status = 'paga' loop
    insert into deusede.caixa_movimentos (origem, valor, descricao, parcela_id)
    values ('estorno_pagamento', v_par.valor, 'Estorno: ' || v_conta.descricao || ' (conta cancelada)', v_par.id);
  end loop;
  update deusede.contas_pagar_parcelas set status = 'cancelada' where conta_id = v_conta.id;
  update deusede.contas_pagar set status = 'cancelada', cancelada_em = now(),
         motivo_cancelamento = coalesce(nullif(trim(p_motivo), ''), 'Cancelada')
   where id = v_conta.id;
end $$;

revoke all on function deusede.pagar_parcela_interno(uuid, date) from public;
revoke all on function deusede.cancelar_conta_interno(uuid, text) from public;
do $$
begin
  execute 'revoke all on function deusede.pagar_parcela_interno(uuid, date) from anon, authenticated';
  execute 'revoke all on function deusede.cancelar_conta_interno(uuid, text) from anon, authenticated';
exception when undefined_object then null;
end $$;

-- ---------------------------------------------------------------------
-- 6) Gravação (chamadas pelo app)
-- ---------------------------------------------------------------------
-- Lança uma conta. Com p.pedido_id, o valor e o fornecedor vêm do pedido
-- (quem faz pedido pode lançar); sem, é conta avulsa (admin/comprador).
-- p.forma 'a_vista': paga na hora (sai do caixa). 'parcelado': p.parcelas
-- parcelas mensais a partir de p.primeiro_vencimento.
create or replace function deusede.lancar_conta_pagar(p jsonb)
returns jsonb language plpgsql security definer set search_path = deusede as $$
declare
  v_pedido_id uuid := deusede.uid(p, 'pedido_id');
  v_ped record;
  v_forma text := coalesce(deusede.txt(p, 'forma'), 'a_vista');
  v_n integer := coalesce(deusede.num(p, 'parcelas')::integer, 1);
  v_primeiro date := coalesce(deusede.txt(p, 'primeiro_vencimento')::date, current_date);
  v_total numeric;
  v_desc text := deusede.txt(p, 'descricao');
  v_forn uuid := deusede.uid(p, 'fornecedor_id');
  v_forn_nome text;
  v_conta deusede.contas_pagar;
  v_base numeric;
  v_par record;
  i integer;
begin
  if v_pedido_id is not null then
    perform deusede.exigir_pedido();
    select * into v_ped from deusede.vw_pedidos where id = v_pedido_id;
    if not found then raise exception 'Pedido não encontrado.'; end if;
    if v_ped.status = 'cancelado' then raise exception 'Pedido cancelado não vai para contas a pagar.'; end if;
    if exists (select 1 from deusede.contas_pagar where pedido_id = v_pedido_id and status <> 'cancelada') then
      raise exception 'Este pedido já está em contas a pagar.';
    end if;
    v_total := v_ped.valor_total;
    v_forn := v_ped.fornecedor_id;
    v_forn_nome := v_ped.fornecedor_nome;
    v_desc := coalesce(v_desc, 'Pedido de compra ' || v_ped.numero_formatado || ' — ' || v_ped.fornecedor_nome);
  else
    perform deusede.exigir_financeiro();
    v_total := deusede.num(p, 'valor_total');
    if v_forn is not null then
      select nome into v_forn_nome from deusede.fornecedores where id = v_forn;
      if not found then raise exception 'Fornecedor não encontrado.'; end if;
    end if;
  end if;

  if v_desc is null or length(trim(v_desc)) < 2 then raise exception 'Informe a descrição da conta.'; end if;
  if v_total is null or v_total <= 0 then raise exception 'Informe o valor da conta.'; end if;
  v_total := round(v_total, 2);
  if v_forma not in ('a_vista', 'parcelado') then raise exception 'Forma de pagamento inválida (à vista ou parcelado).'; end if;
  if v_forma = 'a_vista' then
    v_n := 1;
    v_primeiro := current_date;
  end if;
  if v_n < 1 or v_n > 48 then raise exception 'O número de parcelas vai de 1 a 48.'; end if;
  v_base := trunc(v_total / v_n, 2);
  if v_base <= 0 then raise exception 'Valor pequeno demais para % parcelas.', v_n; end if;

  insert into deusede.contas_pagar (descricao, fornecedor_id, fornecedor_nome, pedido_id, forma, valor_total, observacoes)
  values (trim(v_desc), v_forn, v_forn_nome, v_pedido_id, v_forma, v_total, deusede.txt(p, 'observacoes'))
  returning * into v_conta;

  -- parcelas iguais; a última leva a diferença dos centavos
  for i in 1..v_n loop
    insert into deusede.contas_pagar_parcelas (conta_id, numero, vencimento, valor)
    values (v_conta.id, i, (v_primeiro + make_interval(months => i - 1))::date,
            case when i = v_n then v_total - v_base * (v_n - 1) else v_base end);
  end loop;

  if v_forma = 'a_vista' then
    for v_par in select id from deusede.contas_pagar_parcelas where conta_id = v_conta.id loop
      perform deusede.pagar_parcela_interno(v_par.id, current_date);
    end loop;
    select * into v_conta from deusede.contas_pagar where id = v_conta.id;
  end if;

  return deusede.conta_pagar_json(v_conta) || jsonb_build_object('saldo_caixa', deusede.saldo_caixa());
end $$;

create or replace function deusede.pagar_parcela(p jsonb)
returns jsonb language plpgsql security definer set search_path = deusede as $$
declare
  v_par deusede.contas_pagar_parcelas;
begin
  perform deusede.exigir_financeiro();
  select * into v_par from deusede.contas_pagar_parcelas where id = deusede.uid(p, 'parcela_id');
  if not found then raise exception 'Parcela não encontrada.'; end if;
  perform deusede.pagar_parcela_interno(v_par.id, coalesce(deusede.txt(p, 'data')::date, current_date));
  return (select deusede.conta_pagar_json(c) from deusede.contas_pagar c where c.id = v_par.conta_id)
         || jsonb_build_object('saldo_caixa', deusede.saldo_caixa());
end $$;

-- Desfaz um pagamento lançado por engano: a parcela volta a ficar em
-- aberto e o valor volta para o caixa.
create or replace function deusede.estornar_parcela(p jsonb)
returns jsonb language plpgsql security definer set search_path = deusede as $$
declare
  v_par deusede.contas_pagar_parcelas;
  v_conta deusede.contas_pagar;
begin
  perform deusede.exigir_financeiro();
  select * into v_par from deusede.contas_pagar_parcelas where id = deusede.uid(p, 'parcela_id') for update;
  if not found then raise exception 'Parcela não encontrada.'; end if;
  if v_par.status <> 'paga' then raise exception 'Só dá para desfazer o pagamento de parcela paga.'; end if;
  select * into v_conta from deusede.contas_pagar where id = v_par.conta_id for update;
  update deusede.contas_pagar_parcelas set status = 'aberta', paga_em = null where id = v_par.id;
  insert into deusede.caixa_movimentos (origem, valor, descricao, parcela_id)
  values ('estorno_pagamento', v_par.valor, 'Pagamento desfeito: ' || v_conta.descricao, v_par.id);
  update deusede.contas_pagar set status = 'aberta' where id = v_conta.id;
  return (select deusede.conta_pagar_json(c) from deusede.contas_pagar c where c.id = v_conta.id)
         || jsonb_build_object('saldo_caixa', deusede.saldo_caixa());
end $$;

create or replace function deusede.cancelar_conta_pagar(p jsonb)
returns jsonb language plpgsql security definer set search_path = deusede as $$
declare
  v_motivo text := trim(coalesce(deusede.txt(p, 'motivo'), ''));
begin
  perform deusede.exigir_financeiro();
  if length(v_motivo) < 3 then raise exception 'Informe o motivo do cancelamento.'; end if;
  if not exists (select 1 from deusede.contas_pagar where id = deusede.uid(p, 'id')) then
    raise exception 'Conta não encontrada.';
  end if;
  perform deusede.cancelar_conta_interno(deusede.uid(p, 'id'), v_motivo);
  return (select deusede.conta_pagar_json(c) from deusede.contas_pagar c where c.id = deusede.uid(p, 'id'))
         || jsonb_build_object('saldo_caixa', deusede.saldo_caixa());
end $$;

-- Entrada ou saída avulsa no caixa (saldo inicial, retirada, aporte…).
create or replace function deusede.movimentar_caixa(p jsonb)
returns jsonb language plpgsql security definer set search_path = deusede as $$
declare
  v_tipo text := deusede.txt(p, 'tipo');
  v_valor numeric := deusede.num(p, 'valor');
  v_desc text := trim(coalesce(deusede.txt(p, 'descricao'), ''));
begin
  perform deusede.exigir_financeiro();
  if v_tipo not in ('entrada', 'saida') then raise exception 'Escolha entrada ou saída.'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Informe o valor.'; end if;
  if length(v_desc) < 3 then raise exception 'Informe a descrição (ex.: saldo inicial, retirada).'; end if;
  insert into deusede.caixa_movimentos (data, origem, valor, descricao)
  values (coalesce(deusede.txt(p, 'data')::date, current_date),
          case when v_tipo = 'entrada' then 'entrada_manual' else 'saida_manual' end,
          case when v_tipo = 'entrada' then round(v_valor, 2) else -round(v_valor, 2) end,
          v_desc);
  return jsonb_build_object('saldo_caixa', deusede.saldo_caixa());
end $$;

-- ---------------------------------------------------------------------
-- 7) Vendas do PDV entram no caixa; venda cancelada sai
-- ---------------------------------------------------------------------
create or replace function deusede.caixa_da_venda()
returns trigger language plpgsql security definer set search_path = deusede as $$
begin
  if tg_op = 'INSERT' and new.status = 'concluida' and new.total > 0 then
    insert into deusede.caixa_movimentos (data, origem, valor, descricao, venda_id)
    values (deusede.data_brasil(new.created_at), 'venda', new.total,
            'Venda ' || deusede.formatar_numero('VEN', new.numero), new.id)
    on conflict do nothing;
  elsif tg_op = 'UPDATE' and old.status = 'concluida' and new.status = 'cancelada' and new.total > 0 then
    insert into deusede.caixa_movimentos (data, origem, valor, descricao, venda_id)
    values (deusede.data_brasil(now()), 'estorno_venda', -new.total,
            'Venda ' || deusede.formatar_numero('VEN', new.numero) || ' cancelada', new.id)
    on conflict do nothing;
  end if;
  return null;
end $$;
drop trigger if exists vendas_caixa on deusede.vendas;
create trigger vendas_caixa after insert or update of status on deusede.vendas
  for each row execute function deusede.caixa_da_venda();

-- vendas que já existiam
insert into deusede.caixa_movimentos (data, origem, valor, descricao, venda_id)
select deusede.data_brasil(v.created_at), 'venda', v.total, 'Venda ' || deusede.formatar_numero('VEN', v.numero), v.id
  from deusede.vendas v
 where v.total > 0
   and not exists (select 1 from deusede.caixa_movimentos m where m.venda_id = v.id and m.origem = 'venda');
insert into deusede.caixa_movimentos (data, origem, valor, descricao, venda_id)
select deusede.data_brasil(coalesce(v.cancelada_em, v.created_at)), 'estorno_venda', -v.total,
       'Venda ' || deusede.formatar_numero('VEN', v.numero) || ' cancelada', v.id
  from deusede.vendas v
 where v.status = 'cancelada' and v.total > 0
   and not exists (select 1 from deusede.caixa_movimentos m where m.venda_id = v.id and m.origem = 'estorno_venda');

-- ---------------------------------------------------------------------
-- 8) Pedido cancelado cancela a conta dele
-- ---------------------------------------------------------------------
create or replace function deusede.conta_do_pedido_cancelado()
returns trigger language plpgsql security definer set search_path = deusede as $$
declare
  v_conta record;
begin
  if new.status = 'cancelado' and old.status <> 'cancelado' then
    for v_conta in select id from deusede.contas_pagar where pedido_id = new.id and status <> 'cancelada' loop
      perform deusede.cancelar_conta_interno(v_conta.id,
        'Pedido cancelado' || coalesce(': ' || nullif(trim(new.motivo_cancelamento), ''), ''));
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists pedidos_cancela_conta on deusede.pedidos;
create trigger pedidos_cancela_conta after update of status on deusede.pedidos
  for each row execute function deusede.conta_do_pedido_cancelado();

-- ---------------------------------------------------------------------
-- 9) Estoque: entrada manual
-- ---------------------------------------------------------------------
alter table deusede.estoque_movimentos drop constraint if exists estoque_movimentos_origem_check;
alter table deusede.estoque_movimentos add constraint estoque_movimentos_origem_check check (origem in (
  'recebimento', 'nota', 'saida_manual', 'ajuste_contagem', 'estorno_recebimento', 'venda', 'estorno_venda', 'entrada_manual'
));

create or replace function deusede.registrar_movimento_estoque(p jsonb)
returns jsonb language plpgsql security definer set search_path = deusede as $$
declare
  v_prod deusede.produtos;
  v_saldo numeric;
  v_tipo text := deusede.txt(p, 'tipo');
  v_qtd numeric;
  v_custo numeric;
  v_motivo text := deusede.txt(p, 'motivo');
begin
  if not deusede.pode_receber() then
    raise exception 'Seu usuário não tem permissão para movimentar o estoque.';
  end if;
  select * into v_prod from deusede.produtos where id = deusede.uid(p, 'produto_id') for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  select coalesce(sum(quantidade_unidades), 0) into v_saldo from deusede.estoque_movimentos where produto_id = v_prod.id;

  if v_tipo = 'entrada' then
    -- custo opcional, por unidade ou por embalagem (o mesmo "unidade" da quantidade)
    v_qtd := deusede.num(p, 'quantidade');
    if v_qtd is null or v_qtd <= 0 then raise exception 'Informe a quantidade que entrou.'; end if;
    v_custo := deusede.num(p, 'custo');
    if v_custo is not null and v_custo < 0 then raise exception 'Custo inválido.'; end if;
    if coalesce(deusede.txt(p, 'unidade'), 'unidade') = 'embalagem' then
      v_qtd := v_qtd * v_prod.unidades_por_embalagem;
      v_custo := v_custo / v_prod.unidades_por_embalagem;
    end if;
    insert into deusede.estoque_movimentos (produto_id, tipo, origem, quantidade_unidades, custo_unitario, motivo, data_movimento)
    values (v_prod.id, 'entrada', 'entrada_manual', v_qtd, round(v_custo, 4), coalesce(nullif(trim(v_motivo), ''), 'Entrada manual'),
            coalesce(deusede.txt(p, 'data')::date, current_date));
  elsif v_tipo = 'saida' then
    v_qtd := deusede.num(p, 'quantidade');
    if v_qtd is null or v_qtd <= 0 then raise exception 'Informe a quantidade que saiu.'; end if;
    if coalesce(deusede.txt(p, 'unidade'), 'unidade') = 'embalagem' then v_qtd := v_qtd * v_prod.unidades_por_embalagem; end if;
    if v_qtd > v_saldo then
      raise exception 'Saída maior que o saldo em estoque (saldo: % unidades).', trim_scale(v_saldo);
    end if;
    if length(coalesce(v_motivo, '')) < 3 then raise exception 'Informe o motivo da saída (ex.: venda, consumo, perda).'; end if;
    insert into deusede.estoque_movimentos (produto_id, tipo, origem, quantidade_unidades, motivo, data_movimento)
    values (v_prod.id, 'saida', 'saida_manual', -v_qtd, v_motivo, coalesce(deusede.txt(p, 'data')::date, current_date));
  elsif v_tipo = 'ajuste' then
    v_qtd := deusede.num(p, 'contagem');
    if v_qtd is null or v_qtd < 0 then raise exception 'Informe a quantidade contada.'; end if;
    if coalesce(deusede.txt(p, 'unidade'), 'unidade') = 'embalagem' then v_qtd := v_qtd * v_prod.unidades_por_embalagem; end if;
    if v_qtd = v_saldo then raise exception 'O saldo já é igual à contagem: nada a ajustar.'; end if;
    insert into deusede.estoque_movimentos (produto_id, tipo, origem, quantidade_unidades, motivo, data_movimento)
    values (v_prod.id, 'ajuste', 'ajuste_contagem', v_qtd - v_saldo, coalesce(v_motivo, 'Contagem de estoque'),
            coalesce(deusede.txt(p, 'data')::date, current_date));
  else
    raise exception 'Tipo de movimentação inválido.';
  end if;

  return (select to_jsonb(e) from deusede.vw_estoque e where e.produto_id = v_prod.id);
end $$;

-- ---------------------------------------------------------------------
-- 10) Avisos do menu (bolinha vermelha): quantas coisas pedem atenção
--     em cada aba. O login só de pedidos só recebe o aviso de pedidos.
-- ---------------------------------------------------------------------
create or replace function deusede.avisos(p jsonb default '{}')
returns jsonb language plpgsql stable as $$
declare
  v_so_pedidos boolean := deusede.e_so_pedidos();
begin
  if not deusede.pode_ler() then return '{}'::jsonb; end if;
  return jsonb_build_object(
    -- pedido realizado e ainda não enviado ao fornecedor
    'pedidos', (select count(*) from deusede.pedidos where status in ('em_elaboracao', 'aguardando_aprovacao', 'aprovado')),
    'contas', case when v_so_pedidos then 0 else
      (select count(*) from deusede.contas_pagar_parcelas where status = 'aberta' and vencimento <= current_date) end,
    -- pedido a caminho: falta receber
    'recebimentos', case when v_so_pedidos then 0 else
      (select count(*) from deusede.pedidos where status in ('enviado', 'confirmado', 'em_transporte', 'parcialmente_recebido')) end,
    'estoque', case when v_so_pedidos then 0 else
      (select count(*) from deusede.vw_estoque e join deusede.produtos pr on pr.id = e.produto_id where pr.ativo and e.abaixo_minimo) end,
    'cotacoes', case when v_so_pedidos then 0 else
      (select count(*) from deusede.cotacoes where status in ('recebida', 'em_analise')) end,
    -- tem estoque para vender, mas não tem preço de venda
    'produtos', case when v_so_pedidos then 0 else
      (select count(*) from deusede.vw_estoque e join deusede.produtos pr on pr.id = e.produto_id
        where pr.ativo and e.saldo_unidades > 0 and pr.preco_venda is null and pr.preco_venda_embalagem is null) end
  );
end $$;

-- Datas no horário de Brasília (ver 0012): toda migração que cria ou
-- recria função termina com este bloco.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'deusede'
      and p.prokind = 'f'
      and (
        p.prolang = (select oid from pg_language where lanname = 'plpgsql')
        or p.prosrc ~* '(current_date|current_timestamp|localtime|now\(|date_trunc|to_char|::date)'
      )
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c ilike 'timezone=%'
      )
  loop
    execute format('alter function %s set timezone to %L', f.assinatura, 'America/Sao_Paulo');
  end loop;
end $$;
