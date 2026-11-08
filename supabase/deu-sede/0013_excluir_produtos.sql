-- =====================================================================
-- DEU SEDE! — Gestão de Compras
-- Migração 0013: excluir produtos (um ou vários de uma vez)
--
-- Produto nunca usado sai de vez (junto com os preços por fornecedor
-- cadastrados para ele). Produto que já aparece em cotação, pedido,
-- recebimento, estoque, venda ou histórico de preço NÃO pode sumir — o
-- passado continuaria apontando para ele —, então é desativado: sai das
-- listas e da busca, e pode ser reativado depois. A tela avisa quais
-- foram excluídos e quais foram desativados.
--
-- Como aplicar: SQL Editor -> colar este arquivo inteiro -> Run.
-- Pode rodar de novo sem problema (idempotente).
-- =====================================================================

create or replace function deusede.excluir_produtos(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_id uuid;
  v_nome text;
  v_excluidos text[] := '{}';
  v_inativados text[] := '{}';
begin
  perform deusede.exigir_edicao();
  if jsonb_typeof(p -> 'ids') is distinct from 'array' or jsonb_array_length(p -> 'ids') = 0 then
    raise exception 'Escolha ao menos um produto.';
  end if;

  for v_id in select distinct x::uuid from jsonb_array_elements_text(p -> 'ids') as x loop
    select nome into v_nome from deusede.produtos where id = v_id;
    if not found then
      continue;
    end if;
    begin
      delete from deusede.fornecedor_produtos where produto_id = v_id;
      delete from deusede.produtos where id = v_id;
      v_excluidos := v_excluidos || v_nome;
    exception when restrict_violation or foreign_key_violation then
      -- já tem histórico: as exclusões acima são desfeitas e o produto só é desativado
      update deusede.produtos set ativo = false where id = v_id;
      v_inativados := v_inativados || v_nome;
    end;
  end loop;

  return jsonb_build_object('excluidos', to_jsonb(v_excluidos), 'inativados', to_jsonb(v_inativados));
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
