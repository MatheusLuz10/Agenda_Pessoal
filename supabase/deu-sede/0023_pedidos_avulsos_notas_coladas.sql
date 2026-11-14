-- DEU SEDE! — Migração 0023: pedidos avulsos das notas coladas
-- Notas registradas pelo copiar/colar geram um pedido concluído ligado à
-- própria nota. A entrada de estoque continua sendo feita uma única vez,
-- pela rotina existente de notas; o pedido serve para histórico e relatórios.

alter table deusede.pedidos
  alter column fornecedor_id drop not null,
  add column if not exists nota_entrada_id uuid references deusede.notas_entrada(id) on delete restrict;

create unique index if not exists pedidos_nota_entrada_id_uidx
  on deusede.pedidos(nota_entrada_id) where nota_entrada_id is not null;

-- Itens do pedido avulso já estão no estoque pela nota. Reflete-os como
-- recebidos nos totais do pedido sem criar recebimento ou novo movimento.
create or replace view deusede.vw_pedido_itens_saldo with (security_invoker = true) as
select
  pi.*,
  case when p.nota_entrada_id is not null then pi.quantidade_embalagens else coalesce(r.recebido, 0) end as quantidade_recebida,
  case when p.nota_entrada_id is not null then 0::numeric else coalesce(r.danificado, 0) end as quantidade_danificada,
  case when p.nota_entrada_id is not null then pi.quantidade_embalagens else coalesce(r.recebido, 0) end as quantidade_aceita,
  case when p.nota_entrada_id is not null then 0::numeric
       else greatest(pi.quantidade_embalagens - (coalesce(r.recebido, 0) - coalesce(r.danificado, 0)), 0) end as quantidade_pendente,
  case when p.nota_entrada_id is not null then pi.subtotal
       else round(pi.subtotal * (coalesce(r.recebido, 0) - coalesce(r.danificado, 0)) / pi.quantidade_embalagens, 2) end as valor_recebido,
  r.maior_preco_cobrado
from deusede.pedido_itens pi
join deusede.pedidos p on p.id = pi.pedido_id
left join lateral (
  select sum(ri.quantidade_recebida) as recebido,
         sum(ri.quantidade_danificada) as danificado,
         max(ri.preco_cobrado) as maior_preco_cobrado
    from deusede.recebimento_itens ri
    join deusede.recebimentos rc on rc.id = ri.recebimento_id and rc.cancelado_em is null
   where ri.pedido_item_id = pi.id
) r on true;

-- vw_pedidos (0001) usa p.*: com a coluna nova em pedidos, ela precisa ser
-- recriada para incluir nota_entrada_id. Sem isso, rodar as migrações de
-- novo (o modo de teste local faz isso a cada atualização) falha no
-- "create or replace view" da 0001 ("cannot change name of view column").
-- Nenhuma view depende dela; a única função presa a ela é pedidos_comprados
-- (devolve linhas da view), que sai antes e volta igual logo abaixo.
drop function if exists deusede.pedidos_comprados(jsonb);
drop view if exists deusede.vw_pedidos;
create view deusede.vw_pedidos with (security_invoker = true) as
select
  p.*,
  deusede.formatar_numero('PED', p.numero) as numero_formatado,
  deusede.pedido_conta_como_compra(p.status) as compra_realizada,
  coalesce(t.qtd_itens, 0) as qtd_itens,
  coalesce(t.valor_bruto, 0) as valor_bruto,
  coalesce(t.desconto_itens, 0) + p.desconto_geral as total_descontos,
  coalesce(t.valor_bruto, 0) - coalesce(t.desconto_itens, 0) - p.desconto_geral + p.frete as valor_total,
  coalesce(t.valor_recebido, 0) as valor_recebido_itens,
  coalesce(t.qtd_pendente, 0) as quantidade_pendente
