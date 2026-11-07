-- =====================================================================
-- DEU SEDE! — Migração 0007: painel e relatórios (Etapa 7)
--
-- Compra realizada = pedido enviado ao fornecedor ou posterior, e não
-- cancelado (deusede.pedido_conta_como_compra). Cotação NUNCA entra.
-- Período = data do pedido.
-- =====================================================================

create or replace function deusede.periodo_de(p jsonb)
returns date language sql stable as $$
  select coalesce(deusede.txt(p, 'de')::date, date_trunc('month', current_date)::date)
$$;

create or replace function deusede.periodo_ate(p jsonb)
returns date language sql stable as $$
  select coalesce(deusede.txt(p, 'ate')::date, current_date)
$$;

-- Itens de compras realizadas, já filtrados (base de quase tudo abaixo).
create or replace function deusede.itens_comprados(p jsonb)
returns table (
  pedido_id uuid, numero bigint, data_pedido date, fornecedor_id uuid, fornecedor_nome text,
  produto_id uuid, produto_nome text, categoria_id uuid, tipo_embalagem text, unidades_por_embalagem int,
  quantidade_embalagens numeric, unidades numeric, preco_unitario numeric, subtotal numeric,
  desconto_valor numeric, valor_recebido numeric
) language sql stable as $$
  select pd.id, pd.numero, pd.data_pedido, pd.fornecedor_id, pd.fornecedor_nome,
         s.produto_id, s.produto_nome, pr.categoria_id, s.tipo_embalagem, s.unidades_por_embalagem,
         s.quantidade_embalagens, s.quantidade_embalagens * s.unidades_por_embalagem, s.preco_unitario, s.subtotal,
         s.desconto_valor, s.valor_recebido
  from deusede.pedidos pd
  join deusede.vw_pedido_itens_saldo s on s.pedido_id = pd.id
  join deusede.produtos pr on pr.id = s.produto_id
  where deusede.pedido_conta_como_compra(pd.status)
    and pd.data_pedido between deusede.periodo_de(p) and deusede.periodo_ate(p)
    and (deusede.uid(p, 'fornecedor_id') is null or pd.fornecedor_id = deusede.uid(p, 'fornecedor_id'))
    and (deusede.uid(p, 'produto_id') is null or s.produto_id = deusede.uid(p, 'produto_id'))
    and (deusede.uid(p, 'categoria_id') is null or pr.categoria_id = deusede.uid(p, 'categoria_id'))
    and (deusede.txt(p, 'status') is null or pd.status = deusede.txt(p, 'status'))
    and (deusede.txt(p, 'numero') is null
         or deusede.formatar_numero('PED', pd.numero) ilike '%' || deusede.txt(p, 'numero') || '%')
$$;

-- Pedidos (compras realizadas) do período, com os mesmos filtros.
create or replace function deusede.pedidos_comprados(p jsonb)
returns setof deusede.vw_pedidos language sql stable as $$
  select v.* from deusede.vw_pedidos v
  where v.compra_realizada
    and v.data_pedido between deusede.periodo_de(p) and deusede.periodo_ate(p)
    and (deusede.uid(p, 'fornecedor_id') is null or v.fornecedor_id = deusede.uid(p, 'fornecedor_id'))
    and (deusede.txt(p, 'status') is null or v.status = deusede.txt(p, 'status'))
    and (deusede.txt(p, 'numero') is null or v.numero_formatado ilike '%' || deusede.txt(p, 'numero') || '%')
    and (deusede.uid(p, 'produto_id') is null or exists (
          select 1 from deusede.pedido_itens i where i.pedido_id = v.id and i.produto_id = deusede.uid(p, 'produto_id')))
    and (deusede.uid(p, 'categoria_id') is null or exists (
          select 1 from deusede.pedido_itens i join deusede.produtos pr on pr.id = i.produto_id
           where i.pedido_id = v.id and pr.categoria_id = deusede.uid(p, 'categoria_id')))
