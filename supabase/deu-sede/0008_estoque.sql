-- =====================================================================
-- DEU SEDE! — Migração 0008: estoque
--
-- O saldo de cada produto é a soma das movimentações (em UNIDADES).
-- Movimentações nunca são alteradas nem apagadas: correção = nova
-- movimentação (ajuste de contagem ou estorno).
--
-- Entradas:
--   * recebimento de pedido -> automática (quantidade aceita)
--   * entrada por nota (sem pedido) -> registrar_entrada_nota
-- Saídas e ajustes: registrar_movimento_estoque.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------

create sequence if not exists deusede.notas_entrada_numero_seq;

-- Nota recebida sem pedido (ex.: compra no balcão, entrega avulsa).
create table if not exists deusede.notas_entrada (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('deusede.notas_entrada_numero_seq'),
  fornecedor_id uuid references deusede.fornecedores (id) on delete restrict,
  fornecedor_nome text,
  numero_nota text,
  data_entrada date not null default current_date,
  observacoes text,
  chave_idempotencia uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);

create table if not exists deusede.notas_entrada_itens (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references deusede.notas_entrada (id) on delete restrict,
  produto_id uuid not null references deusede.produtos (id) on delete restrict,
  produto_nome text not null,
  tipo_embalagem text not null check (deusede.embalagem_valida(tipo_embalagem)),
  unidades_por_embalagem integer not null check (unidades_por_embalagem > 0),
  quantidade_embalagens numeric(12, 3) not null check (quantidade_embalagens > 0),
  preco_embalagem numeric(14, 2) check (preco_embalagem >= 0),
  subtotal numeric(14, 2) generated always as (round(quantidade_embalagens * coalesce(preco_embalagem, 0), 2)) stored,
  created_at timestamptz not null default now()
);
create index if not exists notas_entrada_itens_nota_idx on deusede.notas_entrada_itens (nota_id);

