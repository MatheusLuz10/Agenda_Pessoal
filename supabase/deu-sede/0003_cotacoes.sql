-- =====================================================================
-- DEU SEDE! — Migração 0003: cotações (Etapa 3)
-- =====================================================================

-- Cotação recebida -> histórico de preços (data da cotação) e preço
-- atual do fornecedor. Uma cotação mais antiga não sobrescreve um preço
-- atual mais novo.
create or replace function deusede.tg_cotacao_recebida()
returns trigger language plpgsql security definer set search_path = deusede as $$
declare
  i deusede.cotacao_itens;
begin
  if new.status = 'recebida' and old.status in ('em_elaboracao', 'aguardando_fornecedor') then
    for i in select * from deusede.cotacao_itens where cotacao_id = new.id loop
      insert into deusede.historico_precos (
        produto_id, fornecedor_id, origem, cotacao_item_id, data_referencia,
        tipo_embalagem, unidades_por_embalagem, preco_embalagem
      ) values (
        i.produto_id, new.fornecedor_id, 'cotacao', i.id, new.data_cotacao,
        i.tipo_embalagem, i.unidades_por_embalagem, i.preco_embalagem
      ) on conflict (cotacao_item_id) do nothing;

      insert into deusede.fornecedor_produtos as fp (
        fornecedor_id, produto_id, tipo_embalagem, unidades_por_embalagem,
        preco_atual, preco_origem, preco_atualizado_em
      ) values (
        new.fornecedor_id, i.produto_id, i.tipo_embalagem, i.unidades_por_embalagem,
        i.preco_embalagem, 'cotacao', new.data_cotacao::timestamptz
      )
      on conflict (fornecedor_id, produto_id, tipo_embalagem, unidades_por_embalagem) do update
        set preco_atual = excluded.preco_atual,
            preco_origem = 'cotacao',
            preco_atualizado_em = excluded.preco_atualizado_em
        where fp.preco_atualizado_em is null
           or fp.preco_atualizado_em::date <= excluded.preco_atualizado_em::date;
    end loop;
  end if;
  return new;
end $$;

drop trigger if exists cotacao_recebida on deusede.cotacoes;
create trigger cotacao_recebida
  after update of status on deusede.cotacoes
  for each row execute function deusede.tg_cotacao_recebida();

-- ---------------------------------------------------------------------
-- Leitura
-- ---------------------------------------------------------------------

create or replace function deusede.listar_cotacoes(p jsonb default '{}')
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(v) order by v.data_cotacao desc, v.numero desc), '[]')
  from (
    select * from deusede.vw_cotacoes v
    where (deusede.txt(p, 'status') is null or v.status = deusede.txt(p, 'status'))
      and (deusede.uid(p, 'fornecedor_id') is null or v.fornecedor_id = deusede.uid(p, 'fornecedor_id'))
      and (deusede.txt(p, 'de') is null or v.data_cotacao >= deusede.txt(p, 'de')::date)
      and (deusede.txt(p, 'ate') is null or v.data_cotacao <= deusede.txt(p, 'ate')::date)
      and (coalesce((p ->> 'somente_vencidas')::boolean, false) = false or v.vencida)
      and (deusede.txt(p, 'busca') is null
           or v.numero_formatado ilike '%' || deusede.txt(p, 'busca') || '%'
           or v.fornecedor_nome ilike '%' || deusede.txt(p, 'busca') || '%')
    order by v.data_cotacao desc, v.numero desc
    limit 500
  ) v
$$;

create or replace function deusede.obter_cotacao(p jsonb)
returns jsonb language sql stable as $$
  select to_jsonb(v) || jsonb_build_object(
    'itens', coalesce((
      select jsonb_agg(to_jsonb(i) order by lower(i.produto_nome), i.unidades_por_embalagem)
      from deusede.cotacao_itens i where i.cotacao_id = v.id
    ), '[]'),
    'eventos', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at, e.id)
      from deusede.eventos e where e.entidade = 'cotacao' and e.entidade_id = v.id
    ), '[]'),
    'pedidos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pd.id, 'numero_formatado', deusede.formatar_numero('PED', pd.numero), 'status', pd.status
      ) order by pd.numero)
      from deusede.pedidos pd where pd.cotacao_id = v.id
    ), '[]'),
    'fornecedor', (select to_jsonb(f) from deusede.fornecedores f where f.id = v.fornecedor_id)
  )
  from deusede.vw_cotacoes v
  where v.id = deusede.uid(p, 'id')
$$;

