-- DEU SEDE! — Migração 0024: garantir baixa de estoque do PDV.
-- Atualiza a função de venda e reconcilia vendas já concluídas que não
-- tenham movimento de saída. A reconciliação é idempotente e não repete
-- movimentos já ligados ao item da venda.

create or replace function deusede.registrar_venda(p jsonb)
returns jsonb language plpgsql security definer set search_path = deusede as $$
declare
  v_chave uuid := deusede.uid(p, 'chave_idempotencia');
  v_venda deusede.vendas;
  v_item deusede.venda_itens;
  v_prod deusede.produtos;
  r record;
  it jsonb;
  v_saldo numeric;
  v_subtotal numeric;
  v_sem_preco text;
  v_desc numeric := coalesce(deusede.num(p, 'desconto'), 0);
  v_total numeric;
  v_forma text := coalesce(deusede.txt(p, 'forma_pagamento'), 'dinheiro');
  v_recebido numeric := deusede.num(p, 'valor_recebido');
  v_unid int;
  v_qtd numeric;
  v_tabela numeric;
  v_custo numeric;
  v_custo_total numeric := 0;
  v_restricao text;
begin
  if not deusede.pode_vender() then raise exception 'Seu usuário não tem permissão para vender.'; end if;
  if v_chave is not null then
    select * into v_venda from deusede.vendas where chave_idempotencia = v_chave;
    if found then return deusede.obter_venda(jsonb_build_object('id', v_venda.id)); end if;
  end if;
  if jsonb_typeof(p -> 'itens') is distinct from 'array' or jsonb_array_length(p -> 'itens') = 0 then
    raise exception 'Adicione ao menos um produto.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p -> 'itens') x
    left join deusede.produtos pr on pr.id = deusede.uid(x, 'produto_id')
    where pr.id is null or coalesce(deusede.num(x, 'quantidade'), 0) <= 0
  ) then
    raise exception 'Produto inválido ou sem quantidade.';
  end if;

  for r in
    select pr.id, pr.nome,
           sum(deusede.num(x, 'quantidade') * case when deusede.txt(x, 'unidade_venda') = 'embalagem' then pr.unidades_por_embalagem else 1 end) as qtd_un
    from jsonb_array_elements(p -> 'itens') x
    join deusede.produtos pr on pr.id = deusede.uid(x, 'produto_id')
    group by pr.id, pr.nome
  loop
    perform 1 from deusede.produtos where id = r.id for update;
    select coalesce(sum(quantidade_unidades), 0) into v_saldo from deusede.estoque_movimentos where produto_id = r.id;
    if r.qtd_un > v_saldo then
      raise exception 'Estoque insuficiente de "%": saldo de % unidade(s), a venda pede %.', r.nome, trim_scale(v_saldo), trim_scale(r.qtd_un);
    end if;
  end loop;

  select min(pr.nome) filter (where preco is null), sum(round(deusede.num(x, 'quantidade') * preco, 2))
    into v_sem_preco, v_subtotal
  from jsonb_array_elements(p -> 'itens') x
  join deusede.produtos pr on pr.id = deusede.uid(x, 'produto_id')
  cross join lateral (select coalesce(
    deusede.num(x, 'preco_unitario'),
    case when deusede.txt(x, 'unidade_venda') = 'embalagem'
         then coalesce(pr.preco_venda_embalagem, pr.preco_venda * pr.unidades_por_embalagem)
         else pr.preco_venda end
  ) as preco) c;
  if v_sem_preco is not null then raise exception 'Informe o preço de venda de "%".', v_sem_preco; end if;
  if v_desc < 0 or v_desc > v_subtotal then raise exception 'Desconto inválido.'; end if;
  v_total := v_subtotal - v_desc;
  if v_forma = 'dinheiro' and v_recebido is not null and v_recebido < v_total then
    raise exception 'Valor recebido menor que o total da venda.';
  end if;

  insert into deusede.vendas (forma_pagamento, cliente, subtotal, desconto, total, valor_recebido, troco, observacoes, chave_idempotencia)
  values (v_forma, deusede.txt(p, 'cliente'), v_subtotal, v_desc, v_total, v_recebido,
          case when v_forma = 'dinheiro' and v_recebido is not null then v_recebido - v_total end,
          deusede.txt(p, 'observacoes'), coalesce(v_chave, gen_random_uuid()))
  returning * into v_venda;

  for it in select x from jsonb_array_elements(p -> 'itens') x loop
    select * into v_prod from deusede.produtos where id = deusede.uid(it, 'produto_id');
    v_unid := case when deusede.txt(it, 'unidade_venda') = 'embalagem' then v_prod.unidades_por_embalagem else 1 end;
    v_qtd := deusede.num(it, 'quantidade');
    v_tabela := case when v_unid > 1 or deusede.txt(it, 'unidade_venda') = 'embalagem'
                     then coalesce(v_prod.preco_venda_embalagem, v_prod.preco_venda * v_prod.unidades_por_embalagem)
                     else v_prod.preco_venda end;
    select m.custo_unitario into v_custo from deusede.estoque_movimentos m
     where m.produto_id = v_prod.id and m.tipo = 'entrada' and m.custo_unitario is not null
     order by m.created_at desc, m.id desc limit 1;

    insert into deusede.venda_itens (
      venda_id, produto_id, produto_nome, unidade_venda, unidades_por_item, quantidade, quantidade_unidades,
      preco_tabela, preco_unitario, custo_unitario
    ) values (
      v_venda.id, v_prod.id, v_prod.nome, coalesce(deusede.txt(it, 'unidade_venda'), 'unidade'), v_unid, v_qtd, v_qtd * v_unid,
      v_tabela, coalesce(deusede.num(it, 'preco_unitario'), v_tabela), v_custo
    ) returning * into v_item;

    insert into deusede.estoque_movimentos (produto_id, tipo, origem, quantidade_unidades, custo_unitario, venda_item_id, motivo)
    values (v_prod.id, 'saida', 'venda', -v_item.quantidade_unidades, v_custo, v_item.id,
            'Venda ' || deusede.formatar_numero('VEN', v_venda.numero));
    v_custo_total := v_custo_total + coalesce(v_custo, 0) * v_item.quantidade_unidades;
  end loop;

  update deusede.vendas set custo_total = round(v_custo_total, 2) where id = v_venda.id;
  return deusede.obter_venda(jsonb_build_object('id', v_venda.id));
exception when others then
  get stacked diagnostics v_restricao = constraint_name;
  raise exception '%', deusede.traduzir_erro(sqlstate, sqlerrm, v_restricao);
end $$;

-- Recupera saídas antigas omitidas pela versão anterior do RPC.
insert into deusede.estoque_movimentos (
  produto_id, tipo, origem, quantidade_unidades, custo_unitario, venda_item_id, motivo, data_movimento, created_at
)
select
  i.produto_id,
  'saida',
  'venda',
  -i.quantidade_unidades,
  i.custo_unitario,
  i.id,
  'Venda ' || deusede.formatar_numero('VEN', v.numero),
  deusede.data_brasil(v.created_at),
  v.created_at
from deusede.venda_itens i
join deusede.vendas v on v.id = i.venda_id
where not exists (
  select 1 from deusede.estoque_movimentos m
  where m.venda_item_id = i.id and m.origem = 'venda'
);

alter function deusede.registrar_venda(jsonb) set timezone to 'America/Sao_Paulo';
