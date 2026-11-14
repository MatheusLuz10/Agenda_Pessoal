-- =====================================================================
-- DEU SEDE! — Gestão de Compras
-- Migração 0025: "Compra avulsa" vira uma OPÇÃO de cada nota lançada.
--
-- Antes (0023): toda nota registrada pelo colar lista virava sozinha um
-- pedido avulso recebido, e o valor da nota entrava no "Total comprado".
--
-- Agora: nenhuma nota entra sozinha no Total comprado. Em Estoque →
-- Entradas por nota, cada nota tem a opção "Compra avulsa":
--   ligada    -> a nota vira um pedido avulso recebido (itens e preços da
--                nota) e conta no Total comprado (painel, relatórios e
--                fornecedor);
--   desligada -> o pedido avulso sai (só ele; a nota fica como está).
-- O estoque não muda em nenhum dos casos: a nota já deu a entrada.
--
-- Como aplicar: SQL Editor -> colar este arquivo inteiro -> Run.
-- Pode rodar de novo sem problema (idempotente).
-- =====================================================================

-- ---------- Registrar a nota: não cria mais o pedido avulso sozinho
create or replace function deusede.registrar_entrada_nota(p jsonb)
returns jsonb language plpgsql security definer set search_path = deusede
set timezone to 'America/Sao_Paulo' as $$
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
  if not deusede.pode_receber() then raise exception 'Seu usuário não tem permissão para dar entrada no estoque.'; end if;
  if v_chave is not null then
    select * into v_nota from deusede.notas_entrada where chave_idempotencia = v_chave;
    if found then
      if deusede.txt(p, 'rascunho') is not null then
        delete from deusede.rascunhos where usuario_id = auth.uid() and chave = deusede.txt(p, 'rascunho');
      end if;
      return deusede.obter_entrada_nota(jsonb_build_object('id', v_nota.id));
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
  return deusede.obter_entrada_nota(jsonb_build_object('id', v_nota.id));
exception when others then
  get stacked diagnostics v_restricao = constraint_name;
  raise exception '%', deusede.traduzir_erro(sqlstate, sqlerrm, v_restricao);
end $$;

-- ---------- Pedido avulso de uma nota (uso interno): qualquer nota com
-- produtos, colada ou digitada. Se já existe, devolve o mesmo.
create or replace function deusede.criar_pedido_avulso_nota(p_nota_id uuid)
returns jsonb language plpgsql security definer set search_path = deusede
set timezone to 'America/Sao_Paulo' as $$
declare
  n deusede.notas_entrada;
  ped deusede.pedidos;
  i record;
begin
  select * into n from deusede.notas_entrada where id = p_nota_id for update;
  if not found then return null; end if;
  select * into ped from deusede.pedidos where nota_entrada_id = n.id;
  if found then
    return jsonb_build_object('id', ped.id, 'numero_formatado', deusede.formatar_numero('PED', ped.numero));
  end if;
  if not exists (select 1 from deusede.notas_entrada_itens where nota_id = n.id) then
    raise exception 'A nota % não tem produtos.', deusede.formatar_numero('ENT', n.numero);
  end if;

  insert into deusede.pedidos (
    lote_id, fornecedor_id, nota_entrada_id, status, data_pedido, fornecedor_nome, observacoes
  ) values (
    gen_random_uuid(), n.fornecedor_id, n.id, 'em_elaboracao', n.data_entrada,
    coalesce(nullif(btrim(n.fornecedor_nome), ''), 'Pedido avulso'),
    concat('Compra avulsa da nota ', deusede.formatar_numero('ENT', n.numero),
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
      i.quantidade_embalagens, coalesce(i.preco_embalagem, 0), 'Importado da nota'
    );
  end loop;

  update deusede.pedidos set status = 'recebido' where id = ped.id;
  select * into ped from deusede.pedidos where id = ped.id;
  return jsonb_build_object('id', ped.id, 'numero_formatado', deusede.formatar_numero('PED', ped.numero));
end $$;
revoke all on function deusede.criar_pedido_avulso_nota(uuid) from public, anon, authenticated;

-- ---------- Tirar a compra avulsa (uso interno): apaga só o pedido avulso
-- e os itens dele. Pedido com conta a pagar não sai (a conta aponta para ele).
create or replace function deusede.remover_compra_avulsa(p_nota_id uuid)
returns void language plpgsql security definer set search_path = deusede
set timezone to 'America/Sao_Paulo' as $$
declare
  ped deusede.pedidos;
  v_conta text;
begin
  select * into ped from deusede.pedidos where nota_entrada_id = p_nota_id for update;
  if not found then return; end if;
  select deusede.formatar_numero('CP', c.numero) into v_conta from deusede.contas_pagar c where c.pedido_id = ped.id limit 1;
  if v_conta is not null then
    raise exception 'A compra avulsa % tem a conta a pagar % ligada a ela. Ela continua no Total comprado.',
      deusede.formatar_numero('PED', ped.numero), v_conta;
  end if;
  insert into deusede.eventos (entidade, entidade_id, acao, status_anterior, detalhe)
  values ('pedido', ped.id, 'compra_avulsa_removida', ped.status,
          'Compra avulsa desmarcada: a nota saiu do Total comprado.');
  -- as travas de pedidos e itens deixam passar só este pedido
  perform set_config('deusede.removendo_compra_avulsa', ped.id::text, true);
  delete from deusede.pedido_itens where pedido_id = ped.id;
  delete from deusede.pedidos where id = ped.id;
  perform set_config('deusede.removendo_compra_avulsa', '', true);
end $$;
revoke all on function deusede.remover_compra_avulsa(uuid) from public, anon, authenticated;

-- ---------- Travas: pedido não se exclui, exceto a compra avulsa desmarcada
create or replace function deusede.tg_pedidos_regras()
returns trigger language plpgsql security definer set search_path = deusede
set timezone to 'America/Sao_Paulo' as $$
begin
  if tg_op = 'DELETE' then
    if old.nota_entrada_id is not null
       and current_setting('deusede.removendo_compra_avulsa', true) = old.id::text then
      return old;
    end if;
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
            case when new.nota_entrada_id is not null then 'Compra avulsa marcada na nota.'
                 when new.status = 'cancelado' then new.motivo_cancelamento end);
  end if;
  return new;