$$;

-- Última variação de preço por produto + fornecedor (preço por unidade).
create or replace function deusede.variacoes_preco(p jsonb)
returns table (produto_id uuid, produto_nome text, fornecedor_id uuid, fornecedor_nome text,
               anterior numeric, atual numeric, variacao_pct numeric, data_referencia date)
language sql stable as $$
  with h as (
    select h.*, row_number() over (
      partition by h.produto_id, h.fornecedor_id order by h.data_referencia desc, h.created_at desc
    ) as rn
    from deusede.historico_precos h
  )
  select a.produto_id, pr.nome, a.fornecedor_id, f.nome, b.preco_unitario, a.preco_unitario,
         round((a.preco_unitario - b.preco_unitario) / b.preco_unitario * 100, 1), a.data_referencia
  from h a
  join h b on b.produto_id = a.produto_id and b.fornecedor_id = a.fornecedor_id and b.rn = 2
  join deusede.produtos pr on pr.id = a.produto_id
  join deusede.fornecedores f on f.id = a.fornecedor_id
  where a.rn = 1 and b.preco_unitario > 0 and a.preco_unitario <> b.preco_unitario
    and a.data_referencia between deusede.periodo_de(p) and deusede.periodo_ate(p)
$$;

-- ---------------------------------------------------------------------
-- Painel inicial
-- ---------------------------------------------------------------------
create or replace function deusede.painel(p jsonb default '{}')
returns jsonb language sql stable as $$
  with ped as (select * from deusede.pedidos_comprados(p)),
       itens as (select * from deusede.itens_comprados(p)),
       var as (select * from deusede.variacoes_preco(p)),
       meses as (
         select generate_series(
           date_trunc('month', deusede.periodo_ate(p)) - interval '11 months',
           date_trunc('month', deusede.periodo_ate(p)), interval '1 month'
         )::date as mes
       )
  select jsonb_build_object(
    'periodo', jsonb_build_object('de', deusede.periodo_de(p), 'ate', deusede.periodo_ate(p)),
    'total_comprado', coalesce((select sum(valor_total) from ped), 0),
    'total_recebido', coalesce((select sum(valor_recebido_itens) from ped), 0),
    'pedidos_realizados', (select count(*) from ped),
    'valor_medio_pedido', coalesce((select round(avg(valor_total), 2) from ped), 0),
    'total_frete', coalesce((select sum(frete) from ped), 0),
    'total_descontos', coalesce((select sum(total_descontos) from ped), 0),
    'orcamentos_recebidos', (
      select count(*) from deusede.cotacoes
      where status not in ('em_elaboracao', 'aguardando_fornecedor')
        and data_cotacao between deusede.periodo_de(p) and deusede.periodo_ate(p)),
    'orcamentos_aguardando_analise', (select count(*) from deusede.cotacoes where status in ('recebida', 'em_analise')),
    'pedidos_aguardando_aprovacao', (select count(*) from deusede.pedidos where status in ('em_elaboracao', 'aguardando_aprovacao')),
    'pedidos_aprovados_nao_enviados', (select count(*) from deusede.pedidos where status = 'aprovado'),
    'pedidos_aguardando_confirmacao', (select count(*) from deusede.pedidos where status = 'enviado'),
    'pedidos_aguardando_recebimento', (select count(*) from deusede.pedidos where status in ('confirmado', 'em_transporte')),
    'pedidos_parcialmente_recebidos', (select count(*) from deusede.pedidos where status = 'parcialmente_recebido'),
    'fornecedores_ativos', (select count(*) from deusede.fornecedores where ativo),
    'fornecedor_maior_volume', (
      select jsonb_build_object('fornecedor_id', fornecedor_id, 'nome', fornecedor_nome, 'total', sum(valor_total), 'pedidos', count(*))
      from ped group by fornecedor_id, fornecedor_nome order by sum(valor_total) desc limit 1),
    'produtos_mais_comprados', coalesce((
      select jsonb_agg(x) from (
        select produto_id, produto_nome, sum(unidades) as unidades, sum(quantidade_embalagens) as embalagens, sum(subtotal) as total
        from itens group by produto_id, produto_nome order by sum(subtotal) desc limit 5) x), '[]'),
    'maiores_altas', coalesce((
      select jsonb_agg(x) from (select * from var where variacao_pct > 0 order by variacao_pct desc limit 5) x), '[]'),
    'maiores_quedas', coalesce((
      select jsonb_agg(x) from (select * from var where variacao_pct < 0 order by variacao_pct asc limit 5) x), '[]'),
    'mensal', (
      select jsonb_agg(jsonb_build_object(
        'mes', m.mes,
        'total', coalesce((select sum(v.valor_total) from deusede.vw_pedidos v
                           where v.compra_realizada and date_trunc('month', v.data_pedido)::date = m.mes), 0),
        'recebido', coalesce((select sum(v.valor_recebido_itens) from deusede.vw_pedidos v
                              where v.compra_realizada and date_trunc('month', v.data_pedido)::date = m.mes), 0),
        'pedidos', (select count(*) from deusede.pedidos v
                    where deusede.pedido_conta_como_compra(v.status) and date_trunc('month', v.data_pedido)::date = m.mes)
      ) order by m.mes)
      from meses m)
  )
