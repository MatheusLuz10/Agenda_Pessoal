-- =====================================================================
-- DEU SEDE! — Migração 0002: cadastros (Etapa 2)
--
-- A partir daqui o app conversa com o banco SÓ por funções (RPC) que
-- recebem e devolvem JSON. As mesmas funções rodam no Supabase e no
-- modo de teste local (Postgres no navegador), então as regras ficam
-- escritas uma vez só.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Utilitários das funções
-- ---------------------------------------------------------------------

create or replace function deusede.txt(p jsonb, k text)
returns text language sql immutable as $$
  select nullif(trim(p ->> k), '')
$$;

create or replace function deusede.num(p jsonb, k text)
returns numeric language sql immutable as $$
  select nullif(trim(p ->> k), '')::numeric
$$;

create or replace function deusede.uid(p jsonb, k text)
returns uuid language sql immutable as $$
  select nullif(trim(p ->> k), '')::uuid
$$;

create or replace function deusede.exigir_leitura()
returns void language plpgsql stable as $$
begin
  if not deusede.pode_ler() then
    raise exception 'Seu usuário não tem acesso ao DEU SEDE!.';
  end if;
end $$;

create or replace function deusede.exigir_edicao()
returns void language plpgsql stable as $$
begin
  if not deusede.pode_editar() then
    raise exception 'Seu usuário não tem permissão para alterar dados do DEU SEDE!.';
  end if;
end $$;

-- Traduz erros do Postgres para mensagens claras na tela.
create or replace function deusede.traduzir_erro(p_estado text, p_mensagem text, p_restricao text)
returns text language sql immutable as $$
  select case
    -- (nomes automáticos longos são cortados em 63 caracteres: compara o começo)
    when p_estado = '23505' then case
      when p_restricao = 'categorias_nome_uk' then 'Já existe uma categoria com esse nome.'
      when p_restricao = 'produtos_identidade_uk' then 'Esse produto já está cadastrado (mesmo nome, marca e volume).'
      when p_restricao = 'produtos_codigo_uk' then 'Esse código já é usado por outro produto.'
      when p_restricao = 'fornecedores_nome_uk' then 'Já existe um fornecedor com esse nome.'
      when p_restricao = 'fornecedores_cnpj_uk' then 'Esse CNPJ já está cadastrado em outro fornecedor.'
      when p_restricao like 'fornecedor_produtos_fornecedor_id%' then 'Esse fornecedor já tem esse produto com essa embalagem.'
      when p_restricao like 'cotacao_itens_cotacao_id%' then 'O mesmo produto com a mesma embalagem aparece duas vezes na cotação.'
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
      when p_restricao = 'cotacoes_check' then 'A validade não pode ser antes da data da cotação.'
      else 'Algum valor informado é inválido.'
    end
    when p_estado = '23502' then 'Preencha os campos obrigatórios.'
    when p_estado = '23503' then 'Esse registro está ligado a outros dados e não pode ser removido.'
    when p_estado = '22P02' then 'Algum valor informado está em formato inválido.'
    else p_mensagem
  end
$$;

-- ---------------------------------------------------------------------
-- Preço atual por fornecedor -> histórico permanente
-- ---------------------------------------------------------------------

-- Estoque mínimo do produto, em embalagens padrão (opcional; ver 0008).
alter table deusede.produtos
  add column if not exists estoque_minimo numeric(12, 3) check (estoque_minimo >= 0);

-- Preço de venda no PDV: por unidade e, opcional, pela embalagem fechada.
alter table deusede.produtos
  add column if not exists preco_venda numeric(14, 2) check (preco_venda >= 0),
  add column if not exists preco_venda_embalagem numeric(14, 2) check (preco_venda_embalagem >= 0);

-- Origem do preço atual: digitado (manual), cotação recebida ou nota
-- fiscal conferida no recebimento (nota).
alter table deusede.fornecedor_produtos
  add column if not exists preco_origem text not null default 'manual';
alter table deusede.fornecedor_produtos drop constraint if exists fornecedor_produtos_preco_origem_check;
alter table deusede.fornecedor_produtos add constraint fornecedor_produtos_preco_origem_check
  check (preco_origem in ('manual', 'cotacao', 'nota'));

alter table deusede.historico_precos drop constraint if exists historico_precos_origem_check;
alter table deusede.historico_precos add constraint historico_precos_origem_check
  check (origem in ('cotacao', 'manual', 'pedido', 'nota'));