from deusede.pedidos p
left join lateral (
  select count(*) as qtd_itens,
         sum(round(s.quantidade_embalagens * s.preco_embalagem, 2)) as valor_bruto,
         sum(s.desconto_valor) as desconto_itens,
         sum(s.valor_recebido) as valor_recebido,
         sum(s.quantidade_pendente) as qtd_pendente
    from deusede.vw_pedido_itens_saldo s
   where s.pedido_id = p.id
) t on true;
-- mesmas permissões da 0001 (o drop apaga as permissões da view)
grant select, insert, update, delete on deusede.vw_pedidos to authenticated;
grant all on deusede.vw_pedidos to service_role;
revoke all on deusede.vw_pedidos from anon;

-- Pedidos (compras realizadas) do período, com os mesmos filtros (igual à 0007).
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

create or replace function deusede.tg_pedidos_regras()
returns trigger language plpgsql security definer set search_path = deusede
set timezone to 'America/Sao_Paulo' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Pedidos não podem ser excluídos. Use o cancelamento com justificativa.';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'em_elaboracao' then
      raise exception 'Um pedido novo começa em elaboração.';
    end if;
    insert into deusede.eventos (entidade, entidade_id, acao, status_novo)
    values ('pedido', new.id, 'criado', new.status);
    return new;
  end if;

  if old.status in ('recebido', 'cancelado') then
    raise exception 'Pedido % está % e não pode mais ser alterado.', deusede.formatar_numero('PED', old.numero), old.status;
  end if;

  if (new.numero, new.lote_id, new.fornecedor_id, new.nota_entrada_id, new.created_at, new.created_by)
     is distinct from (old.numero, old.lote_id, old.fornecedor_id, old.nota_entrada_id, old.created_at, old.created_by) then
    raise exception 'Número, lote, fornecedor, nota de origem e criação do pedido não podem ser alterados.';
  end if;

  if not deusede.pedido_editavel(old.status) and (
    new.data_pedido, new.condicao_pagamento, new.frete, new.desconto_geral, new.fornecedor_nome, new.fornecedor_whatsapp
  ) is distinct from (
    old.data_pedido, old.condicao_pagamento, old.frete, old.desconto_geral, old.fornecedor_nome, old.fornecedor_whatsapp
  ) then
    raise exception 'Pedido % já aprovado: valores e condições não podem mais ser alterados.', deusede.formatar_numero('PED', old.numero);
  end if;

  if new.status <> old.status then
    if not (old.status = 'em_elaboracao' and new.status = 'recebido' and old.nota_entrada_id is not null)
       and not deusede.pedido_transicao_valida(old.status, new.status) then
      raise exception 'Mudança de status do pedido não permitida: % → %.', old.status, new.status;
    end if;
    if new.status in ('aguardando_aprovacao', 'aprovado', 'recebido')
       and not exists (select 1 from deusede.pedido_itens where pedido_id = new.id) then
      raise exception 'O pedido precisa ter ao menos um item.';
    end if;
    if new.status = 'cancelado' and length(trim(coalesce(new.motivo_cancelamento, ''))) < 5 then
      raise exception 'Informe o motivo do cancelamento.';
    end if;
    if new.status in ('parcialmente_recebido', 'recebido') and new.nota_entrada_id is null and not exists (
      select 1 from deusede.recebimentos where pedido_id = new.id and cancelado_em is null
    ) then
      raise exception 'Registre o recebimento antes de marcar o pedido como recebido.';
    end if;
    if new.status = 'enviado' then new.enviado_em := coalesce(new.enviado_em, now()); end if;
    if new.status = 'recebido' then new.concluido_em := now(); end if;
    if new.status = 'cancelado' then new.cancelado_em := now(); end if;
    insert into deusede.eventos (entidade, entidade_id, acao, status_anterior, status_novo, detalhe)
    values ('pedido', new.id, 'status_alterado', old.status, new.status,
            case when new.nota_entrada_id is not null then 'Pedido avulso criado a partir de nota colada.'
                 when new.status = 'cancelado' then new.motivo_cancelamento end);
  end if;
  return new;
