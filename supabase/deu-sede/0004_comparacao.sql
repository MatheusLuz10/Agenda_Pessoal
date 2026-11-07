-- =====================================================================
-- DEU SEDE! — Migração 0004: comparação de preços (Etapa 4)
--
-- O banco entrega as ofertas registradas; a escolha da melhor
-- combinação é calculada na tela (src/modules/deu-sede/domain/comparacao.ts),
-- porque depende da quantidade desejada e das escolhas do usuário.
-- Nenhum preço é estimado: só entram itens de cotações recebidas.
-- =====================================================================

-- Para cada fornecedor + produto + embalagem, a oferta da cotação mais
-- recente que já foi recebida (recebida, em análise ou aprovada).
create or replace function deusede.ofertas_comparacao(p jsonb default '{}')
returns jsonb language sql stable as $$
  with filtro as (
    select (x)::uuid as produto_id
    from jsonb_array_elements_text(coalesce(p -> 'produto_ids', '[]')) x
  ),
  ofertas as (
    select distinct on (c.fornecedor_id, i.produto_id, i.tipo_embalagem, i.unidades_por_embalagem)
      i.id as cotacao_item_id,
      i.produto_id,
      i.produto_nome,
      c.id as cotacao_id,
      deusede.formatar_numero('COT', c.numero) as cotacao_numero,
      c.fornecedor_id,
      f.nome as fornecedor_nome,
      f.ativo as fornecedor_ativo,
      c.status as cotacao_status,
      c.data_cotacao,
      c.validade,
      (c.validade is not null and c.validade < current_date) as vencida,
      i.tipo_embalagem,
      i.unidades_por_embalagem,
      i.quantidade_embalagens,
      i.preco_embalagem,
      i.desconto_valor,
      i.preco_unitario,
      c.frete,
      c.desconto_geral,
      c.condicao_pagamento,
      c.prazo_entrega
    from deusede.cotacao_itens i
    join deusede.cotacoes c on c.id = i.cotacao_id
    join deusede.fornecedores f on f.id = c.fornecedor_id
    where c.status in ('recebida', 'em_analise', 'aprovada')
      and (not exists (select 1 from filtro) or i.produto_id in (select produto_id from filtro))
    order by c.fornecedor_id, i.produto_id, i.tipo_embalagem, i.unidades_por_embalagem,
             c.data_cotacao desc, c.numero desc
  )
  select coalesce(jsonb_agg(to_jsonb(o) order by o.produto_id, o.preco_unitario), '[]')
  from ofertas o
$$;