$$;

-- ---------------------------------------------------------------------
-- Relatórios
-- ---------------------------------------------------------------------

-- Financeiro: totais, por mês e por fornecedor.
-- Com filtro de produto/categoria, os valores são só dos itens filtrados
-- (frete e desconto geral não se aplicam a um produto isolado).
create or replace function deusede.relatorio_financeiro(p jsonb default '{}')
returns jsonb language sql stable as $$
  with ped as (select * from deusede.pedidos_comprados(p)),
       itens as (select * from deusede.itens_comprados(p)),
       por_item as (select deusede.uid(p, 'produto_id') is not null or deusede.uid(p, 'categoria_id') is not null as v)
  select jsonb_build_object(
    'somente_itens', (select v from por_item),
    'resumo', jsonb_build_object(
      'total_comprado', case when (select v from por_item) then coalesce((select sum(subtotal) from itens), 0)
                             else coalesce((select sum(valor_total) from ped), 0) end,
      'total_itens', coalesce((select sum(subtotal) from itens), 0),
      'total_fretes', case when (select v from por_item) then 0 else coalesce((select sum(frete) from ped), 0) end,
      'total_descontos', case when (select v from por_item) then coalesce((select sum(desconto_valor) from itens), 0)
                              else coalesce((select sum(total_descontos) from ped), 0) end,
      'total_recebido', coalesce((select sum(valor_recebido) from itens), 0),
      'qtd_pedidos', (select count(*) from ped),
      'valor_medio', coalesce((select round(avg(valor_total), 2) from ped), 0)
    ),
    'por_mes', coalesce((
      select jsonb_agg(x order by x.mes) from (
        select m.mes, m.total_itens, m.pedidos,
               coalesce((select sum(pp.frete) from ped pp where date_trunc('month', pp.data_pedido)::date = m.mes), 0) as fretes,
               coalesce((select sum(pp.valor_total) from ped pp where date_trunc('month', pp.data_pedido)::date = m.mes), 0) as total_pedidos
        from (
          select date_trunc('month', i.data_pedido)::date as mes, sum(i.subtotal) as total_itens,
                 count(distinct i.pedido_id) as pedidos
          from itens i group by 1
        ) m
      ) x), '[]'),
    'por_fornecedor', coalesce((
      select jsonb_agg(x order by x.total desc) from (
        select pp.fornecedor_id, pp.fornecedor_nome, sum(pp.valor_total) as total, sum(pp.frete) as fretes,
               sum(pp.total_descontos) as descontos, count(*) as pedidos
        from ped pp group by pp.fornecedor_id, pp.fornecedor_nome
      ) x), '[]')
  )
