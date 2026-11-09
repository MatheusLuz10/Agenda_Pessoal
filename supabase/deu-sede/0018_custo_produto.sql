-- =====================================================================
-- DEU SEDE! — Gestão de Compras
-- Migração 0018: PREÇO DE CUSTO no cadastro do produto.
--
--   * produtos.custo_referencia: custo por unidade informado no cadastro
--     (vale também para produto sem fornecedor). Serve de referência para
--     margem, Montar pedido e entrada manual de estoque sem custo.
--   * salvar_produto: campo que não vier no pedido continua como estava
--     (antes, editar sem mandar o preço de venda apagava o preço).
--
-- Como aplicar: SQL Editor -> colar este arquivo inteiro -> Run.
-- Pode rodar de novo sem problema (idempotente).
-- =====================================================================

alter table deusede.produtos add column if not exists custo_referencia numeric(14, 4);
alter table deusede.produtos drop constraint if exists produtos_custo_referencia_check;
alter table deusede.produtos add constraint produtos_custo_referencia_check check (custo_referencia is null or custo_referencia >= 0);

create or replace function deusede.salvar_produto(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_id uuid := deusede.uid(p, 'id');
  r deusede.produtos;
  v_restricao text;
begin
  perform deusede.exigir_edicao();
  if deusede.txt(p, 'nome') is null then raise exception 'Informe o nome do produto.'; end if;
  if deusede.uid(p, 'categoria_id') is null then raise exception 'Escolha a categoria.'; end if;
  if deusede.num(p, 'custo_referencia') < 0 then raise exception 'Preço de custo inválido.'; end if;

  if v_id is null then
    insert into deusede.produtos (
      nome, categoria_id, marca, codigo, tipo_embalagem, unidades_por_embalagem,
      volume_por_unidade, unidade_medida, observacoes, ativo, estoque_minimo, preco_venda, preco_venda_embalagem,
      custo_referencia
    ) values (
      deusede.txt(p, 'nome'), deusede.uid(p, 'categoria_id'), deusede.txt(p, 'marca'), deusede.txt(p, 'codigo'),
      coalesce(deusede.txt(p, 'tipo_embalagem'), 'caixa'), coalesce(deusede.num(p, 'unidades_por_embalagem')::int, 1),
      deusede.num(p, 'volume_por_unidade'), deusede.txt(p, 'unidade_medida'), deusede.txt(p, 'observacoes'),
      coalesce((p ->> 'ativo')::boolean, true), deusede.num(p, 'estoque_minimo'),
      deusede.num(p, 'preco_venda'), deusede.num(p, 'preco_venda_embalagem'),
      round(deusede.num(p, 'custo_referencia'), 4)
    ) returning * into r;
  else
    -- campo ausente = mantém; campo presente (mesmo vazio) = grava
    update deusede.produtos set
      nome = deusede.txt(p, 'nome'),
      categoria_id = deusede.uid(p, 'categoria_id'),
      marca = case when p ? 'marca' then deusede.txt(p, 'marca') else marca end,
      codigo = case when p ? 'codigo' then deusede.txt(p, 'codigo') else codigo end,
      tipo_embalagem = coalesce(deusede.txt(p, 'tipo_embalagem'), tipo_embalagem),
      unidades_por_embalagem = coalesce(deusede.num(p, 'unidades_por_embalagem')::int, unidades_por_embalagem),
      volume_por_unidade = case when p ? 'volume_por_unidade' then deusede.num(p, 'volume_por_unidade') else volume_por_unidade end,
      unidade_medida = case when p ? 'unidade_medida' then deusede.txt(p, 'unidade_medida') else unidade_medida end,
      observacoes = case when p ? 'observacoes' then deusede.txt(p, 'observacoes') else observacoes end,
      ativo = coalesce((p ->> 'ativo')::boolean, ativo),
      estoque_minimo = case when p ? 'estoque_minimo' then deusede.num(p, 'estoque_minimo') else estoque_minimo end,
      preco_venda = case when p ? 'preco_venda' then deusede.num(p, 'preco_venda') else preco_venda end,
      preco_venda_embalagem = case when p ? 'preco_venda_embalagem' then deusede.num(p, 'preco_venda_embalagem') else preco_venda_embalagem end,
      custo_referencia = case when p ? 'custo_referencia' then round(deusede.num(p, 'custo_referencia'), 4) else custo_referencia end
    where id = v_id
    returning * into r;
    if r.id is null then raise exception 'Produto não encontrado.'; end if;
  end if;
  return to_jsonb(r);
exception when others then
  get stacked diagnostics v_restricao = constraint_name;
  raise exception '%', deusede.traduzir_erro(sqlstate, sqlerrm, v_restricao);
end $$;

-- Entrada manual de estoque sem custo usa o preço de custo do cadastro.
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
    v_custo := coalesce(v_custo, v_prod.custo_referencia);
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
