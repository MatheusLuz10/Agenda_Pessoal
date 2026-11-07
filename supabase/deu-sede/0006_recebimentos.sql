-- =====================================================================
-- DEU SEDE! — Migração 0006: recebimentos (Etapa 6)
-- Conferência e histórico. Sem controle de estoque nesta versão.
--
-- Estas funções gravam auditoria (tabela eventos, que ninguém altera
-- diretamente), por isso rodam como "security definer" e conferem a
-- permissão do usuário logo no início.
-- =====================================================================

-- Registra uma entrega (parcial ou total) e atualiza o status do pedido:
--  * nada pendente            -> Recebido (concluído)
--  * pendente + "concluir"    -> Recebido, com justificativa na auditoria
--  * pendente                 -> Parcialmente recebido
create or replace function deusede.registrar_recebimento(p jsonb)
returns jsonb language plpgsql security definer set search_path = deusede as $$
declare
  v_ped deusede.pedidos;
  v_rec deusede.recebimentos;
  v_chave uuid := deusede.uid(p, 'chave_idempotencia');
  it jsonb;
  v_algum boolean := false;
  v_pendente numeric;
  v_restricao text;
begin
  if not deusede.pode_receber() then
    raise exception 'Seu usuário não tem permissão para registrar recebimentos.';
  end if;

  -- trava o pedido: dois recebimentos ao mesmo tempo não passam do pendente
  select * into v_ped from deusede.pedidos where id = deusede.uid(p, 'pedido_id') for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;

  -- reenvio do mesmo formulário
  if v_chave is not null and exists (select 1 from deusede.recebimentos where chave_idempotencia = v_chave) then
    return deusede.obter_pedido(jsonb_build_object('id', v_ped.id));
  end if;

  insert into deusede.recebimentos (pedido_id, data_recebimento, nota_fiscal, observacoes, chave_idempotencia)
  values (
    v_ped.id,
    coalesce(deusede.txt(p, 'data_recebimento')::date, current_date),
    deusede.txt(p, 'nota_fiscal'),
    deusede.txt(p, 'observacoes'),
    coalesce(v_chave, gen_random_uuid())
  ) returning * into v_rec;

  for it in select x from jsonb_array_elements(coalesce(p -> 'itens', '[]')) x loop
    if coalesce(deusede.num(it, 'quantidade_recebida'), 0) > 0
       or coalesce(deusede.num(it, 'quantidade_danificada'), 0) > 0
       or deusede.num(it, 'preco_cobrado') is not null
       or deusede.txt(it, 'observacoes') is not null then
      insert into deusede.recebimento_itens (
        recebimento_id, pedido_item_id, quantidade_recebida, quantidade_danificada, preco_cobrado, observacoes
      ) values (
        v_rec.id, deusede.uid(it, 'pedido_item_id'),
        coalesce(deusede.num(it, 'quantidade_recebida'), 0),
        coalesce(deusede.num(it, 'quantidade_danificada'), 0),
        deusede.num(it, 'preco_cobrado'),
        deusede.txt(it, 'observacoes')
      );
      v_algum := true;
    end if;
  end loop;

  if not v_algum then
    raise exception 'Informe a quantidade recebida de ao menos um produto.';
  end if;

  -- Preço da nota diferente do pedido, CONFIRMADO pelo usuário: vira o
  -- preço atual do fornecedor (o histórico guarda a mudança; o pedido
  -- continua com o preço negociado e a divergência fica registrada).
  if coalesce((p ->> 'atualizar_precos')::boolean, false) then
    insert into deusede.fornecedor_produtos as fp (
      fornecedor_id, produto_id, tipo_embalagem, unidades_por_embalagem, preco_atual, preco_origem
    )
    select v_ped.fornecedor_id, pi.produto_id, pi.tipo_embalagem, pi.unidades_por_embalagem, ri.preco_cobrado, 'nota'
    from deusede.recebimento_itens ri
    join deusede.pedido_itens pi on pi.id = ri.pedido_item_id
    where ri.recebimento_id = v_rec.id and ri.preco_cobrado is not null and ri.preco_cobrado <> pi.preco_embalagem
    on conflict (fornecedor_id, produto_id, tipo_embalagem, unidades_por_embalagem) do update
      set preco_atual = excluded.preco_atual, preco_origem = 'nota', ativo = true;
  end if;

  select coalesce(sum(quantidade_pendente), 0) into v_pendente
    from deusede.vw_pedido_itens_saldo where pedido_id = v_ped.id;

  if v_pendente = 0 then
    update deusede.pedidos set status = 'recebido' where id = v_ped.id;
  elsif coalesce((p ->> 'concluir')::boolean, false) then
    if length(trim(coalesce(deusede.txt(p, 'justificativa'), ''))) < 5 then
      raise exception 'Explique por que o pedido será concluído com itens pendentes.';
    end if;
    update deusede.pedidos set status = 'recebido' where id = v_ped.id;
    insert into deusede.eventos (entidade, entidade_id, acao, detalhe)
    values ('pedido', v_ped.id, 'concluido_com_pendencia', deusede.txt(p, 'justificativa'));
  elsif v_ped.status <> 'parcialmente_recebido' then
    update deusede.pedidos set status = 'parcialmente_recebido' where id = v_ped.id;
  end if;

  return deusede.obter_pedido(jsonb_build_object('id', v_ped.id));
