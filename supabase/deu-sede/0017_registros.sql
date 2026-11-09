-- =====================================================================
-- DEU SEDE! — Gestão de Compras
-- Migração 0017: REGISTROS (logs) do que cada login faz no app.
--
--   * O app anota as ações (entrar no sistema; no Montar pedido: escolher
--     fornecedor, marcar/desmarcar produto, mudar quantidade e valor,
--     selecionar todos, realizar pedido, WhatsApp, PDF…). Cada registro
--     guarda quem fez, quando e os detalhes.
--   * A tela "Registros" junta esses registros com o histórico dos pedidos,
--     cotações e recebimentos (tabela eventos). Só admin e comprador veem.
--   * Registros não se alteram nem se apagam.
--
-- Como aplicar: SQL Editor -> colar este arquivo inteiro -> Run.
-- Pode rodar de novo sem problema (idempotente).
-- =====================================================================

create table if not exists deusede.atividades (
  id bigint generated always as identity primary key,
  usuario_id uuid default auth.uid(),
  usuario_nome text,
  papel text,
  area text not null check (length(area) between 1 and 40),
  acao text not null check (length(acao) between 1 and 60),
  descricao text not null check (length(descricao) between 1 and 500),
  detalhes jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists atividades_quando on deusede.atividades (created_at desc);
create index if not exists atividades_usuario on deusede.atividades (usuario_id, created_at desc);

create or replace function deusede.atividades_imutavel()
returns trigger language plpgsql as $$
begin
  raise exception 'Registros não podem ser alterados nem apagados.';
end $$;
drop trigger if exists atividades_imutavel on deusede.atividades;
create trigger atividades_imutavel before update or delete on deusede.atividades
  for each row execute function deusede.atividades_imutavel();

alter table deusede.atividades enable row level security;
drop policy if exists atividades_select on deusede.atividades;
create policy atividades_select on deusede.atividades for select to authenticated using (deusede.pode_editar());
revoke all on deusede.atividades from anon;
revoke insert, update, delete on deusede.atividades from authenticated;
grant select on deusede.atividades to authenticated;
grant all on deusede.atividades to service_role;

-- Grava as ações do próprio login (o app manda em lotes: p.itens).
-- Cada item: area, acao, descricao, detalhes (opcional) e momento (hora da
-- ação no aparelho; vale se estiver perto da hora do servidor).
create or replace function deusede.registrar_atividade(p jsonb)
returns jsonb language plpgsql security definer set search_path = deusede as $$
declare
  v_perfil deusede.perfis;
  v_item jsonb;
  v_momento timestamptz;
  v_n integer := 0;
begin
  select * into v_perfil from deusede.perfis where id = auth.uid() and ativo;
  if not found then raise exception 'Seu usuário não tem acesso ao DEU SEDE!.'; end if;
  if coalesce(jsonb_typeof(p -> 'itens'), '') <> 'array' then raise exception 'Nada para registrar.'; end if;
  if jsonb_array_length(p -> 'itens') > 200 then raise exception 'Registros demais de uma vez.'; end if;
  for v_item in select * from jsonb_array_elements(p -> 'itens') loop
    begin
      v_momento := (v_item ->> 'momento')::timestamptz;
    exception when others then
      v_momento := null;
    end;
    if v_momento is null or v_momento < now() - interval '1 day' or v_momento > now() + interval '5 minutes' then
      v_momento := now();
    end if;
    insert into deusede.atividades (usuario_id, usuario_nome, papel, area, acao, descricao, detalhes, created_at)
    values (
      v_perfil.id, v_perfil.nome, v_perfil.papel,
      left(coalesce(nullif(trim(v_item ->> 'area'), ''), 'app'), 40),
      left(coalesce(nullif(trim(v_item ->> 'acao'), ''), 'acao'), 60),
      left(coalesce(nullif(trim(v_item ->> 'descricao'), ''), '—'), 500),
      case when jsonb_typeof(v_item -> 'detalhes') = 'object' and length((v_item -> 'detalhes')::text) <= 20000
           then v_item -> 'detalhes' else '{}'::jsonb end,
      v_momento
    );
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('registrados', v_n);
end $$;

-- Registros do período, mais recentes primeiro. Junta as ações do app e o
-- histórico de pedidos/cotações/recebimentos (eventos).
-- p: de, ate (datas), usuario_id, area, limite (padrão 1000)
create or replace function deusede.listar_atividades(p jsonb default '{}')
returns jsonb language plpgsql stable as $$
declare
  v_de date := coalesce(deusede.txt(p, 'de')::date, current_date - 7);
  v_ate date := coalesce(deusede.txt(p, 'ate')::date, current_date);
  v_usuario uuid := deusede.uid(p, 'usuario_id');
  v_area text := deusede.txt(p, 'area');
  v_limite integer := least(coalesce(deusede.num(p, 'limite')::integer, 1000), 5000);
begin
  if not deusede.pode_editar() then raise exception 'Só administrador ou comprador vê os registros.'; end if;
  return jsonb_build_object(
    'de', v_de, 'ate', v_ate,
    'usuarios', coalesce((
      select jsonb_agg(jsonb_build_object('id', pf.id, 'nome', pf.nome, 'papel', pf.papel) order by pf.nome)
        from deusede.perfis pf), '[]'),
    'registros', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.quando desc, r.ordem desc)
        from (
          select *
            from (
              select 'app' as origem, a.id as ordem, a.created_at as quando, a.usuario_id, a.usuario_nome, a.papel,
                     a.area, a.acao, a.descricao, a.detalhes
                from deusede.atividades a
              union all
              select 'historico', e.id, e.created_at, e.usuario_id, pf.nome, pf.papel,
                     case e.entidade when 'pedido' then 'pedidos' when 'cotacao' then 'cotacoes' else 'recebimentos' end,
                     e.acao,
                     case e.entidade
                       when 'pedido' then 'Pedido ' || coalesce((select deusede.formatar_numero('PED', x.numero) from deusede.pedidos x where x.id = e.entidade_id), '')
                       when 'cotacao' then 'Cotação ' || coalesce((select deusede.formatar_numero('COT', x.numero) from deusede.cotacoes x where x.id = e.entidade_id), '')
                       else 'Recebimento'
                     end
                     || ': ' || replace(e.acao, '_', ' ')
                     || coalesce(' (' || e.status_anterior || ' → ' || e.status_novo || ')', ' → ' || e.status_novo, '')
                     || coalesce(' — ' || nullif(e.detalhe, ''), ''),
                     jsonb_build_object('entidade', e.entidade, 'id', e.entidade_id)
                from deusede.eventos e
                left join deusede.perfis pf on pf.id = e.usuario_id
            ) t
           where deusede.data_brasil(t.quando) between v_de and v_ate
             and (v_usuario is null or t.usuario_id = v_usuario)
             and (v_area is null or t.area = v_area)
           order by t.quando desc, t.ordem desc
           limit v_limite
        ) r), '[]')
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