end $$;

-- Uso interno da gravação da nota e da carga inicial, não exposto como RPC.
create or replace function deusede.criar_pedido_avulso_nota(p_nota_id uuid)
returns jsonb language plpgsql security definer set search_path = deusede
set timezone to 'America/Sao_Paulo' as $$
declare
  n deusede.notas_entrada;
  ped deusede.pedidos;
  i record;
begin
  select * into n from deusede.notas_entrada where id = p_nota_id for update;
  if not found or nullif(btrim(n.lista_colada), '') is null then return null; end if;
  select * into ped from deusede.pedidos where nota_entrada_id = n.id;
  if found then
    return jsonb_build_object('id', ped.id, 'numero_formatado', deusede.formatar_numero('PED', ped.numero));
  end if;

  insert into deusede.pedidos (
    lote_id, fornecedor_id, nota_entrada_id, status, data_pedido, fornecedor_nome, observacoes
  ) values (
    gen_random_uuid(), n.fornecedor_id, n.id, 'em_elaboracao', n.data_entrada,
    coalesce(nullif(btrim(n.fornecedor_nome), ''), 'Pedido avulso'),
    concat('Pedido avulso da nota ', deusede.formatar_numero('ENT', n.numero),
           case when nullif(btrim(n.numero_nota), '') is not null then ' (NF ' || btrim(n.numero_nota) || ')' else '' end)
  ) returning * into ped;

  for i in
    select * from deusede.notas_entrada_itens where nota_id = n.id order by id
  loop
    insert into deusede.pedido_itens (
      pedido_id, produto_id, produto_nome, tipo_embalagem, unidades_por_embalagem,
      quantidade_embalagens, preco_embalagem, observacoes
    ) values (
      ped.id, i.produto_id, i.produto_nome, i.tipo_embalagem, i.unidades_por_embalagem,
      i.quantidade_embalagens, coalesce(i.preco_embalagem, 0), 'Importado da nota colada'
    );
  end loop;

  update deusede.pedidos set status = 'recebido' where id = ped.id;
  select * into ped from deusede.pedidos where id = ped.id;
  return jsonb_build_object('id', ped.id, 'numero_formatado', deusede.formatar_numero('PED', ped.numero));
end $$;
revoke all on function deusede.criar_pedido_avulso_nota(uuid) from public, anon, authenticated;

-- Atualiza a função da nota guardada (0019), mantendo gravação idempotente,
-- movimentação de estoque e atualização opcional dos preços do fornecedor.
create or replace function deusede.registrar_entrada_nota(p jsonb)
returns jsonb language plpgsql security definer set search_path = deusede
set timezone to 'America/Sao_Paulo' as $$
declare
  v_chave uuid := deusede.uid(p, 'chave_idempotencia');
  v_forn deusede.fornecedores;
  v_nota deusede.notas_entrada;
  v_item deusede.notas_entrada_itens;
  v_prod deusede.produtos;
  v_pedido jsonb;
  it jsonb;
  v_qtd numeric;
  v_unid int;
  v_restricao text;
