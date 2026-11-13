-- =====================================================================
-- DEU SEDE! — Gestão de Compras
-- Migração 0021: o preço de compra da NOTA vira o PREÇO DE CUSTO do
-- produto.
--
-- Antes: ao dar entrada por nota (ou registrar um recebimento), o valor
-- pago ficava só no movimento de estoque. O "Preço de custo" do cadastro
-- (produtos.custo_referencia) continuava vazio ou com o valor antigo, e
-- por isso a margem, o Montar pedido e a entrada manual usavam um custo
-- desatualizado.
--
-- Agora: toda entrada no estoque com custo, vinda de nota ou de
-- recebimento, atualiza o preço de custo do produto (por unidade).
-- Uma nota com data mais antiga que a última compra não sobrescreve o
-- custo mais recente.
--
-- Como aplicar: SQL Editor -> colar este arquivo inteiro -> Run.
-- Pode rodar de novo sem problema (idempotente).
-- =====================================================================

create or replace function deusede.custo_pela_entrada()
returns trigger language plpgsql security definer set search_path = deusede as $$
begin
  if new.tipo = 'entrada'
     and new.origem in ('nota', 'recebimento')
     and new.custo_unitario is not null
     -- não deixa uma nota mais antiga apagar o custo de uma compra mais nova
     and not exists (
       select 1 from deusede.estoque_movimentos m
       where m.produto_id = new.produto_id
         and m.id <> new.id
         and m.tipo = 'entrada'
         and m.origem in ('nota', 'recebimento')
         and m.custo_unitario is not null
         and m.data_movimento > new.data_movimento
     )
  then
    update deusede.produtos
       set custo_referencia = new.custo_unitario
     where id = new.produto_id
       and custo_referencia is distinct from new.custo_unitario;
  end if;
  return null;
end $$;

drop trigger if exists estoque_movimentos_custo_produto on deusede.estoque_movimentos;
create trigger estoque_movimentos_custo_produto
  after insert on deusede.estoque_movimentos
  for each row execute function deusede.custo_pela_entrada();

revoke all on function deusede.custo_pela_entrada() from public;
do $$
begin
  execute 'revoke all on function deusede.custo_pela_entrada() from anon, authenticated';
end $$;

-- Produtos que já receberam nota mas ficaram sem preço de custo: usa o
-- custo da compra mais recente. (Quem já tem preço de custo não muda.)
update deusede.produtos p
   set custo_referencia = u.custo_unitario
  from (
    select distinct on (m.produto_id) m.produto_id, m.custo_unitario
    from deusede.estoque_movimentos m
    where m.tipo = 'entrada'
      and m.origem in ('nota', 'recebimento')
      and m.custo_unitario is not null
    order by m.produto_id, m.data_movimento desc, m.id desc
  ) u
 where p.id = u.produto_id
   and p.custo_referencia is null;

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
