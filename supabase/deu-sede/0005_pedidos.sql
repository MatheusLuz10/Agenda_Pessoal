-- =====================================================================
-- DEU SEDE! — Migração 0005: pedidos de compra (Etapa 5)
-- =====================================================================

create or replace function deusede.pedidos_do_lote(p_lote uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'lote_id', p_lote,
    'pedidos', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.numero) from deusede.vw_pedidos v where v.lote_id = p_lote
    ), '[]')
  )
$$;

-- MONTAR PEDIDO: recebe a lista de compras com o fornecedor de cada item
-- e gera UM PEDIDO POR FORNECEDOR, tudo numa transação.
--  * lote_id vem da tela: repetir a chamada devolve os mesmos pedidos.
--  * item com cotacao_item_id usa o preço, a embalagem e o desconto da
--    cotação (o pedido sempre bate com a cotação escolhida).
--  * item sem cotação usa o preço informado (ex.: preço atual do fornecedor).
create or replace function deusede.gerar_pedidos(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_lote uuid := deusede.uid(p, 'lote_id');
  v_forn uuid;
  v_f deusede.fornecedores;
  v_conf jsonb;
  v_ped deusede.pedidos;
  it jsonb;
  ci record;
  v_prod deusede.produtos;
  v_qtd numeric;
  v_preco numeric;
  v_desc numeric;
  v_tipo text;
  v_unid int;
  v_nome text;
  v_produto uuid;
  v_ci uuid;
  v_cotacoes uuid[];
  v_restricao text;
begin
  perform deusede.exigir_edicao();
  if v_lote is null then raise exception 'Identificação do lote não informada.'; end if;

  -- Clique repetido / reenvio: devolve o que já foi gerado.
  if exists (select 1 from deusede.pedidos where lote_id = v_lote) then
    return deusede.pedidos_do_lote(v_lote);
  end if;

  if jsonb_typeof(p -> 'itens') is distinct from 'array' or jsonb_array_length(p -> 'itens') = 0 then
    raise exception 'Adicione ao menos um produto ao pedido.';
  end if;
  if exists (select 1 from jsonb_array_elements(p -> 'itens') x where deusede.uid(x, 'fornecedor_id') is null) then
    raise exception 'Escolha o fornecedor de todos os produtos.';
  end if;

  for v_forn in
    select distinct deusede.uid(x, 'fornecedor_id') from jsonb_array_elements(p -> 'itens') x
  loop
    select * into v_f from deusede.fornecedores where id = v_forn;
    if v_f.id is null then raise exception 'Fornecedor não encontrado.'; end if;
    if not v_f.ativo then raise exception 'O fornecedor "%" está inativo.', v_f.nome; end if;

    select x into v_conf from jsonb_array_elements(coalesce(p -> 'fornecedores', '[]')) x
     where deusede.uid(x, 'fornecedor_id') = v_forn limit 1;
    v_conf := coalesce(v_conf, '{}');

    insert into deusede.pedidos (
      lote_id, fornecedor_id, fornecedor_nome, fornecedor_whatsapp, frete, desconto_geral,
      condicao_pagamento, previsao_entrega, observacoes
    ) values (
      v_lote, v_forn, v_f.nome, v_f.whatsapp,
      coalesce(deusede.num(v_conf, 'frete'), 0),
      coalesce(deusede.num(v_conf, 'desconto_geral'), 0),
      deusede.txt(v_conf, 'condicao_pagamento'),
      deusede.txt(v_conf, 'previsao_entrega')::date,
      deusede.txt(v_conf, 'observacoes')
    ) returning * into v_ped;

    v_cotacoes := '{}';
    for it in select x from jsonb_array_elements(p -> 'itens') x where deusede.uid(x, 'fornecedor_id') = v_forn loop
      v_qtd := deusede.num(it, 'quantidade_embalagens');
      if v_qtd is null or v_qtd <= 0 then raise exception 'Informe a quantidade de todos os produtos.'; end if;
      v_ci := deusede.uid(it, 'cotacao_item_id');

      if v_ci is not null then
        select i.*, c.fornecedor_id as c_fornecedor, c.status as c_status, c.numero as c_numero
          into ci
          from deusede.cotacao_itens i join deusede.cotacoes c on c.id = i.cotacao_id
         where i.id = v_ci;
        if not found then raise exception 'Item de cotação não encontrado.'; end if;
        if ci.c_fornecedor <> v_forn then raise exception 'O preço escolhido não pertence a este fornecedor.'; end if;
        if ci.c_status not in ('recebida', 'em_analise', 'aprovada') then
          raise exception 'A cotação % não pode gerar pedido (status: %).', deusede.formatar_numero('COT', ci.c_numero), ci.c_status;
        end if;
        v_produto := ci.produto_id;
        v_nome := ci.produto_nome;
        v_tipo := ci.tipo_embalagem;
        v_unid := ci.unidades_por_embalagem;
        v_preco := ci.preco_embalagem;
        -- desconto proporcional à quantidade pedida
        v_desc := round(ci.desconto_valor / ci.quantidade_embalagens * v_qtd, 2);
        v_cotacoes := array_append(v_cotacoes, ci.cotacao_id);
      else
        select * into v_prod from deusede.produtos where id = deusede.uid(it, 'produto_id');
        if v_prod.id is null then raise exception 'Produto não encontrado.'; end if;
        v_preco := deusede.num(it, 'preco_embalagem');
        if v_preco is null or v_preco < 0 then raise exception 'Informe o preço de "%".', v_prod.nome; end if;
        v_produto := v_prod.id;
        v_nome := v_prod.nome;
        v_tipo := coalesce(deusede.txt(it, 'tipo_embalagem'), v_prod.tipo_embalagem);
        v_unid := coalesce(deusede.num(it, 'unidades_por_embalagem')::int, v_prod.unidades_por_embalagem);
        v_desc := coalesce(deusede.num(it, 'desconto_valor'), 0);
      end if;

      insert into deusede.pedido_itens (
        pedido_id, produto_id, cotacao_item_id, produto_nome, tipo_embalagem, unidades_por_embalagem,
        quantidade_embalagens, preco_embalagem, desconto_valor, observacoes
      ) values (
        v_ped.id, v_produto, v_ci, v_nome, v_tipo, v_unid, v_qtd, v_preco, v_desc, deusede.txt(it, 'observacoes')
      );
    end loop;

    -- Cotação de origem: quando os preços vieram de uma única cotação.
    if (select count(distinct x) from unnest(v_cotacoes) x) = 1 then
      update deusede.pedidos set cotacao_id = v_cotacoes[1] where id = v_ped.id;
    end if;

    -- A confirmação na conferência é a aprovação.
    update deusede.pedidos set status = 'aprovado' where id = v_ped.id;
  end loop;

  return deusede.pedidos_do_lote(v_lote);
exception when others then
  get stacked diagnostics v_restricao = constraint_name;
  raise exception '%', deusede.traduzir_erro(sqlstate, sqlerrm, v_restricao);
end $$;

create or replace function deusede.listar_pedidos(p jsonb default '{}')
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(v) order by v.data_pedido desc, v.numero desc), '[]')
  from (
    select * from deusede.vw_pedidos v
    where (deusede.txt(p, 'status') is null or v.status = deusede.txt(p, 'status'))
      and (coalesce((p ->> 'aguardando_recebimento')::boolean, false) = false
           or deusede.pedido_aceita_recebimento(v.status))
      and (coalesce((p ->> 'abertos')::boolean, false) = false or v.status not in ('recebido', 'cancelado'))
      and (deusede.uid(p, 'fornecedor_id') is null or v.fornecedor_id = deusede.uid(p, 'fornecedor_id'))
      and (deusede.txt(p, 'de') is null or v.data_pedido >= deusede.txt(p, 'de')::date)
      and (deusede.txt(p, 'ate') is null or v.data_pedido <= deusede.txt(p, 'ate')::date)
      and (deusede.txt(p, 'busca') is null
           or v.numero_formatado ilike '%' || deusede.txt(p, 'busca') || '%'
           or v.fornecedor_nome ilike '%' || deusede.txt(p, 'busca') || '%')
      and (deusede.uid(p, 'produto_id') is null or exists (
            select 1 from deusede.pedido_itens i where i.pedido_id = v.id and i.produto_id = deusede.uid(p, 'produto_id')))
      and (deusede.uid(p, 'categoria_id') is null or exists (
            select 1 from deusede.pedido_itens i join deusede.produtos pr on pr.id = i.produto_id
             where i.pedido_id = v.id and pr.categoria_id = deusede.uid(p, 'categoria_id')))
    order by v.data_pedido desc, v.numero desc
    limit 500
  ) v
