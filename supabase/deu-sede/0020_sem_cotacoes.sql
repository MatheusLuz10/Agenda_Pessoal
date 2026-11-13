-- =====================================================================
-- DEU SEDE! — Gestão de Compras
-- Migração 0020: SEM COTAÇÕES E SEM COMPARAÇÃO DE PREÇOS.
--
--   O app deixou de ter as telas "Cotações" e "Comparação de preços".
--   * apaga as tabelas cotacoes e cotacao_itens (com os dados), a view
--     vw_cotacoes, as funções e os gatilhos delas;
--   * o histórico de preços CONTINUA com os preços que vieram de cotação
--     (origem "cotacao"), só sem a ligação com o item da cotação;
--   * pedidos, itens de pedido e histórico perdem a ligação com cotação.
--     As colunas cotacao_id / cotacao_item_id ficam vazias e sem uso: o
--     modo de teste local reaplica as migrações antigas, que as citam;
--   * funções que citavam cotação (painel, avisos, relatórios, histórico e
--     movimentos do produto, registros, gerar pedidos, senha…) recriadas
--     sem ela. O histórico (eventos) das cotações é apagado.
--
-- Como aplicar: SQL Editor -> colar este arquivo inteiro -> Run.
-- Pode rodar de novo sem problema (idempotente).
-- =====================================================================

-- 1) Ligações com cotação: soltas e vazias (com os gatilhos de "não
--    altera" desligados só durante a limpeza)
alter table deusede.pedido_itens drop constraint if exists pedido_itens_cotacao_item_id_fkey;
alter table deusede.pedidos drop constraint if exists pedidos_cotacao_id_fkey;
alter table deusede.historico_precos drop constraint if exists historico_precos_cotacao_item_id_fkey;
drop index if exists deusede.pedido_itens_cotacao_item_idx;
drop index if exists deusede.pedidos_cotacao_idx;

do $$
begin
  if exists (select 1 from deusede.pedidos where cotacao_id is not null) then
    alter table deusede.pedidos disable trigger user;
    update deusede.pedidos set cotacao_id = null where cotacao_id is not null;
    alter table deusede.pedidos enable trigger user;
  end if;
  if exists (select 1 from deusede.pedido_itens where cotacao_item_id is not null) then
    alter table deusede.pedido_itens disable trigger user;
    update deusede.pedido_itens set cotacao_item_id = null where cotacao_item_id is not null;
    alter table deusede.pedido_itens enable trigger user;
  end if;
  if exists (select 1 from deusede.historico_precos where cotacao_item_id is not null) then
    alter table deusede.historico_precos disable trigger user;
    update deusede.historico_precos set cotacao_item_id = null where cotacao_item_id is not null;
    alter table deusede.historico_precos enable trigger user;
  end if;
  if exists (select 1 from deusede.eventos where entidade = 'cotacao') then
    alter table deusede.eventos disable trigger user;
    delete from deusede.eventos where entidade = 'cotacao';
    alter table deusede.eventos enable trigger user;
  end if;
end $$;

comment on column deusede.pedidos.cotacao_id is 'Sem uso desde a 0020 (cotações removidas).';
comment on column deusede.pedido_itens.cotacao_item_id is 'Sem uso desde a 0020 (cotações removidas).';
comment on column deusede.historico_precos.cotacao_item_id is 'Sem uso desde a 0020 (cotações removidas).';

alter table deusede.eventos drop constraint if exists eventos_entidade_check;
alter table deusede.eventos add constraint eventos_entidade_check check (entidade in ('pedido', 'recebimento'));

-- 2) Telas de cotação e comparação: funções, view, tabelas e gatilhos
drop function if exists deusede.listar_cotacoes(jsonb);
drop function if exists deusede.obter_cotacao(jsonb);
drop function if exists deusede.salvar_cotacao(jsonb);
drop function if exists deusede.mudar_status_cotacao(jsonb);
drop function if exists deusede.duplicar_cotacao(jsonb);
drop function if exists deusede.excluir_cotacao(jsonb);
drop function if exists deusede.ofertas_comparacao(jsonb);
drop view if exists deusede.vw_cotacoes;
drop table if exists deusede.cotacao_itens;
drop table if exists deusede.cotacoes;
drop sequence if exists deusede.cotacoes_numero_seq;
drop function if exists deusede.tg_cotacao_itens_trava();
drop function if exists deusede.tg_cotacao_recebida();
drop function if exists deusede.tg_cotacoes_regras();
drop function if exists deusede.cotacao_editavel(text);
drop function if exists deusede.cotacao_transicao_valida(text, text);

