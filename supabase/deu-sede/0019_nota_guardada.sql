-- =====================================================================
-- DEU SEDE! — Gestão de Compras
-- Migração 0019: ENTRADA POR NOTA GUARDADA.
--
--   * rascunhos: a nota que está sendo montada (fornecedor, nº, data,
--     produtos, quantidades e a lista colada) fica guardada na nuvem, por
--     login, até dar entrada. Não se perde se der erro, se a página fechar
--     ou se trocar de aparelho. Ao dar entrada, o rascunho é apagado na
--     mesma transação.
--   * notas_entrada.lista_colada: o texto da lista colada fica junto da
--     nota gravada, para conferir depois com a nota em papel.
--   * obter_entrada_nota: devolve também quem registrou.
--
-- Como aplicar: SQL Editor -> colar este arquivo inteiro -> Run.
-- Pode rodar de novo sem problema (idempotente).
-- =====================================================================

create table if not exists deusede.rascunhos (
  usuario_id uuid not null,
  chave text not null check (chave ~ '^[a-z0-9_:-]{1,60}$'),
  dados jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (usuario_id, chave)
);

alter table deusede.rascunhos enable row level security;
drop policy if exists rascunhos_select on deusede.rascunhos;
create policy rascunhos_select on deusede.rascunhos for select to authenticated using (usuario_id = auth.uid());
revoke all on deusede.rascunhos from anon;
revoke insert, update, delete on deusede.rascunhos from authenticated;
grant select on deusede.rascunhos to authenticated;
grant all on deusede.rascunhos to service_role;

alter table deusede.notas_entrada add column if not exists lista_colada text;