$$;

-- Fornecedores: quanto comprou de cada um, quando, o quê e preços.
create or replace function deusede.relatorio_fornecedores(p jsonb default '{}')
returns jsonb language sql stable as $$
  with ped as (select * from deusede.pedidos_comprados(p)),
       itens as (select * from deusede.itens_comprados(p)),
       melhor as (  -- fornecedor com menor preço atual por unidade, por produto
         select distinct on (fp.produto_id) fp.produto_id, fp.fornecedor_id
         from deusede.fornecedor_produtos fp
         where fp.ativo and fp.preco_atual is not null
         order by fp.produto_id, fp.preco_atual / fp.unidades_por_embalagem
       ),
       evolucao as (  -- primeiro x último preço por unidade no período, por produto
         select h.fornecedor_id, h.produto_id,
                (array_agg(h.preco_unitario order by h.data_referencia, h.created_at))[1] as primeiro,
                (array_agg(h.preco_unitario order by h.data_referencia desc, h.created_at desc))[1] as ultimo
         from deusede.historico_precos h
         where h.data_referencia between deusede.periodo_de(p) and deusede.periodo_ate(p)
         group by h.fornecedor_id, h.produto_id
       )
  select coalesce(jsonb_agg(x order by x.total_comprado desc, x.fornecedor_nome), '[]') from (
    select f.id as fornecedor_id, f.nome as fornecedor_nome, f.ativo,
           coalesce((select sum(valor_total) from ped where fornecedor_id = f.id), 0) as total_comprado,
           (select count(*) from ped where fornecedor_id = f.id) as qtd_pedidos,
           (select max(data_pedido) from deusede.pedidos pd
             where pd.fornecedor_id = f.id and deusede.pedido_conta_como_compra(pd.status)) as ultima_compra,
           (select count(*) from deusede.cotacoes c where c.fornecedor_id = f.id
             and c.status not in ('em_elaboracao', 'aguardando_fornecedor')
             and c.data_cotacao between deusede.periodo_de(p) and deusede.periodo_ate(p)) as cotacoes_recebidas,
           coalesce((select string_agg(nome, ', ') from (
              select produto_nome as nome from itens where fornecedor_id = f.id
              group by produto_nome order by sum(subtotal) desc limit 3) t), '') as produtos_mais_comprados,
           (select count(*) from melhor m where m.fornecedor_id = f.id) as produtos_com_melhor_preco,
           (select round(avg((e.ultimo - e.primeiro) / nullif(e.primeiro, 0) * 100), 1)
              from evolucao e where e.fornecedor_id = f.id) as variacao_media_pct
    from deusede.fornecedores f
    where (deusede.uid(p, 'fornecedor_id') is null or f.id = deusede.uid(p, 'fornecedor_id'))
  ) x
  where x.total_comprado > 0 or x.cotacoes_recebidas > 0 or deusede.uid(p, 'fornecedor_id') is not null
$$;