begin
  if not deusede.pode_receber() then raise exception 'Seu usuário não tem permissão para dar entrada no estoque.'; end if;
  if v_chave is not null then
    select * into v_nota from deusede.notas_entrada where chave_idempotencia = v_chave;
    if found then
      if deusede.txt(p, 'rascunho') is not null then
        delete from deusede.rascunhos where usuario_id = auth.uid() and chave = deusede.txt(p, 'rascunho');
      end if;
      v_pedido := deusede.criar_pedido_avulso_nota(v_nota.id);
      return deusede.obter_entrada_nota(jsonb_build_object('id', v_nota.id))
        || jsonb_build_object('pedido_avulso', v_pedido);
    end if;
  end if;
  if jsonb_typeof(p -> 'itens') is distinct from 'array' or jsonb_array_length(p -> 'itens') = 0 then raise exception 'Adicione ao menos um produto.'; end if;
  if deusede.uid(p, 'fornecedor_id') is not null then
    select * into v_forn from deusede.fornecedores where id = deusede.uid(p, 'fornecedor_id');
    if not found then raise exception 'Fornecedor não encontrado.'; end if;
  end if;

  insert into deusede.notas_entrada (fornecedor_id, fornecedor_nome, numero_nota, data_entrada, observacoes, chave_idempotencia, lista_colada)
  values (v_forn.id, v_forn.nome, deusede.txt(p, 'numero_nota'), coalesce(deusede.txt(p, 'data_entrada')::date, current_date),
          deusede.txt(p, 'observacoes'), coalesce(v_chave, gen_random_uuid()), left(deusede.txt(p, 'lista_colada'), 100000))
  returning * into v_nota;

  for it in select x from jsonb_array_elements(p -> 'itens') x loop
    select * into v_prod from deusede.produtos where id = deusede.uid(it, 'produto_id');
    if not found then raise exception 'Produto não encontrado.'; end if;
    v_qtd := deusede.num(it, 'quantidade_embalagens');
    if v_qtd is null or v_qtd <= 0 then raise exception 'Informe a quantidade de "%".', v_prod.nome; end if;
    v_unid := coalesce(deusede.num(it, 'unidades_por_embalagem')::int, v_prod.unidades_por_embalagem);
    insert into deusede.notas_entrada_itens (nota_id, produto_id, produto_nome, tipo_embalagem, unidades_por_embalagem, quantidade_embalagens, preco_embalagem)
    values (v_nota.id, v_prod.id, v_prod.nome, coalesce(deusede.txt(it, 'tipo_embalagem'), v_prod.tipo_embalagem), v_unid, v_qtd, deusede.num(it, 'preco_embalagem'))
    returning * into v_item;
    insert into deusede.estoque_movimentos (produto_id, tipo, origem, quantidade_unidades, custo_unitario, nota_item_id, data_movimento)
    values (v_prod.id, 'entrada', 'nota', v_qtd * v_unid,
            case when v_item.preco_embalagem is null then null else round(v_item.preco_embalagem / v_unid, 4) end,
            v_item.id, v_nota.data_entrada);
    if v_forn.id is not null and v_item.preco_embalagem is not null and coalesce((p ->> 'atualizar_precos')::boolean, false) then
      insert into deusede.fornecedor_produtos as fp (fornecedor_id, produto_id, tipo_embalagem, unidades_por_embalagem, preco_atual, preco_origem)
      values (v_forn.id, v_prod.id, v_item.tipo_embalagem, v_unid, v_item.preco_embalagem, 'nota')
      on conflict (fornecedor_id, produto_id, tipo_embalagem, unidades_por_embalagem) do update
        set preco_atual = excluded.preco_atual, preco_origem = 'nota', ativo = true;
    end if;
  end loop;

  if deusede.txt(p, 'rascunho') is not null then
    delete from deusede.rascunhos where usuario_id = auth.uid() and chave = deusede.txt(p, 'rascunho');
  end if;
  v_pedido := deusede.criar_pedido_avulso_nota(v_nota.id);
  return deusede.obter_entrada_nota(jsonb_build_object('id', v_nota.id))
    || jsonb_build_object('pedido_avulso', v_pedido);
exception when others then
  get stacked diagnostics v_restricao = constraint_name;
  raise exception '%', deusede.traduzir_erro(sqlstate, sqlerrm, v_restricao);
end $$;

-- Notas coladas já existentes também entram no histórico uma única vez.
do $$
declare n record;
begin
  for n in select id from deusede.notas_entrada where nullif(btrim(lista_colada), '') is not null loop
    perform deusede.criar_pedido_avulso_nota(n.id);
  end loop;
end $$;