-- Histórico do fornecedor: cotações, pedidos e total comprado.
create or replace function deusede.resumo_fornecedor(p jsonb)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'cotacoes', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.data_cotacao desc, c.numero desc)
      from (select * from deusede.vw_cotacoes where fornecedor_id = deusede.uid(p, 'id')
            order by data_cotacao desc, numero desc limit 50) c
    ), '[]'),
    'pedidos', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.data_pedido desc, x.numero desc)
      from (select * from deusede.vw_pedidos where fornecedor_id = deusede.uid(p, 'id')
            order by data_pedido desc, numero desc limit 50) x
    ), '[]'),
    'total_comprado', coalesce((
      select sum(valor_total) from deusede.vw_pedidos
      where fornecedor_id = deusede.uid(p, 'id') and compra_realizada
    ), 0),
    'qtd_pedidos', (
      select count(*) from deusede.pedidos
      where fornecedor_id = deusede.uid(p, 'id') and deusede.pedido_conta_como_compra(status)
    ),
    'ultima_compra', (
      select max(data_pedido) from deusede.pedidos
      where fornecedor_id = deusede.uid(p, 'id') and deusede.pedido_conta_como_compra(status)
    )
  )
$$;

-- Onde o produto aparece: cotações e pedidos.
create or replace function deusede.movimentos_produto(p jsonb)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'cotacoes', coalesce((
      select jsonb_agg(x order by x.data_cotacao desc, x.numero desc) from (
        select c.id as cotacao_id, c.numero, deusede.formatar_numero('COT', c.numero) as numero_formatado,
               c.data_cotacao, c.status, f.nome as fornecedor_nome, i.tipo_embalagem, i.unidades_por_embalagem,
               i.quantidade_embalagens, i.preco_embalagem, i.preco_unitario,
               (c.validade is not null and c.validade < current_date) as vencida
        from deusede.cotacao_itens i
        join deusede.cotacoes c on c.id = i.cotacao_id
        join deusede.fornecedores f on f.id = c.fornecedor_id
        where i.produto_id = deusede.uid(p, 'id')
        order by c.data_cotacao desc, c.numero desc limit 50
      ) x
    ), '[]'),
    'pedidos', coalesce((
      select jsonb_agg(x order by x.data_pedido desc, x.numero desc) from (
        select pd.id as pedido_id, pd.numero, deusede.formatar_numero('PED', pd.numero) as numero_formatado,
               pd.data_pedido, pd.status, pd.fornecedor_nome, i.tipo_embalagem, i.unidades_por_embalagem,
               i.quantidade_embalagens, i.preco_embalagem, i.preco_unitario, i.subtotal
        from deusede.pedido_itens i
        join deusede.pedidos pd on pd.id = i.pedido_id
        where i.produto_id = deusede.uid(p, 'id')
        order by pd.data_pedido desc, pd.numero desc limit 50
      ) x
    ), '[]')
  )
$$;

-- ---------------------------------------------------------------------
-- Gravação
-- ---------------------------------------------------------------------