-- 3) Senha: as áreas "Cotações" e "Comparação de preços" não existem mais
update deusede.seguranca set areas = array_remove(array_remove(areas, 'cotacoes'), 'comparacao')
 where areas && array['cotacoes', 'comparacao'];

-- 4) Funções que citavam cotação, recriadas sem ela

CREATE OR REPLACE FUNCTION deusede.traduzir_erro(p_estado text, p_mensagem text, p_restricao text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    -- (nomes automáticos longos são cortados em 63 caracteres: compara o começo)
    when p_estado = '23505' then case
      when p_restricao = 'categorias_nome_uk' then 'Já existe uma categoria com esse nome.'
      when p_restricao = 'produtos_identidade_uk' then 'Esse produto já está cadastrado (mesmo nome, marca e volume).'
      when p_restricao = 'produtos_codigo_uk' then 'Esse código já é usado por outro produto.'
      when p_restricao = 'fornecedores_nome_uk' then 'Já existe um fornecedor com esse nome.'
      when p_restricao = 'fornecedores_cnpj_uk' then 'Esse CNPJ já está cadastrado em outro fornecedor.'
      when p_restricao like 'fornecedor_produtos_fornecedor_id%' then 'Esse fornecedor já tem esse produto com essa embalagem.'
      when p_restricao like 'pedido_itens_pedido_id%' then 'O mesmo produto com a mesma embalagem aparece duas vezes no pedido.'
      when p_restricao like 'pedidos_lote_id%' then 'Esse pedido já foi gerado.'
      when p_restricao like 'recebimento_itens_recebimento_id%' then 'O mesmo item aparece duas vezes no recebimento.'
      else 'Registro duplicado.'
    end
    when p_estado = '23514' then case
      when p_restricao like '%whatsapp%' then 'WhatsApp inválido: use DDD + número (só números).'
      when p_restricao like '%cnpj%' then 'CNPJ inválido: informe os 14 números.'
      when p_restricao like '%unidades_por_embalagem%' then 'Unidades por embalagem deve ser maior que zero.'
      when p_restricao like '%quantidade%' then 'Quantidade inválida.'
      when p_restricao like '%preco%' then 'Preço inválido.'
      when p_restricao like '%desconto%' then 'Desconto inválido (não pode ser maior que o valor do item).'
      when p_restricao like '%frete%' then 'Frete inválido.'
      when p_restricao like '%nome%' then 'Informe o nome.'
      else 'Algum valor informado é inválido.'
    end
    when p_estado = '23502' then 'Preencha os campos obrigatórios.'
    when p_estado = '23503' then 'Esse registro está ligado a outros dados e não pode ser removido.'
    when p_estado = '22P02' then 'Algum valor informado está em formato inválido.'
    else p_mensagem
  end
$function$;

CREATE OR REPLACE FUNCTION deusede.tg_pedidos_regras()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'deusede'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'Pedidos não podem ser excluídos. Use o cancelamento com justificativa.';
  end if;

  if tg_op = 'INSERT' then
    -- Itens entram depois do cabeçalho e só em pedido em elaboração; a
    -- aprovação vem em seguida (o Montar Pedido faz tudo numa transação).
    if new.status <> 'em_elaboracao' then
      raise exception 'Um pedido novo começa em elaboração.';
    end if;
    insert into deusede.eventos (entidade, entidade_id, acao, status_novo)
    values ('pedido', new.id, 'criado', new.status);
    return new;
  end if;

  if old.status in ('recebido', 'cancelado') then
    raise exception 'Pedido % está % e não pode mais ser alterado.',
      deusede.formatar_numero('PED', old.numero), old.status;
  end if;

  if (new.numero, new.lote_id, new.fornecedor_id, new.created_at, new.created_by)
     is distinct from (old.numero, old.lote_id, old.fornecedor_id, old.created_at, old.created_by) then
    raise exception 'Número, lote, fornecedor e criação do pedido não podem ser alterados.';
  end if;

  if not deusede.pedido_editavel(old.status) and (
    new.data_pedido, new.condicao_pagamento, new.frete, new.desconto_geral,
    new.fornecedor_nome, new.fornecedor_whatsapp
  ) is distinct from (
    old.data_pedido, old.condicao_pagamento, old.frete, old.desconto_geral,
    old.fornecedor_nome, old.fornecedor_whatsapp
  ) then
    raise exception 'Pedido % já aprovado: valores e condições não podem mais ser alterados.',
      deusede.formatar_numero('PED', old.numero);
  end if;

  if new.status <> old.status then
    if not deusede.pedido_transicao_valida(old.status, new.status) then
      raise exception 'Mudança de status do pedido não permitida: % → %.', old.status, new.status;
    end if;
    if new.status in ('aguardando_aprovacao', 'aprovado')
       and not exists (select 1 from deusede.pedido_itens where pedido_id = new.id) then
      raise exception 'O pedido precisa ter ao menos um item.';
    end if;
    if new.status = 'cancelado' and length(trim(coalesce(new.motivo_cancelamento, ''))) < 5 then
      raise exception 'Informe o motivo do cancelamento.';
    end if;
    if new.status in ('parcialmente_recebido', 'recebido') and not exists (
      select 1 from deusede.recebimentos where pedido_id = new.id and cancelado_em is null
    ) then
      raise exception 'Registre o recebimento antes de marcar o pedido como recebido.';
    end if;

    if new.status = 'enviado' then new.enviado_em := coalesce(new.enviado_em, now()); end if;
    if new.status = 'recebido' then new.concluido_em := now(); end if;
    if new.status = 'cancelado' then new.cancelado_em := now(); end if;

    insert into deusede.eventos (entidade, entidade_id, acao, status_anterior, status_novo, detalhe)
    values ('pedido', new.id, 'status_alterado', old.status, new.status,
            case when new.status = 'cancelado' then new.motivo_cancelamento end);
  end if;

  return new;
end $function$;

CREATE OR REPLACE FUNCTION deusede.gerar_pedidos(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
declare
  v_lote uuid := deusede.uid(p, 'lote_id');
  v_forn uuid;
  v_f deusede.fornecedores;
  v_conf jsonb;
  v_ped deusede.pedidos;
  it jsonb;
  v_prod deusede.produtos;
  v_qtd numeric;
  v_preco numeric;
  v_desc numeric;
  v_tipo text;
  v_unid int;
  v_nome text;
  v_produto uuid;
  v_restricao text;
begin
  perform deusede.exigir_pedido();
  if v_lote is null then raise exception 'Identificação do lote não informada.'; end if;

  -- Clique repetido / reenvio: devolve o que já foi gerado.
  if exists (select 1 from deusede.pedidos where lote_id = v_lote) then
    return deusede.pedidos_do_lote(v_lote);
  end if;

  if jsonb_typeof(p -> 'itens') is distinct from 'array' or jsonb_array_length(p -> 'itens') = 0 then
    raise exception 'Adicione ao menos um produto ao pedido.';
  end if;
  if exists (select 1 from jsonb_array_elements(p -> 'itens') x where deusede.uid(x, 'fornecedor_id') is null) then
    raise exception 'Escolha o fornecedor de todos os produtos.';
  end if;

  for v_forn in
    select distinct deusede.uid(x, 'fornecedor_id') from jsonb_array_elements(p -> 'itens') x
  loop
    select * into v_f from deusede.fornecedores where id = v_forn;
    if v_f.id is null then raise exception 'Fornecedor não encontrado.'; end if;
    if not v_f.ativo then raise exception 'O fornecedor "%" está inativo.', v_f.nome; end if;

    select x into v_conf from jsonb_array_elements(coalesce(p -> 'fornecedores', '[]')) x
     where deusede.uid(x, 'fornecedor_id') = v_forn limit 1;
    v_conf := coalesce(v_conf, '{}');

    insert into deusede.pedidos (
      lote_id, fornecedor_id, fornecedor_nome, fornecedor_whatsapp, frete, desconto_geral,
      condicao_pagamento, previsao_entrega, observacoes
    ) values (
      v_lote, v_forn, v_f.nome, v_f.whatsapp,
      coalesce(deusede.num(v_conf, 'frete'), 0),
      coalesce(deusede.num(v_conf, 'desconto_geral'), 0),
      deusede.txt(v_conf, 'condicao_pagamento'),
      deusede.txt(v_conf, 'previsao_entrega')::date,
      deusede.txt(v_conf, 'observacoes')
    ) returning * into v_ped;

    for it in select x from jsonb_array_elements(p -> 'itens') x where deusede.uid(x, 'fornecedor_id') = v_forn loop
      v_qtd := deusede.num(it, 'quantidade_embalagens');
      if v_qtd is null or v_qtd <= 0 then raise exception 'Informe a quantidade de todos os produtos.'; end if;
      select * into v_prod from deusede.produtos where id = deusede.uid(it, 'produto_id');
      if v_prod.id is null then raise exception 'Produto não encontrado.'; end if;
      v_preco := deusede.num(it, 'preco_embalagem');
      if v_preco is null or v_preco < 0 then raise exception 'Informe o preço de "%".', v_prod.nome; end if;
      v_produto := v_prod.id;
      v_nome := v_prod.nome;
      v_tipo := coalesce(deusede.txt(it, 'tipo_embalagem'), v_prod.tipo_embalagem);
      v_unid := coalesce(deusede.num(it, 'unidades_por_embalagem')::int, v_prod.unidades_por_embalagem);
      v_desc := coalesce(deusede.num(it, 'desconto_valor'), 0);

      insert into deusede.pedido_itens (
        pedido_id, produto_id, produto_nome, tipo_embalagem, unidades_por_embalagem,
        quantidade_embalagens, preco_embalagem, desconto_valor, observacoes
      ) values (
        v_ped.id, v_produto, v_nome, v_tipo, v_unid, v_qtd, v_preco, v_desc, deusede.txt(it, 'observacoes')
      );
    end loop;

    -- A confirmação na conferência é a aprovação.
    update deusede.pedidos set status = 'aprovado' where id = v_ped.id;
  end loop;

  return deusede.pedidos_do_lote(v_lote);
exception when others then
  get stacked diagnostics v_restricao = constraint_name;
  raise exception '%', deusede.traduzir_erro(sqlstate, sqlerrm, v_restricao);
end $function$;

CREATE OR REPLACE FUNCTION deusede.obter_pedido(p jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select (to_jsonb(v) - 'cotacao_id') || jsonb_build_object(
    'itens', coalesce((
      select jsonb_agg(to_jsonb(s) order by lower(s.produto_nome), s.unidades_por_embalagem)
      from deusede.vw_pedido_itens_saldo s where s.pedido_id = v.id
    ), '[]'),
    'recebimentos', coalesce((
      select jsonb_agg(to_jsonb(r) || jsonb_build_object(
          'numero_formatado', deusede.formatar_numero('REC', r.numero),
          'itens', coalesce((
            select jsonb_agg(to_jsonb(ri) || jsonb_build_object(
                'produto_nome', pi.produto_nome,
                'preco_pedido', pi.preco_embalagem
              ) order by lower(pi.produto_nome))
            from deusede.recebimento_itens ri join deusede.pedido_itens pi on pi.id = ri.pedido_item_id
            where ri.recebimento_id = r.id
          ), '[]')
        ) order by r.data_recebimento, r.numero)
      from deusede.recebimentos r where r.pedido_id = v.id
    ), '[]'),
    'eventos', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at, e.id)
      from deusede.eventos e where e.entidade = 'pedido' and e.entidade_id = v.id
    ), '[]'),
    'fornecedor', (select to_jsonb(f) from deusede.fornecedores f where f.id = v.fornecedor_id),
    'empresa', (select to_jsonb(e) from deusede.configuracoes_empresa e limit 1)
  )
  from deusede.vw_pedidos v
  where v.id = deusede.uid(p, 'id')
