-- =====================================================================
-- DEU SEDE! — Gestão de Compras
-- Migração 0014: todo produto tem código (controle de código pelo sistema)
--
-- Produto salvo sem código recebe o próximo número livre (0001, 0002…).
-- Código informado à mão (ou o código de barras de uma nota) continua
-- valendo, e o sistema pula números já usados. Apagar o código de um
-- produto faz o sistema dar um novo. Os produtos que já existiam sem
-- código são numerados agora, do mais antigo ao mais novo.
--
-- Como aplicar: SQL Editor -> colar este arquivo inteiro -> Run.
-- Pode rodar de novo sem problema (idempotente).
-- =====================================================================

create sequence if not exists deusede.produtos_codigo_seq;
grant usage, select on sequence deusede.produtos_codigo_seq to authenticated, service_role;

create or replace function deusede.proximo_codigo_produto()
returns text language plpgsql as $$
declare
  v text;
begin
  loop
    v := lpad(nextval('deusede.produtos_codigo_seq')::text, 4, '0');
    exit when not exists (select 1 from deusede.produtos where lower(trim(codigo)) = lower(v));
  end loop;
  return v;
end $$;

create or replace function deusede.tg_produtos_codigo()
returns trigger language plpgsql as $$
begin
  new.codigo := nullif(trim(new.codigo), '');
  if new.codigo is null then
    new.codigo := deusede.proximo_codigo_produto();
  end if;
  return new;
end $$;

drop trigger if exists produtos_codigo on deusede.produtos;
create trigger produtos_codigo before insert or update of codigo on deusede.produtos
  for each row execute function deusede.tg_produtos_codigo();

-- Numera os produtos que estão sem código (do mais antigo ao mais novo).
do $$
declare
  r record;
begin
  for r in
    select id from deusede.produtos
    where codigo is null or trim(codigo) = ''
    order by created_at, nome
  loop
    update deusede.produtos set codigo = deusede.proximo_codigo_produto() where id = r.id;
  end loop;
end $$;

alter table deusede.produtos alter column codigo set not null;

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
