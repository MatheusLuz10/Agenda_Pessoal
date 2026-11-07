-- =====================================================================
-- DEU SEDE! — Migração 0010: importação de produtos em lote
-- (usada pelo "Catálogo de referência" do app). Cria as categorias que
-- faltarem e só inclui produtos que ainda não existem (mesmo nome, marca
-- e volume) — reimportar não duplica nada. Nenhum preço é importado.
-- =====================================================================

create or replace function deusede.importar_produtos(p jsonb)
returns jsonb language plpgsql as $$
declare
  it jsonb;
  v_cat uuid;
  v_criados int := 0;
  v_existentes int := 0;
  v_categorias int := 0;
  v_linhas int;
begin
  perform deusede.exigir_edicao();
  for it in select x from jsonb_array_elements(coalesce(p -> 'produtos', '[]')) x loop
    select id into v_cat from deusede.categorias where lower(trim(nome)) = lower(trim(deusede.txt(it, 'categoria')));
    if v_cat is null then
      insert into deusede.categorias (nome, ordem) values (deusede.txt(it, 'categoria'), coalesce(deusede.num(it, 'ordem_categoria')::int, 100))
      returning id into v_cat;
      v_categorias := v_categorias + 1;
    end if;
    insert into deusede.produtos (
      nome, categoria_id, marca, tipo_embalagem, unidades_por_embalagem, volume_por_unidade, unidade_medida, observacoes
    ) values (
      deusede.txt(it, 'nome'), v_cat, deusede.txt(it, 'marca'), coalesce(deusede.txt(it, 'tipo_embalagem'), 'unidade'),
      coalesce(deusede.num(it, 'unidades_por_embalagem')::int, 1), deusede.num(it, 'volume_por_unidade'),
      deusede.txt(it, 'unidade_medida'), deusede.txt(it, 'observacoes')
    ) on conflict do nothing;
    get diagnostics v_linhas = row_count;
    if v_linhas > 0 then v_criados := v_criados + 1; else v_existentes := v_existentes + 1; end if;
  end loop;
  return jsonb_build_object('criados', v_criados, 'existentes', v_existentes, 'categorias_criadas', v_categorias);
end $$;