-- Toda mudança de preço atual digitada (manual) ou vinda da nota fiscal
-- vira uma linha nova no histórico. (Preços de cotação são registrados
-- pela própria cotação, com a data dela — ver migração 0003.)
create or replace function deusede.tg_fornecedor_produtos_preco()
returns trigger language plpgsql security definer set search_path = deusede as $$
begin
  if tg_op = 'UPDATE' and (new.fornecedor_id, new.produto_id) is distinct from (old.fornecedor_id, old.produto_id) then
    raise exception 'Fornecedor e produto do vínculo não podem ser trocados. Cadastre um vínculo novo.';
  end if;

  if new.preco_atual is not null and (
    tg_op = 'INSERT'
    or (new.preco_atual, new.tipo_embalagem, new.unidades_por_embalagem)
       is distinct from (old.preco_atual, old.tipo_embalagem, old.unidades_por_embalagem)
  ) then
    if new.preco_origem in ('manual', 'nota') then
      new.preco_atualizado_em := now();
      insert into deusede.historico_precos (
        produto_id, fornecedor_id, origem, data_referencia, tipo_embalagem, unidades_por_embalagem, preco_embalagem
      ) values (
        new.produto_id, new.fornecedor_id, new.preco_origem, current_date,
        new.tipo_embalagem, new.unidades_por_embalagem, new.preco_atual
      );
    end if;
  end if;
  return new;
end $$;

drop trigger if exists fornecedor_produtos_preco on deusede.fornecedor_produtos;
create trigger fornecedor_produtos_preco
  before insert or update on deusede.fornecedor_produtos
  for each row execute function deusede.tg_fornecedor_produtos_preco();

-- ---------------------------------------------------------------------
-- Leitura
-- ---------------------------------------------------------------------

-- Quem sou eu no DEU SEDE! (null = sem acesso).
create or replace function deusede.meu_acesso(p jsonb default '{}')
returns jsonb language sql stable as $$
  select to_jsonb(x) from (
    select id, nome, papel from deusede.perfis where id = auth.uid() and ativo
  ) x
$$;

-- Todos os cadastros de uma vez (volume pequeno; a tela filtra).
create or replace function deusede.cadastros(p jsonb default '{}')
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'categorias', coalesce((select jsonb_agg(c order by c.ordem, lower(c.nome)) from deusede.categorias c), '[]'),
    'produtos', coalesce((select jsonb_agg(x order by lower(x.nome)) from deusede.produtos x), '[]'),
    'fornecedores', coalesce((select jsonb_agg(f order by lower(f.nome)) from deusede.fornecedores f), '[]'),
    'fornecedor_produtos', coalesce((
      select jsonb_agg(
        to_jsonb(fp) || jsonb_build_object(
          'preco_unitario', case when fp.preco_atual is null then null
                                 else round(fp.preco_atual / fp.unidades_por_embalagem, 4) end
        )
        order by fp.produto_id, fp.preco_atual / fp.unidades_por_embalagem nulls last
      ) from deusede.fornecedor_produtos fp
    ), '[]')
  )
$$;

-- Histórico de preços de um produto (mais recente primeiro).
create or replace function deusede.historico_produto(p jsonb)
returns jsonb language sql stable as $$
  select coalesce(jsonb_agg(to_jsonb(h) || jsonb_build_object(
      'fornecedor_nome', f.nome,
      'cotacao_numero', case when c.numero is null then null else deusede.formatar_numero('COT', c.numero) end,
      'cotacao_id', c.id
    ) order by h.data_referencia desc, h.created_at desc), '[]')
  from deusede.historico_precos h
  join deusede.fornecedores f on f.id = h.fornecedor_id
  left join deusede.cotacao_itens ci on ci.id = h.cotacao_item_id
  left join deusede.cotacoes c on c.id = ci.cotacao_id
  where h.produto_id = deusede.uid(p, 'produto_id')
    and (deusede.uid(p, 'fornecedor_id') is null or h.fornecedor_id = deusede.uid(p, 'fornecedor_id'))
$$;

-- ---------------------------------------------------------------------
-- Gravação
-- ---------------------------------------------------------------------