$$;

create or replace function deusede.obter_pedido(p jsonb)
returns jsonb language sql stable as $$
  select to_jsonb(v) || jsonb_build_object(
    'itens', coalesce((
      select jsonb_agg(to_jsonb(s) order by lower(s.produto_nome), s.unidades_por_embalagem)
      from deusede.vw_pedido_itens_saldo s where s.pedido_id = v.id
    ), '[]'),
    'recebimentos', coalesce((
      select jsonb_agg(to_jsonb(r) || jsonb_build_object(
          'numero_formatado', deusede.formatar_numero('REC', r.numero),
          'itens', coalesce((
            select jsonb_agg(to_jsonb(ri) || jsonb_build_object(
                'produto_nome', pi.produto_nome,
                'preco_pedido', pi.preco_embalagem
              ) order by lower(pi.produto_nome))
            from deusede.recebimento_itens ri join deusede.pedido_itens pi on pi.id = ri.pedido_item_id
            where ri.recebimento_id = r.id
          ), '[]')
        ) order by r.data_recebimento, r.numero)
      from deusede.recebimentos r where r.pedido_id = v.id
    ), '[]'),
    'eventos', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at, e.id)
      from deusede.eventos e where e.entidade = 'pedido' and e.entidade_id = v.id
    ), '[]'),
    'cotacao_numero', (select deusede.formatar_numero('COT', c.numero) from deusede.cotacoes c where c.id = v.cotacao_id),
    'fornecedor', (select to_jsonb(f) from deusede.fornecedores f where f.id = v.fornecedor_id),
    'empresa', (select to_jsonb(e) from deusede.configuracoes_empresa e limit 1)
  )
  from deusede.vw_pedidos v
  where v.id = deusede.uid(p, 'id')
