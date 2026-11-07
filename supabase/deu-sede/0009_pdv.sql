-- =====================================================================
-- DEU SEDE! — Migração 0009: PDV (frente de caixa) integrado ao estoque
--
-- Cada venda dá baixa no estoque na hora (movimentação "venda"); não
-- vende mais do que o saldo. Cancelar uma venda exige motivo e devolve
-- as quantidades ao estoque ("estorno_venda"). Venda nunca é apagada.
-- Datas de venda no fuso de Brasília.
-- =====================================================================

-- Novo nível de acesso: vendedor (vende no PDV, consulta o resto).
alter table deusede.perfis drop constraint if exists perfis_papel_check;
alter table deusede.perfis add constraint perfis_papel_check
  check (papel in ('admin', 'comprador', 'conferente', 'vendedor', 'consulta'));

create or replace function deusede.pode_vender()
returns boolean language sql stable as $$
  select coalesce(deusede.papel_atual() in ('admin', 'comprador', 'vendedor'), false)
$$;

create or replace function deusede.data_brasil(t timestamptz)
returns date language sql stable as $$
  select (t at time zone 'America/Sao_Paulo')::date
$$;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

create sequence if not exists deusede.vendas_numero_seq;

create table if not exists deusede.vendas (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('deusede.vendas_numero_seq'),
  status text not null default 'concluida' check (status in ('concluida', 'cancelada')),
  forma_pagamento text not null check (forma_pagamento in ('dinheiro', 'pix', 'debito', 'credito', 'outro')),
  cliente text,
  subtotal numeric(14, 2) not null check (subtotal >= 0),
  desconto numeric(14, 2) not null default 0 check (desconto >= 0),
  total numeric(14, 2) not null check (total >= 0),
  valor_recebido numeric(14, 2),
  troco numeric(14, 2),
  custo_total numeric(14, 2),
  observacoes text,
  chave_idempotencia uuid not null unique default gen_random_uuid(),
  cancelada_em timestamptz,
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (desconto <= subtotal),
  check (status <> 'cancelada' or length(trim(coalesce(motivo_cancelamento, ''))) >= 5)
);
create index if not exists vendas_data_idx on deusede.vendas (created_at desc);

create table if not exists deusede.venda_itens (
  id uuid primary key default gen_random_uuid(),
  venda_id uuid not null references deusede.vendas (id) on delete restrict,
  produto_id uuid not null references deusede.produtos (id) on delete restrict,
  produto_nome text not null,
  unidade_venda text not null check (unidade_venda in ('unidade', 'embalagem')),
  -- unidades em cada item vendido (1 na venda por unidade)
  unidades_por_item integer not null check (unidades_por_item > 0),
  quantidade numeric(12, 3) not null check (quantidade > 0),
  quantidade_unidades numeric(14, 3) not null check (quantidade_unidades > 0),
  preco_tabela numeric(14, 2),
  preco_unitario numeric(14, 2) not null check (preco_unitario >= 0),
  subtotal numeric(14, 2) generated always as (round(quantidade * preco_unitario, 2)) stored,
  custo_unitario numeric(14, 4),
  created_at timestamptz not null default now()
);
create index if not exists venda_itens_venda_idx on deusede.venda_itens (venda_id);
create index if not exists venda_itens_produto_idx on deusede.venda_itens (produto_id);

drop trigger if exists venda_itens_imutavel on deusede.venda_itens;
create trigger venda_itens_imutavel before update or delete on deusede.venda_itens
  for each row execute function deusede.tg_somente_inclusao();

create or replace function deusede.tg_vendas_sem_exclusao()
returns trigger language plpgsql as $$
begin
  raise exception 'Vendas não podem ser excluídas. Cancele com justificativa.';
end $$;
drop trigger if exists vendas_sem_exclusao on deusede.vendas;
create trigger vendas_sem_exclusao before delete on deusede.vendas
  for each row execute function deusede.tg_vendas_sem_exclusao();

-- Estoque: vendas e estornos de venda
alter table deusede.estoque_movimentos
  add column if not exists venda_item_id uuid references deusede.venda_itens (id) on delete restrict;