create table if not exists deusede.estoque_movimentos (
  id bigint generated always as identity primary key,
  produto_id uuid not null references deusede.produtos (id) on delete restrict,
  tipo text not null check (tipo in ('entrada', 'saida', 'ajuste')),
  origem text not null check (origem in ('recebimento', 'nota', 'saida_manual', 'ajuste_contagem', 'estorno_recebimento')),
  -- positivo entra, negativo sai (sempre em unidades)
  quantidade_unidades numeric(14, 3) not null check (quantidade_unidades <> 0),
  -- custo por unidade (nas entradas)
  custo_unitario numeric(14, 4) check (custo_unitario >= 0),
  recebimento_item_id uuid references deusede.recebimento_itens (id) on delete restrict,
  nota_item_id uuid references deusede.notas_entrada_itens (id) on delete restrict,
  motivo text,
  data_movimento date not null default current_date,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists estoque_movimentos_produto_idx on deusede.estoque_movimentos (produto_id, created_at, id);

-- Somente inclusão
do $$
declare t text;
begin
  foreach t in array array['notas_entrada', 'notas_entrada_itens', 'estoque_movimentos'] loop
    execute format('drop trigger if exists %I on deusede.%I', t || '_imutavel', t);
    execute format(
      'create trigger %I before update or delete on deusede.%I for each row execute function deusede.tg_somente_inclusao()',
      t || '_imutavel', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Entradas e estornos automáticos do recebimento de pedidos
-- ---------------------------------------------------------------------

create or replace function deusede.tg_recebimento_entra_estoque()
returns trigger language plpgsql security definer set search_path = deusede as $$
declare
  v_item deusede.pedido_itens;
  v_data date;
  v_aceito numeric := new.quantidade_recebida - new.quantidade_danificada;
begin
  if v_aceito > 0 then
    select * into v_item from deusede.pedido_itens where id = new.pedido_item_id;
    select data_recebimento into v_data from deusede.recebimentos where id = new.recebimento_id;
    insert into deusede.estoque_movimentos (
      produto_id, tipo, origem, quantidade_unidades, custo_unitario, recebimento_item_id, data_movimento
    ) values (
      v_item.produto_id, 'entrada', 'recebimento', v_aceito * v_item.unidades_por_embalagem,
      round(coalesce(new.preco_cobrado, v_item.preco_embalagem) / v_item.unidades_por_embalagem, 4),
      new.id, coalesce(v_data, current_date)
    );
  end if;
  return new;
end $$;

drop trigger if exists recebimento_itens_estoque on deusede.recebimento_itens;
create trigger recebimento_itens_estoque
  after insert on deusede.recebimento_itens
  for each row execute function deusede.tg_recebimento_entra_estoque();

-- Recebimento cancelado: devolve (estorna) o que tinha entrado.
create or replace function deusede.tg_recebimento_estorna_estoque()
returns trigger language plpgsql security definer set search_path = deusede as $$
begin
  if old.cancelado_em is null and new.cancelado_em is not null then
    insert into deusede.estoque_movimentos (produto_id, tipo, origem, quantidade_unidades, recebimento_item_id, motivo)
    select m.produto_id, 'saida', 'estorno_recebimento', -m.quantidade_unidades, m.recebimento_item_id,
           'Recebimento ' || deusede.formatar_numero('REC', new.numero) || ' cancelado: ' || coalesce(new.motivo_cancelamento, '')
    from deusede.estoque_movimentos m
    join deusede.recebimento_itens ri on ri.id = m.recebimento_item_id
    where ri.recebimento_id = new.id and m.origem = 'recebimento';
  end if;
  return new;
end $$;

drop trigger if exists recebimentos_estoque on deusede.recebimentos;
create trigger recebimentos_estoque
  after update of cancelado_em on deusede.recebimentos
  for each row execute function deusede.tg_recebimento_estorna_estoque();

-- ---------------------------------------------------------------------
-- Saldo
-- ---------------------------------------------------------------------

create or replace view deusede.vw_estoque with (security_invoker = true) as
select
  p.id as produto_id,
  p.nome as produto_nome,
  p.codigo,
  p.categoria_id,
  c.nome as categoria_nome,
  p.tipo_embalagem,
  p.unidades_por_embalagem,
  p.estoque_minimo,
  p.ativo,
  coalesce(s.saldo, 0) as saldo_unidades,
  round(coalesce(s.saldo, 0) / p.unidades_por_embalagem, 3) as saldo_embalagens,
  s.ultima_entrada,
  s.ultima_movimentacao,
  u.custo_unitario as ultimo_custo_unitario,
  round(greatest(coalesce(s.saldo, 0), 0) * coalesce(u.custo_unitario, 0), 2) as valor_estimado,
  (p.estoque_minimo is not null and coalesce(s.saldo, 0) < p.estoque_minimo * p.unidades_por_embalagem) as abaixo_minimo
from deusede.produtos p
join deusede.categorias c on c.id = p.categoria_id
left join lateral (
  select sum(m.quantidade_unidades) as saldo,
         max(m.data_movimento) filter (where m.tipo = 'entrada') as ultima_entrada,
         max(m.created_at) as ultima_movimentacao
  from deusede.estoque_movimentos m where m.produto_id = p.id
) s on true
left join lateral (
  select m.custo_unitario from deusede.estoque_movimentos m
  where m.produto_id = p.id and m.tipo = 'entrada' and m.custo_unitario is not null
  order by m.created_at desc, m.id desc limit 1
) u on true;

-- ---------------------------------------------------------------------
-- Leitura
-- ---------------------------------------------------------------------

create or replace function deusede.estoque(p jsonb default '{}')
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(e) order by lower(e.produto_nome)), '[]')
  from deusede.vw_estoque e
  where (deusede.uid(p, 'produto_id') is null or e.produto_id = deusede.uid(p, 'produto_id'))
    and (deusede.uid(p, 'categoria_id') is null or e.categoria_id = deusede.uid(p, 'categoria_id'))
    and (coalesce((p ->> 'abaixo_minimo')::boolean, false) = false or e.abaixo_minimo)
$$;

create or replace function deusede.resumo_estoque(p jsonb default '{}')
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'valor_estimado', coalesce(sum(valor_estimado), 0),
    'produtos_com_saldo', count(*) filter (where saldo_unidades > 0),
    'abaixo_minimo', count(*) filter (where abaixo_minimo and ativo),
    'lista_abaixo_minimo', coalesce(jsonb_agg(jsonb_build_object(
        'produto_id', produto_id, 'produto_nome', produto_nome, 'saldo_embalagens', saldo_embalagens,
        'estoque_minimo', estoque_minimo, 'tipo_embalagem', tipo_embalagem, 'unidades_por_embalagem', unidades_por_embalagem
      ) order by saldo_embalagens / nullif(estoque_minimo, 0)) filter (where abaixo_minimo and ativo), '[]')
  )
  from deusede.vw_estoque
$$;