$function$;

CREATE OR REPLACE FUNCTION deusede.historico_produto(p jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select coalesce(jsonb_agg((to_jsonb(h) - 'cotacao_item_id') || jsonb_build_object(
      'fornecedor_nome', f.nome
    ) order by h.data_referencia desc, h.created_at desc), '[]')
  from deusede.historico_precos h
  join deusede.fornecedores f on f.id = h.fornecedor_id
  where h.produto_id = deusede.uid(p, 'produto_id')
    and (deusede.uid(p, 'fornecedor_id') is null or h.fornecedor_id = deusede.uid(p, 'fornecedor_id'))
$function$;

CREATE OR REPLACE FUNCTION deusede.movimentos_produto(p jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
  select jsonb_build_object(
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
$function$;

CREATE OR REPLACE FUNCTION deusede.resumo_fornecedor(p jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
  select jsonb_build_object(
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
$function$;

CREATE OR REPLACE FUNCTION deusede.relatorio_fornecedores(p jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
AS $function$
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
           coalesce((select string_agg(nome, ', ') from (
              select produto_nome as nome from itens where fornecedor_id = f.id
              group by produto_nome order by sum(subtotal) desc limit 3) t), '') as produtos_mais_comprados,
           (select count(*) from melhor m where m.fornecedor_id = f.id) as produtos_com_melhor_preco,
           (select round(avg((e.ultimo - e.primeiro) / nullif(e.primeiro, 0) * 100), 1)
              from evolucao e where e.fornecedor_id = f.id) as variacao_media_pct
    from deusede.fornecedores f
    where (deusede.uid(p, 'fornecedor_id') is null or f.id = deusede.uid(p, 'fornecedor_id'))
  ) x
  where x.total_comprado > 0 or deusede.uid(p, 'fornecedor_id') is not null
$function$;

CREATE OR REPLACE FUNCTION deusede.painel(p jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION deusede.avisos(p jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
declare
  v_so_pedidos boolean := deusede.e_so_pedidos();
begin
  if not deusede.pode_ler() then return '{}'::jsonb; end if;
  return jsonb_build_object(
    -- pedido realizado e ainda não enviado ao fornecedor
    'pedidos', (select count(*) from deusede.pedidos where status in ('em_elaboracao', 'aguardando_aprovacao', 'aprovado')),
    'contas', case when v_so_pedidos then 0 else
      (select count(*) from deusede.contas_pagar_parcelas where status = 'aberta' and vencimento <= current_date) end,
    -- pedido a caminho: falta receber
    'recebimentos', case when v_so_pedidos then 0 else
      (select count(*) from deusede.pedidos where status in ('enviado', 'confirmado', 'em_transporte', 'parcialmente_recebido')) end,
    'estoque', case when v_so_pedidos then 0 else
      (select count(*) from deusede.vw_estoque e join deusede.produtos pr on pr.id = e.produto_id where pr.ativo and e.abaixo_minimo) end,
    -- tem estoque para vender, mas não tem preço de venda
    'produtos', case when v_so_pedidos then 0 else
      (select count(*) from deusede.vw_estoque e join deusede.produtos pr on pr.id = e.produto_id
        where pr.ativo and e.saldo_unidades > 0 and pr.preco_venda is null and pr.preco_venda_embalagem is null) end
  );
end $function$;

CREATE OR REPLACE FUNCTION deusede.listar_atividades(p jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
declare
  v_de date := coalesce(deusede.txt(p, 'de')::date, current_date - 7);
  v_ate date := coalesce(deusede.txt(p, 'ate')::date, current_date);
  v_usuario uuid := deusede.uid(p, 'usuario_id');
  v_area text := deusede.txt(p, 'area');
  v_limite integer := least(coalesce(deusede.num(p, 'limite')::integer, 1000), 5000);
begin
  if not deusede.pode_editar() then raise exception 'Só administrador ou comprador vê os registros.'; end if;
  return jsonb_build_object(
    'de', v_de, 'ate', v_ate,
    'usuarios', coalesce((
      select jsonb_agg(jsonb_build_object('id', pf.id, 'nome', pf.nome, 'papel', pf.papel) order by pf.nome)
        from deusede.perfis pf), '[]'),
    'registros', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.quando desc, r.ordem desc)
        from (
          select *
            from (
              select 'app' as origem, a.id as ordem, a.created_at as quando, a.usuario_id, a.usuario_nome, a.papel,
                     a.area, a.acao, a.descricao, a.detalhes
                from deusede.atividades a
              union all
              select 'historico', e.id, e.created_at, e.usuario_id, pf.nome, pf.papel,
                     case e.entidade when 'pedido' then 'pedidos' else 'recebimentos' end,
                     e.acao,
                     case e.entidade
                       when 'pedido' then 'Pedido ' || coalesce((select deusede.formatar_numero('PED', x.numero) from deusede.pedidos x where x.id = e.entidade_id), '')
                       else 'Recebimento'
                     end
                     || ': ' || replace(e.acao, '_', ' ')
                     || coalesce(' (' || e.status_anterior || ' → ' || e.status_novo || ')', ' → ' || e.status_novo, '')
                     || coalesce(' — ' || nullif(e.detalhe, ''), ''),
                     jsonb_build_object('entidade', e.entidade, 'id', e.entidade_id)
                from deusede.eventos e
                left join deusede.perfis pf on pf.id = e.usuario_id
            ) t
           where deusede.data_brasil(t.quando) between v_de and v_ate
             and (v_usuario is null or t.usuario_id = v_usuario)
             and (v_area is null or t.area = v_area)
           order by t.quando desc, t.ordem desc
           limit v_limite
        ) r), '[]')
  );
end $function$;

CREATE OR REPLACE FUNCTION deusede.salvar_seguranca(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'deusede'
 SET "TimeZone" TO 'America/Sao_Paulo'
AS $function$
declare
  s deusede.seguranca;
  v_novo text := deusede.txt(p, 'pin_novo');
  v_sal text;
  v_permitidas text[] := array[
    'painel', 'fornecedores', 'pedidos', 'relatorios', 'configuracoes',
    'produtos_editar', 'estoque_ajuste', 'cancelar_venda', 'pdv_desconto', 'estoque', 'recebimentos', 'produtos', 'pdv'
  ];
  v_areas text[];
begin
  if not deusede.e_admin() then raise exception 'Só o administrador altera a senha.'; end if;
  select * into s from deusede.seguranca where id for update;
  if s.pin_hash is not null and s.pin_hash <> deusede.hash_senha(s.pin_sal, coalesce(deusede.txt(p, 'pin_atual'), '')) then
    raise exception 'Senha atual incorreta.';
  end if;
  if v_novo is not null then
    if v_novo !~ '^[0-9]{4}$' then raise exception 'A senha deve ter exatamente 4 números.'; end if;
    v_sal := gen_random_uuid()::text;
    update deusede.seguranca set pin_sal = v_sal, pin_hash = deusede.hash_senha(v_sal, v_novo), atualizado_em = now() where id;
  elsif s.pin_hash is null then
    raise exception 'Crie a senha de 4 números.';
  end if;
  if p ? 'areas' then
    select array_agg(distinct a) into v_areas from jsonb_array_elements_text(p -> 'areas') a where a = any (v_permitidas);
    update deusede.seguranca set areas = coalesce(v_areas, '{}') || array['configuracoes'], atualizado_em = now() where id;
  end if;
  return deusede.config_senha('{}');
end $function$;

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