-- Rascunho do próprio login (null quando não há).
create or replace function deusede.obter_rascunho(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = deusede as $$
declare
  v deusede.rascunhos;
begin
  if auth.uid() is null or not deusede.pode_ler() then
    raise exception 'Seu usuário não tem acesso ao DEU SEDE!.';
  end if;
  select * into v from deusede.rascunhos where usuario_id = auth.uid() and chave = deusede.txt(p, 'chave');
  if not found then return null; end if;
  return jsonb_build_object('chave', v.chave, 'dados', v.dados, 'atualizado_em', v.updated_at);
end $$;

create or replace function deusede.salvar_rascunho(p jsonb)
returns jsonb language plpgsql security definer set search_path = deusede as $$
declare
  v_chave text := deusede.txt(p, 'chave');
  v_quando timestamptz;
begin
  if auth.uid() is null or not deusede.pode_ler() then
    raise exception 'Seu usuário não tem acesso ao DEU SEDE!.';
  end if;
  if v_chave is null or v_chave !~ '^[a-z0-9_:-]{1,60}$' or jsonb_typeof(p -> 'dados') is distinct from 'object' then
    raise exception 'Rascunho inválido.';
  end if;
  if length((p -> 'dados')::text) > 300000 then
    raise exception 'Rascunho grande demais para guardar.';
  end if;
  if (select count(*) from deusede.rascunhos where usuario_id = auth.uid() and chave <> v_chave) >= 20 then
    raise exception 'Rascunhos demais guardados.';
  end if;
  insert into deusede.rascunhos (usuario_id, chave, dados) values (auth.uid(), v_chave, p -> 'dados')
  on conflict (usuario_id, chave) do update set dados = excluded.dados, updated_at = now()
  returning updated_at into v_quando;
  return jsonb_build_object('chave', v_chave, 'atualizado_em', v_quando);
end $$;

create or replace function deusede.apagar_rascunho(p jsonb)
returns jsonb language plpgsql security definer set search_path = deusede as $$
begin
  if auth.uid() is null or not deusede.pode_ler() then
    raise exception 'Seu usuário não tem acesso ao DEU SEDE!.';
  end if;
  delete from deusede.rascunhos where usuario_id = auth.uid() and chave = deusede.txt(p, 'chave');
  return jsonb_build_object('apagado', found);
end $$;

create or replace function deusede.obter_entrada_nota(p jsonb)
returns jsonb language sql stable as $$
  select to_jsonb(n) || jsonb_build_object(
    'numero_formatado', deusede.formatar_numero('ENT', n.numero),
    'criado_por_nome', (select nullif(pf.nome, '') from deusede.perfis pf where pf.id = n.created_by),
    'itens', coalesce((select jsonb_agg(to_jsonb(i) order by lower(i.produto_nome)) from deusede.notas_entrada_itens i where i.nota_id = n.id), '[]'),
    'total', coalesce((select sum(subtotal) from deusede.notas_entrada_itens i where i.nota_id = n.id), 0)
  )
  from deusede.notas_entrada n where n.id = deusede.uid(p, 'id')
$$;

-- Igual à 0008, mais: guarda a lista colada (p.lista_colada) e apaga o
-- rascunho do login (p.rascunho = chave) na mesma transação.
create or replace function deusede.registrar_entrada_nota(p jsonb)
returns jsonb language plpgsql security definer set search_path = deusede as $$
declare
  v_chave uuid := deusede.uid(p, 'chave_idempotencia');
  v_forn deusede.fornecedores;
  v_nota deusede.notas_entrada;
  v_item deusede.notas_entrada_itens;
  v_prod deusede.produtos;
  it jsonb;
  v_qtd numeric;
  v_unid int;
  v_restricao text;
begin
  if not deusede.pode_receber() then
    raise exception 'Seu usuário não tem permissão para dar entrada no estoque.';
  end if;
  if v_chave is not null then
    select * into v_nota from deusede.notas_entrada where chave_idempotencia = v_chave;
    if found then
      if deusede.txt(p, 'rascunho') is not null then
        delete from deusede.rascunhos where usuario_id = auth.uid() and chave = deusede.txt(p, 'rascunho');
      end if;
      return deusede.obter_entrada_nota(jsonb_build_object('id', v_nota.id));
    end if;
  end if;
  if jsonb_typeof(p -> 'itens') is distinct from 'array' or jsonb_array_length(p -> 'itens') = 0 then
    raise exception 'Adicione ao menos um produto.';
  end if;
  if deusede.uid(p, 'fornecedor_id') is not null then
    select * into v_forn from deusede.fornecedores where id = deusede.uid(p, 'fornecedor_id');
    if not found then raise exception 'Fornecedor não encontrado.'; end if;
  end if;

  insert into deusede.notas_entrada (fornecedor_id, fornecedor_nome, numero_nota, data_entrada, observacoes, chave_idempotencia, lista_colada)
  values (v_forn.id, v_forn.nome, deusede.txt(p, 'numero_nota'), coalesce(deusede.txt(p, 'data_entrada')::date, current_date),
          deusede.txt(p, 'observacoes'), coalesce(v_chave, gen_random_uuid()), left(deusede.txt(p, 'lista_colada'), 100000))
  returning * into v_nota;

  for it in select x from jsonb_array_elements(p -> 'itens') x loop
    select * into v_prod from deusede.produtos where id = deusede.uid(it, 'produto_id');
    if not found then raise exception 'Produto não encontrado.'; end if;
    v_qtd := deusede.num(it, 'quantidade_embalagens');
    if v_qtd is null or v_qtd <= 0 then raise exception 'Informe a quantidade de "%".', v_prod.nome; end if;
    v_unid := coalesce(deusede.num(it, 'unidades_por_embalagem')::int, v_prod.unidades_por_embalagem);

    insert into deusede.notas_entrada_itens (
      nota_id, produto_id, produto_nome, tipo_embalagem, unidades_por_embalagem, quantidade_embalagens, preco_embalagem
    ) values (
      v_nota.id, v_prod.id, v_prod.nome, coalesce(deusede.txt(it, 'tipo_embalagem'), v_prod.tipo_embalagem), v_unid,
      v_qtd, deusede.num(it, 'preco_embalagem')
    ) returning * into v_item;

    insert into deusede.estoque_movimentos (
      produto_id, tipo, origem, quantidade_unidades, custo_unitario, nota_item_id, data_movimento
    ) values (
      v_prod.id, 'entrada', 'nota', v_qtd * v_unid,
      case when v_item.preco_embalagem is null then null else round(v_item.preco_embalagem / v_unid, 4) end,
      v_item.id, v_nota.data_entrada
    );

    if v_forn.id is not null and v_item.preco_embalagem is not null and coalesce((p ->> 'atualizar_precos')::boolean, false) then
      insert into deusede.fornecedor_produtos as fp (
        fornecedor_id, produto_id, tipo_embalagem, unidades_por_embalagem, preco_atual, preco_origem
      ) values (v_forn.id, v_prod.id, v_item.tipo_embalagem, v_unid, v_item.preco_embalagem, 'nota')
      on conflict (fornecedor_id, produto_id, tipo_embalagem, unidades_por_embalagem) do update
        set preco_atual = excluded.preco_atual, preco_origem = 'nota', ativo = true;
    end if;
  end loop;

  if deusede.txt(p, 'rascunho') is not null then
    delete from deusede.rascunhos where usuario_id = auth.uid() and chave = deusede.txt(p, 'rascunho');
  end if;

  return deusede.obter_entrada_nota(jsonb_build_object('id', v_nota.id));
exception when others then
  get stacked diagnostics v_restricao = constraint_name;
  raise exception '%', deusede.traduzir_erro(sqlstate, sqlerrm, v_restricao);
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