-- Movimentações com o saldo depois de cada uma (mais recentes primeiro).
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
             coalesce(pd.fornecedor_nome, ne.fornecedor_nome) as fornecedor_nome,
             coalesce(rc.nota_fiscal, ne.numero_nota) as nota_fiscal
      from deusede.estoque_movimentos m
      join deusede.produtos pr on pr.id = m.produto_id
      left join deusede.recebimento_itens ri on ri.id = m.recebimento_item_id
      left join deusede.recebimentos rc on rc.id = ri.recebimento_id
      left join deusede.pedidos pd on pd.id = rc.pedido_id
      left join deusede.notas_entrada_itens ni on ni.id = m.nota_item_id
      left join deusede.notas_entrada ne on ne.id = ni.nota_id
      where deusede.uid(p, 'produto_id') is null or m.produto_id = deusede.uid(p, 'produto_id')
    ) t
    where (deusede.txt(p, 'de') is null or t.data_movimento >= deusede.txt(p, 'de')::date)
      and (deusede.txt(p, 'ate') is null or t.data_movimento <= deusede.txt(p, 'ate')::date)
    order by t.created_at desc, t.id desc
    limit coalesce(deusede.num(p, 'limite')::int, 300)
  ) x
$$;

create or replace function deusede.obter_entrada_nota(p jsonb)
returns jsonb language sql stable as $$
  select to_jsonb(n) || jsonb_build_object(
    'numero_formatado', deusede.formatar_numero('ENT', n.numero),
    'itens', coalesce((select jsonb_agg(to_jsonb(i) order by lower(i.produto_nome)) from deusede.notas_entrada_itens i where i.nota_id = n.id), '[]'),
    'total', coalesce((select sum(subtotal) from deusede.notas_entrada_itens i where i.nota_id = n.id), 0)
  )
  from deusede.notas_entrada n where n.id = deusede.uid(p, 'id')
$$;

create or replace function deusede.listar_entradas_nota(p jsonb default '{}')
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x order by x.data_entrada desc, x.numero desc), '[]') from (
    select n.id, n.numero, deusede.formatar_numero('ENT', n.numero) as numero_formatado, n.data_entrada, n.numero_nota,
           n.fornecedor_id, n.fornecedor_nome, n.observacoes,
           (select count(*) from deusede.notas_entrada_itens i where i.nota_id = n.id) as qtd_itens,
           coalesce((select sum(subtotal) from deusede.notas_entrada_itens i where i.nota_id = n.id), 0) as total
    from deusede.notas_entrada n
    order by n.data_entrada desc, n.numero desc
    limit 200
  ) x
$$;

-- ---------------------------------------------------------------------
-- Gravação
-- ---------------------------------------------------------------------

-- Entrada de mercadoria por nota (sem pedido), tudo numa transação.
-- Com fornecedor + atualizar_precos, os preços da nota viram o preço
-- atual do fornecedor (histórico registra; origem "nota").
create or replace function deusede.registrar_entrada_nota(p jsonb)
returns jsonb language plpgsql security definer set search_path = deusede as $$
declare
  v_chave uuid := deusede.uid(p, 'chave_idempotencia');
  v_forn deusede.fornecedores;
  v_nota deusede.notas_entrada;
  v_item deusede.notas_entrada_itens;
  v_prod deusede.produtos;
  it jsonb;
  v_qtd numeric;
  v_unid int;
  v_restricao text;
