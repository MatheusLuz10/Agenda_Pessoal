-- =====================================================================
-- DEU SEDE! — Gestão de Compras
-- Migração 0012: datas no horário de Brasília
--
-- O Postgres do Supabase roda em UTC. Por isso "current_date" (e
-- "now()::date") já era o dia seguinte entre 21h e meia-noite no horário
-- de Brasília: cotações, pedidos e recebimentos feitos à noite ficavam com
-- a data de amanhã e sumiam do filtro "Este mês" (no último dia do mês,
-- caíam no mês seguinte).
--
-- Correção:
--   1. as colunas de data passam a ter como padrão a data de Brasília
--      (vale até para gravação direta na tabela, fora das funções);
--   2. as funções do esquema deusede que gravam ou calculam datas passam
--      a rodar com timezone = America/Sao_Paulo.
-- Nada fora do esquema deusede muda (a Agenda continua igual) e os
-- horários gravados (timestamptz) são os mesmos.
--
-- IMPORTANTE: "create or replace function" apaga essa configuração da
-- função recriada. Migração nova que recriar função deve terminar com
-- este mesmo bloco (o teste do banco acusa função que ficar sem).
--
-- Como aplicar: SQL Editor -> colar este arquivo inteiro -> Run.
-- Pode rodar de novo sem problema (idempotente).
-- =====================================================================

-- 1. Padrão das colunas de data
alter table deusede.cotacoes alter column data_cotacao set default deusede.data_brasil(now());
alter table deusede.pedidos alter column data_pedido set default deusede.data_brasil(now());
alter table deusede.recebimentos alter column data_recebimento set default deusede.data_brasil(now());
alter table deusede.notas_entrada alter column data_entrada set default deusede.data_brasil(now());
alter table deusede.estoque_movimentos alter column data_movimento set default deusede.data_brasil(now());

-- 2. Funções no horário de Brasília
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
      -- funções que gravam (plpgsql, inclusive gatilhos) ou mexem com data
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