$$;

-- Mudança de status (as transições permitidas são validadas pelo gatilho).
create or replace function deusede.mudar_status_pedido(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_id uuid := deusede.uid(p, 'id');
  v_status text := deusede.txt(p, 'status');
  v_restricao text;
begin
  perform deusede.exigir_edicao();
  if v_status in ('parcialmente_recebido', 'recebido') then
    raise exception 'Use o registro de recebimento para dar entrada nas mercadorias.';
  end if;
  update deusede.pedidos set
    status = v_status,
    motivo_cancelamento = case when v_status = 'cancelado' then deusede.txt(p, 'motivo') else motivo_cancelamento end
  where id = v_id;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  return deusede.obter_pedido(jsonb_build_object('id', v_id));
exception when others then
  get stacked diagnostics v_restricao = constraint_name;
  raise exception '%', deusede.traduzir_erro(sqlstate, sqlerrm, v_restricao);
end $$;

-- Previsão de entrega e observações podem mudar até o pedido ser concluído.
create or replace function deusede.atualizar_pedido(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_id uuid := deusede.uid(p, 'id');
  v_restricao text;
begin
  perform deusede.exigir_edicao();
  update deusede.pedidos set
    previsao_entrega = deusede.txt(p, 'previsao_entrega')::date,
    observacoes = deusede.txt(p, 'observacoes')
  where id = v_id;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  return deusede.obter_pedido(jsonb_build_object('id', v_id));
exception when others then
  get stacked diagnostics v_restricao = constraint_name;
  raise exception '%', deusede.traduzir_erro(sqlstate, sqlerrm, v_restricao);
end $$;