end $$;

create or replace function deusede.tg_pedido_itens_trava()
returns trigger language plpgsql security definer set search_path = deusede as $$
declare
  v_status text;
begin
  if tg_op = 'DELETE'
     and current_setting('deusede.removendo_compra_avulsa', true) = old.pedido_id::text then
    return old;
  end if;
  if tg_op = 'UPDATE' and new.pedido_id <> old.pedido_id then
    raise exception 'Um item não pode mudar de pedido.';
  end if;
  select status into v_status from deusede.pedidos where id = coalesce(new.pedido_id, old.pedido_id);
  if v_status is not null and not deusede.pedido_editavel(v_status) then
    raise exception 'Pedido já aprovado: os itens não podem mais ser alterados.';
  end if;
  return coalesce(new, old);
end $$;

-- ---------- Marcar / desmarcar "Compra avulsa" de uma nota (RPC)
-- p: { id: nota, avulsa: true | false }. Devolve a nota (obter_entrada_nota).
create or replace function deusede.definir_compra_avulsa(p jsonb)
returns jsonb language plpgsql security definer set search_path = deusede
set timezone to 'America/Sao_Paulo' as $$
declare
  v_nota deusede.notas_entrada;
  v_restricao text;
begin
  if not deusede.pode_editar() then
    raise exception 'Só administrador ou comprador marca compra avulsa.';
  end if;
  select * into v_nota from deusede.notas_entrada where id = deusede.uid(p, 'id');
  if not found then raise exception 'Nota não encontrada.'; end if;
  if coalesce((p ->> 'avulsa')::boolean, false) then
    perform deusede.criar_pedido_avulso_nota(v_nota.id);
  else
    perform deusede.remover_compra_avulsa(v_nota.id);
  end if;
  return deusede.obter_entrada_nota(jsonb_build_object('id', v_nota.id));
exception when others then
  get stacked diagnostics v_restricao = constraint_name;
  raise exception '%', deusede.traduzir_erro(sqlstate, sqlerrm, v_restricao);
end $$;

-- ---------- Nota e lista de notas mostram se é compra avulsa
create or replace function deusede.obter_entrada_nota(p jsonb)
returns jsonb language sql stable as $$
  select to_jsonb(n) || jsonb_build_object(
    'numero_formatado', deusede.formatar_numero('ENT', n.numero),
    'criado_por_nome', (select nullif(pf.nome, '') from deusede.perfis pf where pf.id = n.created_by),
    'itens', coalesce((select jsonb_agg(to_jsonb(i) order by lower(i.produto_nome)) from deusede.notas_entrada_itens i where i.nota_id = n.id), '[]'),
    'total', coalesce((select sum(subtotal) from deusede.notas_entrada_itens i where i.nota_id = n.id), 0),
    'compra_avulsa', (
      select jsonb_build_object('pedido_id', v.id, 'numero_formatado', v.numero_formatado, 'valor_total', v.valor_total)
      from deusede.vw_pedidos v where v.nota_entrada_id = n.id
    )
  )
  from deusede.notas_entrada n where n.id = deusede.uid(p, 'id')
$$;

create or replace function deusede.listar_entradas_nota(p jsonb default '{}')
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(x order by x.data_entrada desc, x.numero desc), '[]') from (
    select n.id, n.numero, deusede.formatar_numero('ENT', n.numero) as numero_formatado, n.data_entrada, n.numero_nota,
           n.fornecedor_id, n.fornecedor_nome, n.observacoes,
           (select count(*) from deusede.notas_entrada_itens i where i.nota_id = n.id) as qtd_itens,
           coalesce((select sum(subtotal) from deusede.notas_entrada_itens i where i.nota_id = n.id), 0) as total,
           exists (select 1 from deusede.pedidos pd where pd.nota_entrada_id = n.id) as compra_avulsa
    from deusede.notas_entrada n
    order by n.data_entrada desc, n.numero desc
    limit 200
  ) x
$$;

-- Datas no horário de Brasília (ver 0012): toda migração que cria ou
-- recria função termina com este bloco.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'deusede'
      and p.prokind = 'f'
      and (
        p.prolang = (select oid from pg_language where lanname = 'plpgsql')
        or p.prosrc ~* '(current_date|current_timestamp|localtime|now\(|date_trunc|to_char|::date)'
      )
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c where c ilike 'timezone=%'
      )
  loop
    execute format('alter function %s set timezone to %L', f.assinatura, 'America/Sao_Paulo');
  end loop;
end $$;