alter table deusede.estoque_movimentos drop constraint if exists estoque_movimentos_origem_check;
alter table deusede.estoque_movimentos add constraint estoque_movimentos_origem_check check (origem in (
  'recebimento', 'nota', 'saida_manual', 'ajuste_contagem', 'estorno_recebimento', 'venda', 'estorno_venda'
));

-- ---------------------------------------------------------------------
-- Leitura
-- ---------------------------------------------------------------------

-- Produtos à venda: preço e saldo.
create or replace function deusede.pdv_produtos(p jsonb default '{}')
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'produto_id', pr.id, 'nome', pr.nome, 'codigo', pr.codigo, 'marca', pr.marca,
      'categoria_id', pr.categoria_id, 'categoria_nome', e.categoria_nome,
      'tipo_embalagem', pr.tipo_embalagem, 'unidades_por_embalagem', pr.unidades_por_embalagem,
      'preco_venda', pr.preco_venda, 'preco_venda_embalagem', pr.preco_venda_embalagem,
      'saldo_unidades', e.saldo_unidades
    ) order by lower(pr.nome)), '[]')
  from deusede.produtos pr
  join deusede.vw_estoque e on e.produto_id = pr.id
  where pr.ativo
$$;

create or replace function deusede.obter_venda(p jsonb)
returns jsonb language sql stable as $$
  select to_jsonb(v) || jsonb_build_object(
    'numero_formatado', deusede.formatar_numero('VEN', v.numero),
    'data', deusede.data_brasil(v.created_at),
    'itens', coalesce((select jsonb_agg(to_jsonb(i) order by i.created_at, lower(i.produto_nome))
                       from deusede.venda_itens i where i.venda_id = v.id), '[]'),
    'empresa', (select to_jsonb(e) from deusede.configuracoes_empresa e limit 1)
  )
  from deusede.vendas v where v.id = deusede.uid(p, 'id')
$$;

create or replace function deusede.listar_vendas(p jsonb default '{}')
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x order by x.created_at desc), '[]') from (
    select v.id, v.numero, deusede.formatar_numero('VEN', v.numero) as numero_formatado, v.status, v.forma_pagamento,
           v.cliente, v.total, v.desconto, v.troco, v.created_at, deusede.data_brasil(v.created_at) as data,
           v.motivo_cancelamento,
           (select count(*) from deusede.venda_itens i where i.venda_id = v.id) as qtd_itens
    from deusede.vendas v
    where deusede.data_brasil(v.created_at) between coalesce(deusede.txt(p, 'de')::date, deusede.data_brasil(now()))
                                               and coalesce(deusede.txt(p, 'ate')::date, deusede.data_brasil(now()))
    order by v.created_at desc
    limit 500
  ) x
$$;

-- Resumo do período (vendas canceladas ficam fora dos totais).
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
    'descontos', coalesce((select sum(desconto) from ok), 0),
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

-- ---------------------------------------------------------------------
-- Gravação
-- ---------------------------------------------------------------------

-- Finaliza a venda: confere saldo (com trava nos produtos), grava venda e
-- itens e dá baixa no estoque — tudo ou nada. Repetir com a mesma chave
-- devolve a mesma venda.
--   itens: [{ produto_id, unidade_venda: "unidade"|"embalagem", quantidade, preco_unitario? }]
--   preco_unitario vazio = preço de venda cadastrado.
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

  -- Saldo: trava cada produto e confere a soma pedida.
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

  -- Preços e subtotal
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

-- Cancela a venda (admin/comprador) e devolve as quantidades ao estoque.
create or replace function deusede.cancelar_venda(p jsonb)
returns jsonb language plpgsql security definer set search_path = deusede as $$
declare
  v_venda deusede.vendas;
  v_motivo text := deusede.txt(p, 'motivo');