begin
  if not deusede.pode_receber() then
    raise exception 'Seu usuário não tem permissão para dar entrada no estoque.';
  end if;
  if v_chave is not null then
    select * into v_nota from deusede.notas_entrada where chave_idempotencia = v_chave;
    if found then return deusede.obter_entrada_nota(jsonb_build_object('id', v_nota.id)); end if;
  end if;
  if jsonb_typeof(p -> 'itens') is distinct from 'array' or jsonb_array_length(p -> 'itens') = 0 then
    raise exception 'Adicione ao menos um produto.';
  end if;
  if deusede.uid(p, 'fornecedor_id') is not null then
    select * into v_forn from deusede.fornecedores where id = deusede.uid(p, 'fornecedor_id');
    if not found then raise exception 'Fornecedor não encontrado.'; end if;
  end if;

  insert into deusede.notas_entrada (fornecedor_id, fornecedor_nome, numero_nota, data_entrada, observacoes, chave_idempotencia)
  values (v_forn.id, v_forn.nome, deusede.txt(p, 'numero_nota'), coalesce(deusede.txt(p, 'data_entrada')::date, current_date),
          deusede.txt(p, 'observacoes'), coalesce(v_chave, gen_random_uuid()))
  returning * into v_nota;

  for it in select x from jsonb_array_elements(p -> 'itens') x loop
    select * into v_prod from deusede.produtos where id = deusede.uid(it, 'produto_id');
    if not found then raise exception 'Produto não encontrado.'; end if;
    v_qtd := deusede.num(it, 'quantidade_embalagens');
    if v_qtd is null or v_qtd <= 0 then raise exception 'Informe a quantidade de "%".', v_prod.nome; end if;
    v_unid := coalesce(deusede.num(it, 'unidades_por_embalagem')::int, v_prod.unidades_por_embalagem);

    insert into deusede.notas_entrada_itens (
      nota_id, produto_id, produto_nome, tipo_embalagem, unidades_por_embalagem, quantidade_embalagens, preco_embalagem
    ) values (
      v_nota.id, v_prod.id, v_prod.nome, coalesce(deusede.txt(it, 'tipo_embalagem'), v_prod.tipo_embalagem), v_unid,
      v_qtd, deusede.num(it, 'preco_embalagem')
    ) returning * into v_item;

    insert into deusede.estoque_movimentos (
      produto_id, tipo, origem, quantidade_unidades, custo_unitario, nota_item_id, data_movimento
    ) values (
      v_prod.id, 'entrada', 'nota', v_qtd * v_unid,
      case when v_item.preco_embalagem is null then null else round(v_item.preco_embalagem / v_unid, 4) end,
      v_item.id, v_nota.data_entrada
    );

    if v_forn.id is not null and v_item.preco_embalagem is not null and coalesce((p ->> 'atualizar_precos')::boolean, false) then
      insert into deusede.fornecedor_produtos as fp (
        fornecedor_id, produto_id, tipo_embalagem, unidades_por_embalagem, preco_atual, preco_origem
      ) values (v_forn.id, v_prod.id, v_item.tipo_embalagem, v_unid, v_item.preco_embalagem, 'nota')
      on conflict (fornecedor_id, produto_id, tipo_embalagem, unidades_por_embalagem) do update
        set preco_atual = excluded.preco_atual, preco_origem = 'nota', ativo = true;
    end if;
  end loop;

  return deusede.obter_entrada_nota(jsonb_build_object('id', v_nota.id));
exception when others then
  get stacked diagnostics v_restricao = constraint_name;
  raise exception '%', deusede.traduzir_erro(sqlstate, sqlerrm, v_restricao);
end $$;

-- Saída manual (venda, consumo, perda) ou ajuste pela contagem física.
--   saida:  quantidade (+ unidade: "embalagem" ou "unidade") e motivo
--   ajuste: contagem (em unidades) — gera a diferença para o saldo atual
create or replace function deusede.registrar_movimento_estoque(p jsonb)
returns jsonb language plpgsql security definer set search_path = deusede as $$
declare
  v_prod deusede.produtos;
  v_saldo numeric;
  v_tipo text := deusede.txt(p, 'tipo');
  v_qtd numeric;
  v_motivo text := deusede.txt(p, 'motivo');
begin
  if not deusede.pode_receber() then
    raise exception 'Seu usuário não tem permissão para movimentar o estoque.';
  end if;
  select * into v_prod from deusede.produtos where id = deusede.uid(p, 'produto_id') for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  select coalesce(sum(quantidade_unidades), 0) into v_saldo from deusede.estoque_movimentos where produto_id = v_prod.id;

  if v_tipo = 'saida' then
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

-- ---------------------------------------------------------------------
-- Segurança: leitura para quem tem perfil; gravação só pelas funções
-- acima (security definer) e pelos gatilhos.
-- ---------------------------------------------------------------------

alter table deusede.notas_entrada enable row level security;
alter table deusede.notas_entrada_itens enable row level security;
alter table deusede.estoque_movimentos enable row level security;

do $$
declare t text;
begin
  foreach t in array array['notas_entrada', 'notas_entrada_itens', 'estoque_movimentos'] loop
    execute format('drop policy if exists %I on deusede.%I', t || '_select', t);
    execute format('create policy %I on deusede.%I for select to authenticated using (deusede.pode_ler())', t || '_select', t);
  end loop;
end $$;

grant select on deusede.notas_entrada, deusede.notas_entrada_itens, deusede.estoque_movimentos to authenticated;
grant all on deusede.notas_entrada, deusede.notas_entrada_itens, deusede.estoque_movimentos to service_role;
grant usage, select on all sequences in schema deusede to authenticated, service_role;
revoke all on deusede.notas_entrada, deusede.notas_entrada_itens, deusede.estoque_movimentos from anon;