exception when others then
  get stacked diagnostics v_restricao = constraint_name;
  raise exception '%', deusede.traduzir_erro(sqlstate, sqlerrm, v_restricao);
end $$;

-- Encerra um pedido parcialmente recebido quando o restante não virá.
create or replace function deusede.concluir_pedido(p jsonb)
returns jsonb language plpgsql security definer set search_path = deusede as $$
declare
  v_ped deusede.pedidos;
  v_restricao text;
begin
  if not deusede.pode_editar() then
    raise exception 'Seu usuário não tem permissão para concluir pedidos.';
  end if;
  select * into v_ped from deusede.pedidos where id = deusede.uid(p, 'id') for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_ped.status <> 'parcialmente_recebido' then
    raise exception 'Só pedidos parcialmente recebidos podem ser concluídos por aqui.';
  end if;
  if length(trim(coalesce(deusede.txt(p, 'justificativa'), ''))) < 5 then
    raise exception 'Explique por que o pedido será concluído com itens pendentes.';
  end if;
  update deusede.pedidos set status = 'recebido' where id = v_ped.id;
  insert into deusede.eventos (entidade, entidade_id, acao, detalhe)
  values ('pedido', v_ped.id, 'concluido_com_pendencia', deusede.txt(p, 'justificativa'));
  return deusede.obter_pedido(jsonb_build_object('id', v_ped.id));
exception when others then
  get stacked diagnostics v_restricao = constraint_name;
  raise exception '%', deusede.traduzir_erro(sqlstate, sqlerrm, v_restricao);
end $$;

-- Histórico de recebimentos com o resumo da conferência.
create or replace function deusede.listar_recebimentos(p jsonb default '{}')
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x order by x.data_recebimento desc, x.numero desc), '[]')
  from (
    select r.id, r.numero, deusede.formatar_numero('REC', r.numero) as numero_formatado,
           r.data_recebimento, r.nota_fiscal, r.observacoes, r.cancelado_em,
           pd.id as pedido_id, deusede.formatar_numero('PED', pd.numero) as pedido_numero,
           pd.fornecedor_nome, pd.status as pedido_status,
           coalesce(sum(ri.quantidade_recebida), 0) as total_recebido,
           coalesce(sum(ri.quantidade_danificada), 0) as total_danificado,
           count(ri.id) filter (where ri.preco_cobrado is not null and ri.preco_cobrado <> pi.preco_embalagem)
             as divergencias_preco
    from deusede.recebimentos r
    join deusede.pedidos pd on pd.id = r.pedido_id
    left join deusede.recebimento_itens ri on ri.recebimento_id = r.id
    left join deusede.pedido_itens pi on pi.id = ri.pedido_item_id
    where (deusede.uid(p, 'fornecedor_id') is null or pd.fornecedor_id = deusede.uid(p, 'fornecedor_id'))
      and (deusede.txt(p, 'de') is null or r.data_recebimento >= deusede.txt(p, 'de')::date)
      and (deusede.txt(p, 'ate') is null or r.data_recebimento <= deusede.txt(p, 'ate')::date)
    group by r.id, pd.id
    order by r.data_recebimento desc, r.numero desc
    limit 300
  ) x
$$;