-- Cabeçalho + itens numa operação só. Itens são substituídos por inteiro
-- (permitido só enquanto a cotação ainda não foi recebida).
create or replace function deusede.salvar_cotacao(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_id uuid := deusede.uid(p, 'id');
  v_status_pedido text := deusede.txt(p, 'status');
  v_status_atual text;
  r deusede.cotacoes;
  it jsonb;
  v_prod deusede.produtos;
  v_restricao text;
begin
  perform deusede.exigir_edicao();
  if deusede.uid(p, 'fornecedor_id') is null then raise exception 'Escolha o fornecedor.'; end if;
  if jsonb_typeof(p -> 'itens') is distinct from 'array' or jsonb_array_length(p -> 'itens') = 0 then
    raise exception 'Adicione ao menos um produto à cotação.';
  end if;

  if v_id is null then
    insert into deusede.cotacoes (
      fornecedor_id, data_cotacao, validade, frete, desconto_geral, condicao_pagamento, prazo_entrega, observacoes, status
    ) values (
      deusede.uid(p, 'fornecedor_id'),
      coalesce(deusede.txt(p, 'data_cotacao')::date, current_date),
      deusede.txt(p, 'validade')::date,
      coalesce(deusede.num(p, 'frete'), 0),
      coalesce(deusede.num(p, 'desconto_geral'), 0),
      deusede.txt(p, 'condicao_pagamento'),
      deusede.txt(p, 'prazo_entrega'),
      deusede.txt(p, 'observacoes'),
      case when v_status_pedido = 'aguardando_fornecedor' then 'aguardando_fornecedor' else 'em_elaboracao' end
    ) returning * into r;
  else
    select status into v_status_atual from deusede.cotacoes where id = v_id for update;
    if v_status_atual is null then raise exception 'Cotação não encontrada.'; end if;
    if not deusede.cotacao_editavel(v_status_atual) then
      raise exception 'Esta cotação já foi recebida e não pode mais ser editada. Use "Duplicar" para registrar uma nova proposta.';
    end if;
    update deusede.cotacoes set
      fornecedor_id = deusede.uid(p, 'fornecedor_id'),
      data_cotacao = coalesce(deusede.txt(p, 'data_cotacao')::date, data_cotacao),
      validade = deusede.txt(p, 'validade')::date,
      frete = coalesce(deusede.num(p, 'frete'), 0),
      desconto_geral = coalesce(deusede.num(p, 'desconto_geral'), 0),
      condicao_pagamento = deusede.txt(p, 'condicao_pagamento'),
      prazo_entrega = deusede.txt(p, 'prazo_entrega'),
      observacoes = deusede.txt(p, 'observacoes')
    where id = v_id
    returning * into r;
    delete from deusede.cotacao_itens where cotacao_id = v_id;
  end if;

  for it in select x from jsonb_array_elements(p -> 'itens') x loop
    select * into v_prod from deusede.produtos where id = deusede.uid(it, 'produto_id');
    if v_prod.id is null then raise exception 'Produto não encontrado.'; end if;
    if coalesce(deusede.num(it, 'quantidade_embalagens'), 0) <= 0 then
      raise exception 'Informe a quantidade de "%".', v_prod.nome;
    end if;
    if deusede.num(it, 'preco_embalagem') is null then
      raise exception 'Informe o preço de "%".', v_prod.nome;
    end if;
    insert into deusede.cotacao_itens (
      cotacao_id, produto_id, produto_nome, tipo_embalagem, unidades_por_embalagem,
      quantidade_embalagens, preco_embalagem, desconto_valor, observacoes
    ) values (
      r.id, v_prod.id, v_prod.nome,
      coalesce(deusede.txt(it, 'tipo_embalagem'), v_prod.tipo_embalagem),
      coalesce(deusede.num(it, 'unidades_por_embalagem')::int, v_prod.unidades_por_embalagem),
      deusede.num(it, 'quantidade_embalagens'),
      deusede.num(it, 'preco_embalagem'),
      coalesce(deusede.num(it, 'desconto_valor'), 0),
      deusede.txt(it, 'observacoes')
    );
  end loop;

  -- "Salvar como recebida" etc.: muda o status depois dos itens gravados.
  if v_status_pedido is not null and v_status_pedido <> (select status from deusede.cotacoes where id = r.id) then
    update deusede.cotacoes set status = v_status_pedido where id = r.id;
  end if;

  return deusede.obter_cotacao(jsonb_build_object('id', r.id));
exception when others then
  get stacked diagnostics v_restricao = constraint_name;
  raise exception '%', deusede.traduzir_erro(sqlstate, sqlerrm, v_restricao);
end $$;

create or replace function deusede.mudar_status_cotacao(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_id uuid := deusede.uid(p, 'id');
  v_status text := deusede.txt(p, 'status');
  v_restricao text;
begin
  perform deusede.exigir_edicao();
  if v_status = 'rejeitada' and deusede.txt(p, 'motivo') is null then
    raise exception 'Informe o motivo da rejeição.';
  end if;
  update deusede.cotacoes set
    status = v_status,
    motivo_status = coalesce(deusede.txt(p, 'motivo'), motivo_status)
  where id = v_id;
  if not found then raise exception 'Cotação não encontrada.'; end if;
  return deusede.obter_cotacao(jsonb_build_object('id', v_id));
exception when others then
  get stacked diagnostics v_restricao = constraint_name;
  raise exception '%', deusede.traduzir_erro(sqlstate, sqlerrm, v_restricao);
end $$;

-- Nova proposta a partir de uma cotação existente (a original fica intacta).
create or replace function deusede.duplicar_cotacao(p jsonb)
returns jsonb language plpgsql as $$
declare
  o deusede.cotacoes;
  r deusede.cotacoes;
begin
  perform deusede.exigir_edicao();
  select * into o from deusede.cotacoes where id = deusede.uid(p, 'id');
  if o.id is null then raise exception 'Cotação não encontrada.'; end if;
  insert into deusede.cotacoes (
    fornecedor_id, data_cotacao, frete, desconto_geral, condicao_pagamento, prazo_entrega, observacoes
  ) values (
    o.fornecedor_id, current_date, o.frete, o.desconto_geral, o.condicao_pagamento, o.prazo_entrega,
    'Nova proposta a partir de ' || deusede.formatar_numero('COT', o.numero)
  ) returning * into r;
  insert into deusede.cotacao_itens (
    cotacao_id, produto_id, produto_nome, tipo_embalagem, unidades_por_embalagem,
    quantidade_embalagens, preco_embalagem, desconto_valor, observacoes
  )
  select r.id, i.produto_id, coalesce(pr.nome, i.produto_nome), i.tipo_embalagem, i.unidades_por_embalagem,
         i.quantidade_embalagens, i.preco_embalagem, i.desconto_valor, i.observacoes
  from deusede.cotacao_itens i
  left join deusede.produtos pr on pr.id = i.produto_id
  where i.cotacao_id = o.id;
  return deusede.obter_cotacao(jsonb_build_object('id', r.id));
end $$;

create or replace function deusede.excluir_cotacao(p jsonb)
returns jsonb language plpgsql as $$
begin
  perform deusede.exigir_edicao();
  delete from deusede.cotacoes where id = deusede.uid(p, 'id');
  if not found then raise exception 'Cotação não encontrada.'; end if;
  return jsonb_build_object('ok', true);
end $$;
