-- Deixa os descontos de cada linha de venda disponíveis no detalhe e nos relatórios.
alter table deusede.venda_itens
  add column if not exists desconto_item numeric(14, 2)
  generated always as (
    greatest(0::numeric, round(quantidade * (coalesce(preco_tabela, preco_unitario) - preco_unitario), 2))
  ) stored;

create or replace function deusede.listar_vendas(p jsonb default '{}')
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
    select v.id, v.numero, deusede.formatar_numero('VEN', v.numero) as numero_formatado, v.status, v.forma_pagamento,
           v.cliente, v.total,
           v.desconto + coalesce((select sum(i.desconto_item) from deusede.venda_itens i where i.venda_id = v.id), 0) as desconto,
           v.troco, v.created_at, deusede.data_brasil(v.created_at) as data,
           v.motivo_cancelamento,
           (select count(*) from deusede.venda_itens i where i.venda_id = v.id) as qtd_itens
    from deusede.vendas v
    where deusede.data_brasil(v.created_at) between coalesce(deusede.txt(p, 'de')::date, deusede.data_brasil(now()))
                                               and coalesce(deusede.txt(p, 'ate')::date, deusede.data_brasil(now()))
    order by v.created_at desc
    limit 500
  ) x
$$;

create or replace function deusede.resumo_vendas(p jsonb default '{}')
returns jsonb language sql stable as $$
  with v as (
    select * from deusede.vendas
    where deusede.data_brasil(created_at) between coalesce(deusede.txt(p, 'de')::date, deusede.data_brasil(now()))
                                             and coalesce(deusede.txt(p, 'ate')::date, deusede.data_brasil(now()))
  ),
  ok as (select * from v where status = 'concluida')
  select jsonb_build_object(
    'total', coalesce((select sum(total) from ok), 0),
    'qtd_vendas', (select count(*) from ok),
    'ticket_medio', coalesce((select round(avg(total), 2) from ok), 0),
    'descontos', coalesce((select sum(desconto) from ok), 0) + coalesce((
      select sum(i.desconto_item) from deusede.venda_itens i join ok on ok.id = i.venda_id
    ), 0),
    'custo_total', coalesce((select sum(custo_total) from ok), 0),
    'margem', coalesce((select sum(total) - sum(coalesce(custo_total, 0)) from ok), 0),
    'canceladas', (select count(*) from v where status = 'cancelada'),
    'por_forma', coalesce((select jsonb_object_agg(forma_pagamento, t) from (
        select forma_pagamento, sum(total) as t from ok group by forma_pagamento) f), '{}'),
    'mais_vendidos', coalesce((select jsonb_agg(x) from (
        select i.produto_id, i.produto_nome, sum(i.quantidade_unidades) as unidades, sum(i.subtotal) as total
        from deusede.venda_itens i join ok on ok.id = i.venda_id
        group by i.produto_id, i.produto_nome order by sum(i.subtotal) desc limit 10) x), '[]')
  )
$$;