begin
  if not deusede.pode_editar() then raise exception 'Só administrador ou comprador cancela vendas.'; end if;
  select * into v_venda from deusede.vendas where id = deusede.uid(p, 'id') for update;
  if not found then raise exception 'Venda não encontrada.'; end if;
  if v_venda.status = 'cancelada' then raise exception 'Esta venda já foi cancelada.'; end if;
  if length(trim(coalesce(v_motivo, ''))) < 5 then raise exception 'Informe o motivo do cancelamento.'; end if;

  update deusede.vendas set status = 'cancelada', cancelada_em = now(), motivo_cancelamento = v_motivo where id = v_venda.id;
  insert into deusede.estoque_movimentos (produto_id, tipo, origem, quantidade_unidades, custo_unitario, venda_item_id, motivo)
  select i.produto_id, 'entrada', 'estorno_venda', i.quantidade_unidades, i.custo_unitario, i.id,
         'Venda ' || deusede.formatar_numero('VEN', v_venda.numero) || ' cancelada: ' || v_motivo
  from deusede.venda_itens i where i.venda_id = v_venda.id;
  return deusede.obter_venda(jsonb_build_object('id', v_venda.id));
end $$;

-- Movimentações: mostra também a venda de origem.
create or replace function deusede.movimentos_estoque(p jsonb default '{}')
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x order by x.created_at desc, x.id desc), '[]') from (
    select * from (
      select m.*, pr.nome as produto_nome, pr.unidades_por_embalagem, pr.tipo_embalagem,
             sum(m.quantidade_unidades) over (partition by m.produto_id order by m.created_at, m.id) as saldo_apos,
             case when rc.id is not null then deusede.formatar_numero('REC', rc.numero) end as recebimento_numero,
             pd.id as pedido_id,
             case when pd.id is not null then deusede.formatar_numero('PED', pd.numero) end as pedido_numero,
             ne.id as nota_entrada_id,
             case when ne.id is not null then deusede.formatar_numero('ENT', ne.numero) end as nota_entrada_numero,
             vd.id as venda_id,
             case when vd.id is not null then deusede.formatar_numero('VEN', vd.numero) end as venda_numero,
             coalesce(pd.fornecedor_nome, ne.fornecedor_nome) as fornecedor_nome,
             coalesce(rc.nota_fiscal, ne.numero_nota) as nota_fiscal
      from deusede.estoque_movimentos m
      join deusede.produtos pr on pr.id = m.produto_id
      left join deusede.recebimento_itens ri on ri.id = m.recebimento_item_id
      left join deusede.recebimentos rc on rc.id = ri.recebimento_id
      left join deusede.pedidos pd on pd.id = rc.pedido_id
      left join deusede.notas_entrada_itens ni on ni.id = m.nota_item_id
      left join deusede.notas_entrada ne on ne.id = ni.nota_id
      left join deusede.venda_itens vi on vi.id = m.venda_item_id
      left join deusede.vendas vd on vd.id = vi.venda_id
      where deusede.uid(p, 'produto_id') is null or m.produto_id = deusede.uid(p, 'produto_id')
    ) t
    where (deusede.txt(p, 'de') is null or t.data_movimento >= deusede.txt(p, 'de')::date)
      and (deusede.txt(p, 'ate') is null or t.data_movimento <= deusede.txt(p, 'ate')::date)
    order by t.created_at desc, t.id desc
    limit coalesce(deusede.num(p, 'limite')::int, 300)
  ) x
$$;

-- ---------------------------------------------------------------------
-- Segurança
-- ---------------------------------------------------------------------
alter table deusede.vendas enable row level security;
alter table deusede.venda_itens enable row level security;
drop policy if exists vendas_select on deusede.vendas;
create policy vendas_select on deusede.vendas for select to authenticated using (deusede.pode_ler());
drop policy if exists venda_itens_select on deusede.venda_itens;
create policy venda_itens_select on deusede.venda_itens for select to authenticated using (deusede.pode_ler());
grant select on deusede.vendas, deusede.venda_itens to authenticated;
grant all on deusede.vendas, deusede.venda_itens to service_role;
grant usage, select on all sequences in schema deusede to authenticated, service_role;
revoke all on deusede.vendas, deusede.venda_itens from anon;
