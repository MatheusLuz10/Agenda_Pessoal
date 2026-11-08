-- =====================================================================
-- DEU SEDE! — Gestão de Compras
-- Migração 0015: login só de PEDIDOS DE COMPRA (papel "pedidos")
--
-- Quem tem o papel "pedidos":
--   * vê produtos, fornecedores e preços (precisa para montar o pedido);
--   * gera pedidos, marca como enviado/cancelado e altera previsão e
--     observações do pedido;
--   * NÃO altera produtos, fornecedores, estoque, PDV nem configurações;
--   * NÃO enxerga a Agenda (calendários, tarefas, documentos e arquivos).
-- Admin e comprador continuam como antes.
--
-- Como aplicar: SQL Editor -> colar este arquivo inteiro -> Run.
-- Pode rodar de novo sem problema (idempotente).
-- =====================================================================

-- 1) Papel novo
alter table deusede.perfis drop constraint if exists perfis_papel_check;
alter table deusede.perfis add constraint perfis_papel_check
  check (papel in ('admin', 'comprador', 'conferente', 'vendedor', 'consulta', 'pedidos'));

create or replace function deusede.pode_pedir()
returns boolean language sql stable as $$
  select coalesce(deusede.papel_atual() in ('admin', 'comprador', 'pedidos'), false)
$$;

create or replace function deusede.e_so_pedidos()
returns boolean language sql stable as $$
  select coalesce(deusede.papel_atual() = 'pedidos', false)
$$;

create or replace function deusede.exigir_pedido()
returns void language plpgsql stable as $$
begin
  if not deusede.pode_pedir() then
    raise exception 'Seu usuário não tem permissão para fazer pedidos de compra.';
  end if;
end $$;

-- 2) Funções de pedido aceitam o papel novo (troca só a checagem de
--    permissão, mantendo o resto exatamente como está no banco)
do $$
declare
  f text;
  d text;
begin
  foreach f in array array['deusede.gerar_pedidos(jsonb)', 'deusede.mudar_status_pedido(jsonb)', 'deusede.atualizar_pedido(jsonb)'] loop
    d := pg_get_functiondef(f::regprocedure);
    if position('deusede.exigir_edicao()' in d) > 0 then
      execute replace(d, 'deusede.exigir_edicao()', 'deusede.exigir_pedido()');
    end if;
  end loop;
end $$;

-- 3) Tabelas de pedido: gravar com pode_pedir (inclui admin e comprador)
drop policy if exists pedidos_insert on deusede.pedidos;
create policy pedidos_insert on deusede.pedidos for insert to authenticated with check (deusede.pode_pedir());
drop policy if exists pedidos_update on deusede.pedidos;
create policy pedidos_update on deusede.pedidos for update to authenticated
  using (deusede.pode_pedir()) with check (deusede.pode_pedir());
drop policy if exists pedido_itens_insert on deusede.pedido_itens;
create policy pedido_itens_insert on deusede.pedido_itens for insert to authenticated with check (deusede.pode_pedir());
drop policy if exists pedido_itens_update on deusede.pedido_itens;
create policy pedido_itens_update on deusede.pedido_itens for update to authenticated
  using (deusede.pode_pedir()) with check (deusede.pode_pedir());
drop policy if exists pedido_itens_delete on deusede.pedido_itens;
create policy pedido_itens_delete on deusede.pedido_itens for delete to authenticated using (deusede.pode_pedir());

-- 4) Agenda fechada para o login de pedidos: uma trava a mais (restritiva)
--    em toda tabela da Agenda com RLS e nos arquivos. Não muda nada para
--    os outros usuários nem para o acesso anônimo.
do $$
declare
  t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  loop
    execute format('drop policy if exists %I on public.%I', 'deusede_bloqueia_so_pedidos', t.relname);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (not deusede.e_so_pedidos()) with check (not deusede.e_so_pedidos())',
      'deusede_bloqueia_so_pedidos', t.relname
    );
  end loop;
  if to_regclass('storage.objects') is not null then
    begin
      execute 'drop policy if exists deusede_bloqueia_so_pedidos on storage.objects';
      execute 'create policy deusede_bloqueia_so_pedidos on storage.objects as restrictive for all to authenticated using (not deusede.e_so_pedidos()) with check (not deusede.e_so_pedidos())';
    exception when insufficient_privilege then
      raise notice 'Arquivos (storage): sem permissão para criar a trava.';
    end;
  end if;
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