create or replace function deusede.salvar_categoria(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_id uuid := deusede.uid(p, 'id');
  r deusede.categorias;
  v_restricao text;
begin
  perform deusede.exigir_edicao();
  if v_id is null then
    insert into deusede.categorias (nome, ordem, ativo)
    values (deusede.txt(p, 'nome'), coalesce(deusede.num(p, 'ordem')::int, 100), coalesce((p ->> 'ativo')::boolean, true))
    returning * into r;
  else
    update deusede.categorias set
      nome = coalesce(deusede.txt(p, 'nome'), nome),
      ordem = coalesce(deusede.num(p, 'ordem')::int, ordem),
      ativo = coalesce((p ->> 'ativo')::boolean, ativo)
    where id = v_id
    returning * into r;
    if r.id is null then raise exception 'Categoria não encontrada.'; end if;
  end if;
  return to_jsonb(r);
exception when others then
  get stacked diagnostics v_restricao = constraint_name;
  raise exception '%', deusede.traduzir_erro(sqlstate, sqlerrm, v_restricao);
end $$;

create or replace function deusede.salvar_produto(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_id uuid := deusede.uid(p, 'id');
  r deusede.produtos;
  v_restricao text;
begin
  perform deusede.exigir_edicao();
  if deusede.txt(p, 'nome') is null then raise exception 'Informe o nome do produto.'; end if;
  if deusede.uid(p, 'categoria_id') is null then raise exception 'Escolha a categoria.'; end if;

  if v_id is null then
    insert into deusede.produtos (
      nome, categoria_id, marca, codigo, tipo_embalagem, unidades_por_embalagem,
      volume_por_unidade, unidade_medida, observacoes, ativo, estoque_minimo, preco_venda, preco_venda_embalagem
    ) values (
      deusede.txt(p, 'nome'), deusede.uid(p, 'categoria_id'), deusede.txt(p, 'marca'), deusede.txt(p, 'codigo'),
      coalesce(deusede.txt(p, 'tipo_embalagem'), 'caixa'), coalesce(deusede.num(p, 'unidades_por_embalagem')::int, 1),
      deusede.num(p, 'volume_por_unidade'), deusede.txt(p, 'unidade_medida'), deusede.txt(p, 'observacoes'),
      coalesce((p ->> 'ativo')::boolean, true), deusede.num(p, 'estoque_minimo'),
      deusede.num(p, 'preco_venda'), deusede.num(p, 'preco_venda_embalagem')
    ) returning * into r;
  else
    update deusede.produtos set
      nome = deusede.txt(p, 'nome'),
      categoria_id = deusede.uid(p, 'categoria_id'),
      marca = deusede.txt(p, 'marca'),
      codigo = deusede.txt(p, 'codigo'),
      tipo_embalagem = coalesce(deusede.txt(p, 'tipo_embalagem'), tipo_embalagem),
      unidades_por_embalagem = coalesce(deusede.num(p, 'unidades_por_embalagem')::int, unidades_por_embalagem),
      volume_por_unidade = deusede.num(p, 'volume_por_unidade'),
      unidade_medida = deusede.txt(p, 'unidade_medida'),
      observacoes = deusede.txt(p, 'observacoes'),
      ativo = coalesce((p ->> 'ativo')::boolean, ativo),
      estoque_minimo = deusede.num(p, 'estoque_minimo'),
      preco_venda = deusede.num(p, 'preco_venda'),
      preco_venda_embalagem = deusede.num(p, 'preco_venda_embalagem')
    where id = v_id
    returning * into r;
    if r.id is null then raise exception 'Produto não encontrado.'; end if;
  end if;
  return to_jsonb(r);
exception when others then
  get stacked diagnostics v_restricao = constraint_name;
  raise exception '%', deusede.traduzir_erro(sqlstate, sqlerrm, v_restricao);
end $$;

-- Ativar/desativar sem mexer no resto (produto, fornecedor, categoria, vínculo).
create or replace function deusede.definir_ativo(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_tabela text := p ->> 'tabela';
  v_id uuid := deusede.uid(p, 'id');
  v_ativo boolean := (p ->> 'ativo')::boolean;
  v_linhas int;
begin
  perform deusede.exigir_edicao();
  if v_tabela not in ('produtos', 'fornecedores', 'categorias', 'fornecedor_produtos') then
    raise exception 'Cadastro inválido.';
  end if;
  execute format('update deusede.%I set ativo = $1 where id = $2', v_tabela) using v_ativo, v_id;
  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then raise exception 'Registro não encontrado.'; end if;
  return jsonb_build_object('id', v_id, 'ativo', v_ativo);
end $$;

create or replace function deusede.salvar_fornecedor(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_id uuid := deusede.uid(p, 'id');
  r deusede.fornecedores;
  v_restricao text;
begin
  perform deusede.exigir_edicao();
  if deusede.txt(p, 'nome') is null then raise exception 'Informe o nome da empresa.'; end if;

  if v_id is null then
    insert into deusede.fornecedores (
      nome, vendedor, telefone, whatsapp, cnpj, endereco, email, condicoes_comerciais, observacoes, ativo
    ) values (
      deusede.txt(p, 'nome'), deusede.txt(p, 'vendedor'), deusede.txt(p, 'telefone'), deusede.txt(p, 'whatsapp'),
      deusede.txt(p, 'cnpj'), deusede.txt(p, 'endereco'), deusede.txt(p, 'email'),
      deusede.txt(p, 'condicoes_comerciais'), deusede.txt(p, 'observacoes'), coalesce((p ->> 'ativo')::boolean, true)
    ) returning * into r;
  else
    update deusede.fornecedores set
      nome = deusede.txt(p, 'nome'),
      vendedor = deusede.txt(p, 'vendedor'),
      telefone = deusede.txt(p, 'telefone'),
      whatsapp = deusede.txt(p, 'whatsapp'),
      cnpj = deusede.txt(p, 'cnpj'),
      endereco = deusede.txt(p, 'endereco'),
      email = deusede.txt(p, 'email'),
      condicoes_comerciais = deusede.txt(p, 'condicoes_comerciais'),
      observacoes = deusede.txt(p, 'observacoes'),
      ativo = coalesce((p ->> 'ativo')::boolean, ativo)
    where id = v_id
    returning * into r;
    if r.id is null then raise exception 'Fornecedor não encontrado.'; end if;
  end if;
  return to_jsonb(r);
exception when others then
  get stacked diagnostics v_restricao = constraint_name;
  raise exception '%', deusede.traduzir_erro(sqlstate, sqlerrm, v_restricao);
end $$;

-- Produto que o fornecedor vende + preço atual (opcional).
create or replace function deusede.salvar_fornecedor_produto(p jsonb)
returns jsonb language plpgsql as $$
declare
  v_id uuid := deusede.uid(p, 'id');
  r deusede.fornecedor_produtos;
  v_restricao text;
begin
  perform deusede.exigir_edicao();
  if v_id is null then
    insert into deusede.fornecedor_produtos (
      fornecedor_id, produto_id, codigo_no_fornecedor, tipo_embalagem, unidades_por_embalagem,
      preco_atual, preco_origem, ativo
    ) values (
      deusede.uid(p, 'fornecedor_id'), deusede.uid(p, 'produto_id'), deusede.txt(p, 'codigo_no_fornecedor'),
      deusede.txt(p, 'tipo_embalagem'), deusede.num(p, 'unidades_por_embalagem')::int,
      deusede.num(p, 'preco_atual'), 'manual', coalesce((p ->> 'ativo')::boolean, true)
    ) returning * into r;
  else
    update deusede.fornecedor_produtos set
      codigo_no_fornecedor = deusede.txt(p, 'codigo_no_fornecedor'),
      tipo_embalagem = coalesce(deusede.txt(p, 'tipo_embalagem'), tipo_embalagem),
      unidades_por_embalagem = coalesce(deusede.num(p, 'unidades_por_embalagem')::int, unidades_por_embalagem),
      preco_atual = deusede.num(p, 'preco_atual'),
      preco_origem = 'manual',
      ativo = coalesce((p ->> 'ativo')::boolean, ativo)
    where id = v_id
    returning * into r;
    if r.id is null then raise exception 'Vínculo não encontrado.'; end if;
  end if;
  return to_jsonb(r);
exception when others then
  get stacked diagnostics v_restricao = constraint_name;
  raise exception '%', deusede.traduzir_erro(sqlstate, sqlerrm, v_restricao);
end $$;

-- Dados da empresa (cabeçalho de PDF e mensagens)
create or replace function deusede.empresa(p jsonb default '{}')
returns jsonb language sql stable as $$
  select to_jsonb(e) from deusede.configuracoes_empresa e limit 1
$$;

create or replace function deusede.salvar_empresa(p jsonb)
returns jsonb language plpgsql as $$
declare r deusede.configuracoes_empresa;
begin
  if not deusede.e_admin() then raise exception 'Só o administrador altera os dados da empresa.'; end if;
  update deusede.configuracoes_empresa set
    nome = coalesce(deusede.txt(p, 'nome'), 'DEU SEDE!'),
    cnpj = deusede.txt(p, 'cnpj'),
    telefone = deusede.txt(p, 'telefone'),
    email = deusede.txt(p, 'email'),
    endereco = deusede.txt(p, 'endereco')
  where id
  returning * into r;
  return to_jsonb(r);
end $$;