-- Produtos: quantidades, gastos e faixa de preço.
create or replace function deusede.relatorio_produtos(p jsonb default '{}')
returns jsonb language sql stable as $$
  with itens as (select * from deusede.itens_comprados(p)),
       hist as (
         select h.* from deusede.historico_precos h
         where h.data_referencia between deusede.periodo_de(p) and deusede.periodo_ate(p)
           and (deusede.uid(p, 'fornecedor_id') is null or h.fornecedor_id = deusede.uid(p, 'fornecedor_id'))
       )
  select coalesce(jsonb_agg(x order by x.total_gasto desc, x.produto_nome), '[]') from (
    select pr.id as produto_id, pr.nome as produto_nome, c.nome as categoria_nome,
           coalesce((select sum(unidades) from itens i where i.produto_id = pr.id), 0) as unidades_compradas,
           coalesce((select sum(quantidade_embalagens) from itens i where i.produto_id = pr.id), 0) as embalagens_compradas,
           coalesce((select sum(subtotal) from itens i where i.produto_id = pr.id), 0) as total_gasto,
           (select i.preco_unitario from itens i where i.produto_id = pr.id
             order by i.data_pedido desc, i.numero desc limit 1) as ultimo_preco_unitario,
           (select min(preco_unitario) from hist h where h.produto_id = pr.id) as menor_preco_unitario,
           (select max(preco_unitario) from hist h where h.produto_id = pr.id) as maior_preco_unitario,
           (select round(((array_agg(h.preco_unitario order by h.data_referencia desc, h.created_at desc))[1]
                         - (array_agg(h.preco_unitario order by h.data_referencia, h.created_at))[1])
                         / nullif((array_agg(h.preco_unitario order by h.data_referencia, h.created_at))[1], 0) * 100, 1)
              from hist h where h.produto_id = pr.id) as variacao_pct,
           (select f.nome from deusede.fornecedor_produtos fp join deusede.fornecedores f on f.id = fp.fornecedor_id
             where fp.produto_id = pr.id and fp.ativo and f.ativo and fp.preco_atual is not null
             order by fp.preco_atual / fp.unidades_por_embalagem limit 1) as melhor_fornecedor,
           (select round(min(fp.preco_atual / fp.unidades_por_embalagem), 4)
              from deusede.fornecedor_produtos fp join deusede.fornecedores f on f.id = fp.fornecedor_id
             where fp.produto_id = pr.id and fp.ativo and f.ativo and fp.preco_atual is not null) as melhor_preco_unitario
    from deusede.produtos pr
    join deusede.categorias c on c.id = pr.categoria_id
    where (deusede.uid(p, 'produto_id') is null or pr.id = deusede.uid(p, 'produto_id'))
      and (deusede.uid(p, 'categoria_id') is null or pr.categoria_id = deusede.uid(p, 'categoria_id'))
  ) x
  where x.total_gasto > 0 or x.menor_preco_unitario is not null or deusede.uid(p, 'produto_id') is not null
$$;

-- Pedidos: contagem por status e lista (todos os status, não só compras).
create or replace function deusede.relatorio_pedidos(p jsonb default '{}')
returns jsonb language sql stable as $$
  with base as (
    select v.* from deusede.vw_pedidos v
    where v.data_pedido between deusede.periodo_de(p) and deusede.periodo_ate(p)
      and (deusede.uid(p, 'fornecedor_id') is null or v.fornecedor_id = deusede.uid(p, 'fornecedor_id'))
      and (deusede.txt(p, 'numero') is null or v.numero_formatado ilike '%' || deusede.txt(p, 'numero') || '%')
      and (deusede.uid(p, 'produto_id') is null or exists (
            select 1 from deusede.pedido_itens i where i.pedido_id = v.id and i.produto_id = deusede.uid(p, 'produto_id')))
      and (deusede.uid(p, 'categoria_id') is null or exists (
            select 1 from deusede.pedido_itens i join deusede.produtos pr on pr.id = i.produto_id
             where i.pedido_id = v.id and pr.categoria_id = deusede.uid(p, 'categoria_id')))
  )
  select jsonb_build_object(
    'por_status', coalesce((
      select jsonb_object_agg(status, jsonb_build_object('quantidade', qtd, 'valor', valor))
      from (select status, count(*) as qtd, sum(valor_total) as valor from base group by status) s), '{}'),
    'linhas', coalesce((
      select jsonb_agg(to_jsonb(b) order by b.data_pedido desc, b.numero desc)
      from (select * from base where deusede.txt(p, 'status') is null or status = deusede.txt(p, 'status')) b), '[]')
  )
$$;
