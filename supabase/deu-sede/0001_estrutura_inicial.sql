-- =====================================================================
-- DEU SEDE! — Gestão de Compras
-- Migração 0001: estrutura inicial (Etapa 1)
--
-- Roda no MESMO projeto Supabase da Agenda Pessoal, mas tudo fica no
-- esquema próprio "deusede": nenhuma tabela, função ou permissão da
-- Agenda (esquema public) é criada, alterada ou removida aqui.
--
-- Como aplicar: SQL Editor -> colar este arquivo inteiro -> Run. Depois,
-- em Project Settings -> Data API -> Exposed schemas, adicione "deusede".
-- Pode rodar de novo sem problema (idempotente).
--
-- Tabelas, relacionamentos, travas de integridade, auditoria e RLS.
-- As operações de negócio de várias tabelas ao mesmo tempo (gerar pedidos
-- separados por fornecedor, registrar recebimento etc.) entram como
-- funções atômicas nas migrações das etapas 3, 5 e 6.
--
-- Convenções:
--   * ids uuid; número legível sequencial (COT-00001, PED-00001, REC-00001)
--   * created_at/updated_at em tudo que pode mudar
--   * valores em numeric (nunca float); quantidades de embalagens numeric(12,3)
--   * cotações e pedidos guardam CÓPIA dos dados do produto/fornecedor e dos
--     preços: mudar o cadastro depois não altera o passado
--   * nada histórico é excluído: cancela-se com justificativa
-- =====================================================================

create schema if not exists deusede;

-- ---------------------------------------------------------------------
-- 1. Utilitários
-- ---------------------------------------------------------------------

create or replace function deusede.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create or replace function deusede.formatar_numero(prefixo text, n bigint)
returns text language sql immutable as $$
  select prefixo || '-' || lpad(n::text, 5, '0')
$$;

-- Tipos de embalagem aceitos em produtos, cotações e pedidos.
create or replace function deusede.embalagem_valida(tipo text)
returns boolean language sql immutable as $$
  select tipo in ('caixa', 'fardo', 'pack', 'engradado', 'garrafao', 'unidade', 'outro')
$$;

-- ---------------------------------------------------------------------
-- 2. Usuários e níveis de acesso
--    admin      -> tudo (inclusive usuários e configurações)
--    comprador  -> cadastros, cotações, pedidos e recebimentos
--    conferente -> consulta + registra recebimentos
--    consulta   -> só leitura
-- ---------------------------------------------------------------------

create table if not exists deusede.perfis (
  -- Para tirar o acesso de alguém, prefira desativar (ativo = false).
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null default '',
  papel text not null default 'consulta'
    check (papel in ('admin', 'comprador', 'conferente', 'consulta')),
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function deusede.papel_atual()
returns text language sql stable security definer set search_path = deusede as $$
  select papel from deusede.perfis where id = auth.uid() and ativo
$$;

create or replace function deusede.pode_ler()
returns boolean language sql stable as $$
  select deusede.papel_atual() is not null
$$;

create or replace function deusede.pode_editar()
returns boolean language sql stable as $$
  select coalesce(deusede.papel_atual() in ('admin', 'comprador'), false)
$$;

create or replace function deusede.pode_receber()
returns boolean language sql stable as $$
  select coalesce(deusede.papel_atual() in ('admin', 'comprador', 'conferente'), false)
$$;

create or replace function deusede.e_admin()
returns boolean language sql stable as $$
  select coalesce(deusede.papel_atual() = 'admin', false)
$$;

-- O banco é o mesmo da Agenda Pessoal, então ter login NÃO dá acesso ao
-- DEU SEDE!: só entra quem tem perfil aqui. Na primeira execução, o
-- usuário mais antigo do projeto (o dono da Agenda) vira admin. Outras
-- pessoas são liberadas depois, com um perfil criado pelo admin:
--   insert into deusede.perfis (id, nome, papel)
--   select id, 'Nome', 'comprador' from auth.users where email = 'pessoa@exemplo.com';
insert into deusede.perfis (id, nome, papel)
select u.id, split_part(coalesce(u.email, ''), '@', 1), 'admin'
from auth.users u
where not exists (select 1 from deusede.perfis where papel = 'admin')
order by u.created_at
limit 1
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 3. Auditoria (somente inclusão)
-- ---------------------------------------------------------------------

create table if not exists deusede.eventos (
  id bigint generated always as identity primary key,
  entidade text not null check (entidade in ('cotacao', 'pedido', 'recebimento')),
  entidade_id uuid not null,
  acao text not null,
  status_anterior text,
  status_novo text,
  detalhe text,
  usuario_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists eventos_entidade_idx on deusede.eventos (entidade, entidade_id, created_at);

-- ---------------------------------------------------------------------
-- 4. Cadastros: categorias, produtos, fornecedores
-- ---------------------------------------------------------------------

create table if not exists deusede.categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  ordem integer not null default 100,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create unique index if not exists categorias_nome_uk on deusede.categorias (lower(trim(nome)));

-- Categorias iniciais definidas no escopo do sistema (não são dados fictícios).
insert into deusede.categorias (nome, ordem) values
  ('Cervejas', 10), ('Refrigerantes', 20), ('Águas', 30), ('Sucos', 40),
  ('Energéticos', 50), ('Descartáveis', 60), ('Outros', 999)
on conflict ((lower(trim(nome)))) do nothing;

create table if not exists deusede.produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  categoria_id uuid not null references deusede.categorias (id) on delete restrict,
  marca text,
  codigo text,
  -- Embalagem PADRÃO; cada cotação/pedido registra a embalagem negociada.
  tipo_embalagem text not null default 'caixa' check (deusede.embalagem_valida(tipo_embalagem)),
  unidades_por_embalagem integer not null default 1 check (unidades_por_embalagem > 0),
  volume_por_unidade numeric(12, 3) check (volume_por_unidade > 0),
  unidade_medida text check (unidade_medida in ('ml', 'l', 'g', 'kg', 'un')),
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create unique index if not exists produtos_codigo_uk
  on deusede.produtos (lower(trim(codigo))) where codigo is not null and trim(codigo) <> '';
-- Mesmo nome + marca + volume = mesmo produto (embalagem não cria produto novo).
create unique index if not exists produtos_identidade_uk on deusede.produtos (
  lower(trim(nome)), lower(trim(coalesce(marca, ''))), coalesce(volume_por_unidade, 0), coalesce(unidade_medida, '')
);
create index if not exists produtos_categoria_idx on deusede.produtos (categoria_id);

create table if not exists deusede.fornecedores (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) > 0),
  vendedor text,
  telefone text,
  whatsapp text check (whatsapp ~ '^[0-9]{10,13}$'),   -- só dígitos, com DDD (55 opcional)
  cnpj text check (cnpj ~ '^[0-9]{14}$'),              -- só dígitos
  endereco text,
  email text,
  condicoes_comerciais text,
  observacoes text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create unique index if not exists fornecedores_nome_uk on deusede.fornecedores (lower(trim(nome)));
create unique index if not exists fornecedores_cnpj_uk on deusede.fornecedores (cnpj) where cnpj is not null;

-- Produtos que cada fornecedor comercializa, com o preço ATUAL. Os preços
-- antigos ficam em historico_precos; cotações e pedidos têm cópia própria.
create table if not exists deusede.fornecedor_produtos (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id uuid not null references deusede.fornecedores (id) on delete restrict,
  produto_id uuid not null references deusede.produtos (id) on delete restrict,
  codigo_no_fornecedor text,
  tipo_embalagem text not null check (deusede.embalagem_valida(tipo_embalagem)),
  unidades_por_embalagem integer not null check (unidades_por_embalagem > 0),
  preco_atual numeric(14, 2) check (preco_atual >= 0),
  preco_atualizado_em timestamptz,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (fornecedor_id, produto_id, tipo_embalagem, unidades_por_embalagem)
);
create index if not exists fornecedor_produtos_produto_idx on deusede.fornecedor_produtos (produto_id);

-- ---------------------------------------------------------------------
-- 5. Cotações (orçamentos) — NÃO são compras
-- ---------------------------------------------------------------------

create sequence if not exists deusede.cotacoes_numero_seq;

create table if not exists deusede.cotacoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('deusede.cotacoes_numero_seq'),
  fornecedor_id uuid not null references deusede.fornecedores (id) on delete restrict,
  data_cotacao date not null default current_date,
  validade date,
  status text not null default 'em_elaboracao' check (status in (
    'em_elaboracao', 'aguardando_fornecedor', 'recebida', 'em_analise', 'aprovada', 'rejeitada', 'expirada'
  )),
  frete numeric(14, 2) not null default 0 check (frete >= 0),
  desconto_geral numeric(14, 2) not null default 0 check (desconto_geral >= 0),
  condicao_pagamento text,
  prazo_entrega text,
  observacoes text,
  motivo_status text,  -- ex.: motivo da rejeição
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (validade is null or validade >= data_cotacao)
);
create index if not exists cotacoes_fornecedor_idx on deusede.cotacoes (fornecedor_id, data_cotacao desc);
create index if not exists cotacoes_status_idx on deusede.cotacoes (status);

create table if not exists deusede.cotacao_itens (
  id uuid primary key default gen_random_uuid(),
  cotacao_id uuid not null references deusede.cotacoes (id) on delete cascade,
  produto_id uuid not null references deusede.produtos (id) on delete restrict,
  -- cópia do produto no momento da cotação
  produto_nome text not null,
  tipo_embalagem text not null check (deusede.embalagem_valida(tipo_embalagem)),
  unidades_por_embalagem integer not null check (unidades_por_embalagem > 0),
  quantidade_embalagens numeric(12, 3) not null check (quantidade_embalagens > 0),
  preco_embalagem numeric(14, 2) not null check (preco_embalagem >= 0),
  desconto_valor numeric(14, 2) not null default 0 check (desconto_valor >= 0),
  subtotal numeric(14, 2) generated always as (
    round(quantidade_embalagens * preco_embalagem - desconto_valor, 2)
  ) stored,
  -- preço por UNIDADE já com o desconto do item: base da comparação entre fornecedores
  preco_unitario numeric(14, 4) generated always as (
    round((quantidade_embalagens * preco_embalagem - desconto_valor) / (quantidade_embalagens * unidades_por_embalagem), 4)
  ) stored,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (desconto_valor <= quantidade_embalagens * preco_embalagem),
  unique (cotacao_id, produto_id, tipo_embalagem, unidades_por_embalagem)
);
create index if not exists cotacao_itens_produto_idx on deusede.cotacao_itens (produto_id);

-- ---------------------------------------------------------------------
-- 6. Pedidos de compra
-- ---------------------------------------------------------------------

create sequence if not exists deusede.pedidos_numero_seq;

create table if not exists deusede.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('deusede.pedidos_numero_seq'),
  -- Pedidos gerados juntos no MONTAR PEDIDO compartilham o lote. O lote é
  -- gerado pela tela antes de enviar: repetir o clique reutiliza o mesmo
  -- lote e a restrição única abaixo impede pedido duplicado.
  lote_id uuid not null default gen_random_uuid(),
  fornecedor_id uuid not null references deusede.fornecedores (id) on delete restrict,
  cotacao_id uuid references deusede.cotacoes (id) on delete restrict,
  status text not null default 'em_elaboracao' check (status in (
    'em_elaboracao', 'aguardando_aprovacao', 'aprovado', 'enviado', 'confirmado',
    'em_transporte', 'parcialmente_recebido', 'recebido', 'cancelado'
  )),
  data_pedido date not null default current_date,
  previsao_entrega date,
  condicao_pagamento text,
  frete numeric(14, 2) not null default 0 check (frete >= 0),
  desconto_geral numeric(14, 2) not null default 0 check (desconto_geral >= 0),
  observacoes text,
  -- cópia do fornecedor no momento do pedido
  fornecedor_nome text not null,
  fornecedor_whatsapp text,
  enviado_em timestamptz,
  concluido_em timestamptz,
  cancelado_em timestamptz,
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (lote_id, fornecedor_id),
  check (status <> 'cancelado' or length(trim(coalesce(motivo_cancelamento, ''))) >= 5)
);
create index if not exists pedidos_fornecedor_idx on deusede.pedidos (fornecedor_id, data_pedido desc);
create index if not exists pedidos_status_idx on deusede.pedidos (status);
create index if not exists pedidos_cotacao_idx on deusede.pedidos (cotacao_id);

create table if not exists deusede.pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references deusede.pedidos (id) on delete cascade,
  produto_id uuid not null references deusede.produtos (id) on delete restrict,
  cotacao_item_id uuid references deusede.cotacao_itens (id) on delete restrict,
  -- cópia do produto e do preço negociado
  produto_nome text not null,
  tipo_embalagem text not null check (deusede.embalagem_valida(tipo_embalagem)),
  unidades_por_embalagem integer not null check (unidades_por_embalagem > 0),
  quantidade_embalagens numeric(12, 3) not null check (quantidade_embalagens > 0),
  preco_embalagem numeric(14, 2) not null check (preco_embalagem >= 0),
  desconto_valor numeric(14, 2) not null default 0 check (desconto_valor >= 0),
  subtotal numeric(14, 2) generated always as (
    round(quantidade_embalagens * preco_embalagem - desconto_valor, 2)
  ) stored,
  preco_unitario numeric(14, 4) generated always as (
    round((quantidade_embalagens * preco_embalagem - desconto_valor) / (quantidade_embalagens * unidades_por_embalagem), 4)
  ) stored,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (desconto_valor <= quantidade_embalagens * preco_embalagem),
  unique (pedido_id, produto_id, tipo_embalagem, unidades_por_embalagem)
);
create index if not exists pedido_itens_produto_idx on deusede.pedido_itens (produto_id);
create index if not exists pedido_itens_cotacao_item_idx on deusede.pedido_itens (cotacao_item_id);

-- ---------------------------------------------------------------------
-- 7. Recebimentos (conferência; sem controle de estoque nesta versão)
-- ---------------------------------------------------------------------

create sequence if not exists deusede.recebimentos_numero_seq;

create table if not exists deusede.recebimentos (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('deusede.recebimentos_numero_seq'),
  pedido_id uuid not null references deusede.pedidos (id) on delete restrict,
  data_recebimento date not null default current_date,
  nota_fiscal text,
  observacoes text,
  -- gerada pela tela: reenviar o mesmo formulário não duplica o recebimento
  chave_idempotencia uuid not null unique default gen_random_uuid(),
  cancelado_em timestamptz,
  motivo_cancelamento text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (cancelado_em is null or length(trim(coalesce(motivo_cancelamento, ''))) >= 5)
);
create index if not exists recebimentos_pedido_idx on deusede.recebimentos (pedido_id);

create table if not exists deusede.recebimento_itens (
  id uuid primary key default gen_random_uuid(),
  recebimento_id uuid not null references deusede.recebimentos (id) on delete restrict,
  pedido_item_id uuid not null references deusede.pedido_itens (id) on delete restrict,
  quantidade_recebida numeric(12, 3) not null default 0 check (quantidade_recebida >= 0),
  quantidade_danificada numeric(12, 3) not null default 0
    check (quantidade_danificada >= 0 and quantidade_danificada <= quantidade_recebida),
  preco_cobrado numeric(14, 2) check (preco_cobrado >= 0),  -- preencher só se diferente do pedido
  observacoes text,
  created_at timestamptz not null default now(),
  unique (recebimento_id, pedido_item_id)
);
create index if not exists recebimento_itens_pedido_item_idx on deusede.recebimento_itens (pedido_item_id);

-- ---------------------------------------------------------------------
-- 8. Histórico de preços (permanente, somente inclusão)
-- ---------------------------------------------------------------------

create table if not exists deusede.historico_precos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references deusede.produtos (id) on delete restrict,
  fornecedor_id uuid not null references deusede.fornecedores (id) on delete restrict,
  origem text not null check (origem in ('cotacao', 'manual', 'pedido')),
  cotacao_item_id uuid unique references deusede.cotacao_itens (id) on delete restrict,
  pedido_item_id uuid unique references deusede.pedido_itens (id) on delete restrict,
  data_referencia date not null,
  tipo_embalagem text not null check (deusede.embalagem_valida(tipo_embalagem)),
  unidades_por_embalagem integer not null check (unidades_por_embalagem > 0),
  preco_embalagem numeric(14, 2) not null check (preco_embalagem >= 0),
  preco_unitario numeric(14, 4) generated always as (round(preco_embalagem / unidades_por_embalagem, 4)) stored,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index if not exists historico_precos_produto_idx
  on deusede.historico_precos (produto_id, fornecedor_id, data_referencia desc);

-- ---------------------------------------------------------------------
-- 9. Dados da empresa (cabeçalho de PDFs e mensagens) — linha única
-- ---------------------------------------------------------------------

create table if not exists deusede.configuracoes_empresa (
  id boolean primary key default true check (id),
  nome text not null default 'DEU SEDE!',
  cnpj text,
  telefone text,
  email text,
  endereco text,
  updated_at timestamptz not null default now()
);
insert into deusede.configuracoes_empresa (id) values (true) on conflict (id) do nothing;

-- =====================================================================
-- 10. Regras de negócio no banco (valem para qualquer tela ou integração)
-- =====================================================================

create or replace function deusede.cotacao_editavel(status text)
returns boolean language sql immutable as $$
  select status in ('em_elaboracao', 'aguardando_fornecedor')
$$;

create or replace function deusede.cotacao_transicao_valida(de text, para text)
returns boolean language sql immutable as $$
  select (de, para) in (
    ('em_elaboracao', 'aguardando_fornecedor'), ('em_elaboracao', 'recebida'),
    ('aguardando_fornecedor', 'em_elaboracao'), ('aguardando_fornecedor', 'recebida'),
    ('aguardando_fornecedor', 'expirada'),
    ('recebida', 'em_analise'), ('recebida', 'aprovada'), ('recebida', 'rejeitada'), ('recebida', 'expirada'),
    ('em_analise', 'aprovada'), ('em_analise', 'rejeitada'), ('em_analise', 'expirada'),
    ('aprovada', 'expirada')
  )
$$;

create or replace function deusede.pedido_editavel(status text)
returns boolean language sql immutable as $$
  select status in ('em_elaboracao', 'aguardando_aprovacao')
$$;

create or replace function deusede.pedido_aceita_recebimento(status text)
returns boolean language sql immutable as $$
  select status in ('enviado', 'confirmado', 'em_transporte', 'parcialmente_recebido')
$$;

-- "Compra realizada" = pedido enviado ao fornecedor e não cancelado.
create or replace function deusede.pedido_conta_como_compra(status text)
returns boolean language sql immutable as $$
  select status in ('enviado', 'confirmado', 'em_transporte', 'parcialmente_recebido', 'recebido')
$$;

create or replace function deusede.pedido_transicao_valida(de text, para text)
returns boolean language sql immutable as $$
  select (de, para) in (
    ('em_elaboracao', 'aguardando_aprovacao'), ('em_elaboracao', 'aprovado'), ('em_elaboracao', 'cancelado'),
    ('aguardando_aprovacao', 'em_elaboracao'), ('aguardando_aprovacao', 'aprovado'), ('aguardando_aprovacao', 'cancelado'),
    ('aprovado', 'enviado'), ('aprovado', 'cancelado'),
    ('enviado', 'confirmado'), ('enviado', 'em_transporte'), ('enviado', 'parcialmente_recebido'),
    ('enviado', 'recebido'), ('enviado', 'cancelado'),
    ('confirmado', 'em_transporte'), ('confirmado', 'parcialmente_recebido'), ('confirmado', 'recebido'),
    ('confirmado', 'cancelado'),
    ('em_transporte', 'parcialmente_recebido'), ('em_transporte', 'recebido'), ('em_transporte', 'cancelado'),
    ('parcialmente_recebido', 'recebido')
  )
$$;

-- ---------- Cotações

create or replace function deusede.tg_cotacoes_regras()
returns trigger language plpgsql security definer set search_path = deusede as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'em_elaboracao' then
      raise exception 'Só cotações em elaboração podem ser excluídas. As demais ficam no histórico.';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    -- Os itens entram depois do cabeçalho; por isso a cotação não pode
    -- nascer já recebida (ficaria travada e sem itens).
    if new.status not in ('em_elaboracao', 'aguardando_fornecedor') then
      raise exception 'Uma cotação nova começa em elaboração ou aguardando fornecedor.';
    end if;
    return new;
  end if;

  if (new.numero, new.created_at, new.created_by) is distinct from (old.numero, old.created_at, old.created_by) then
    raise exception 'Número e criação da cotação não podem ser alterados.';
  end if;

  if not deusede.cotacao_editavel(old.status) and (
    new.fornecedor_id, new.data_cotacao, new.validade, new.frete, new.desconto_geral,
    new.condicao_pagamento, new.prazo_entrega
  ) is distinct from (
    old.fornecedor_id, old.data_cotacao, old.validade, old.frete, old.desconto_geral,
    old.condicao_pagamento, old.prazo_entrega
  ) then
    raise exception 'Cotação % já recebida: valores e condições ficam preservados. Duplique a cotação para registrar uma nova proposta.',
      deusede.formatar_numero('COT', old.numero);
  end if;

  if new.status <> old.status then
    if not deusede.cotacao_transicao_valida(old.status, new.status) then
      raise exception 'Mudança de status da cotação não permitida: % → %.', old.status, new.status;
    end if;
    if new.status in ('recebida', 'em_analise', 'aprovada')
       and not exists (select 1 from deusede.cotacao_itens where cotacao_id = new.id) then
      raise exception 'A cotação precisa ter ao menos um item.';
    end if;
    insert into deusede.eventos (entidade, entidade_id, acao, status_anterior, status_novo, detalhe)
    values ('cotacao', new.id, 'status_alterado', old.status, new.status, new.motivo_status);
  end if;

  return new;
end $$;

drop trigger if exists cotacoes_regras on deusede.cotacoes;
create trigger cotacoes_regras
  before insert or update or delete on deusede.cotacoes
  for each row execute function deusede.tg_cotacoes_regras();

create or replace function deusede.tg_cotacao_itens_trava()
returns trigger language plpgsql security definer set search_path = deusede as $$
declare
  v_status text;
begin
  if tg_op = 'UPDATE' and new.cotacao_id <> old.cotacao_id then
    raise exception 'Um item não pode mudar de cotação.';
  end if;
  select status into v_status from deusede.cotacoes where id = coalesce(new.cotacao_id, old.cotacao_id);
  -- v_status nulo = a própria cotação (rascunho) está sendo excluída
  if v_status is not null and not deusede.cotacao_editavel(v_status) then
    raise exception 'Cotação já recebida: os itens não podem mais ser alterados.';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists cotacao_itens_trava on deusede.cotacao_itens;
create trigger cotacao_itens_trava
  before insert or update or delete on deusede.cotacao_itens
  for each row execute function deusede.tg_cotacao_itens_trava();

-- ---------- Pedidos

create or replace function deusede.tg_pedidos_regras()
returns trigger language plpgsql security definer set search_path = deusede as $$
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
    new.cotacao_id, new.data_pedido, new.condicao_pagamento, new.frete, new.desconto_geral,
    new.fornecedor_nome, new.fornecedor_whatsapp
  ) is distinct from (
    old.cotacao_id, old.data_pedido, old.condicao_pagamento, old.frete, old.desconto_geral,
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
end $$;

drop trigger if exists pedidos_regras on deusede.pedidos;
create trigger pedidos_regras
  before insert or update or delete on deusede.pedidos
  for each row execute function deusede.tg_pedidos_regras();

create or replace function deusede.tg_pedido_itens_trava()
returns trigger language plpgsql security definer set search_path = deusede as $$
declare
  v_status text;
begin
  if tg_op = 'UPDATE' and new.pedido_id <> old.pedido_id then
    raise exception 'Um item não pode mudar de pedido.';
  end if;
  select status into v_status from deusede.pedidos where id = coalesce(new.pedido_id, old.pedido_id);
  if v_status is not null and not deusede.pedido_editavel(v_status) then
    raise exception 'Pedido já aprovado: os itens não podem mais ser alterados.';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists pedido_itens_trava on deusede.pedido_itens;
create trigger pedido_itens_trava
  before insert or update or delete on deusede.pedido_itens
  for each row execute function deusede.tg_pedido_itens_trava();

-- ---------- Recebimentos

create or replace function deusede.tg_recebimentos_regras()
returns trigger language plpgsql security definer set search_path = deusede as $$
declare
  v_status text;
  v_numero bigint;
begin
  if tg_op = 'DELETE' then
    raise exception 'Recebimentos não podem ser excluídos. Cancele com justificativa.';
  end if;

  select status, numero into v_status, v_numero from deusede.pedidos where id = coalesce(new.pedido_id, old.pedido_id);

  if tg_op = 'INSERT' then
    if not deusede.pedido_aceita_recebimento(v_status) then
      raise exception 'O pedido % precisa ter sido enviado ao fornecedor e não pode estar concluído (status: %).',
        deusede.formatar_numero('PED', v_numero), v_status;
    end if;
    if new.cancelado_em is not null then
      raise exception 'Um recebimento novo não pode nascer cancelado.';
    end if;
    insert into deusede.eventos (entidade, entidade_id, acao, detalhe)
    values ('pedido', new.pedido_id, 'recebimento_registrado', deusede.formatar_numero('REC', new.numero));
    return new;
  end if;

  -- UPDATE: o lançamento é imutável; só aceita observações e cancelamento.
  if old.cancelado_em is not null then
    raise exception 'Este recebimento já foi cancelado.';
  end if;
  if (new.numero, new.pedido_id, new.data_recebimento, new.nota_fiscal, new.chave_idempotencia, new.created_at, new.created_by)
     is distinct from
     (old.numero, old.pedido_id, old.data_recebimento, old.nota_fiscal, old.chave_idempotencia, old.created_at, old.created_by) then
    raise exception 'Recebimento registrado não pode ser alterado. Cancele com justificativa e registre de novo.';
  end if;
  if new.cancelado_em is not null then
    if v_status in ('recebido', 'cancelado') then
      raise exception 'O pedido já foi concluído: o recebimento não pode mais ser cancelado.';
    end if;
    insert into deusede.eventos (entidade, entidade_id, acao, detalhe)
    values ('pedido', new.pedido_id, 'recebimento_cancelado',
            deusede.formatar_numero('REC', new.numero) || ': ' || new.motivo_cancelamento);
  end if;
  return new;
end $$;

drop trigger if exists recebimentos_regras on deusede.recebimentos;
create trigger recebimentos_regras
  before insert or update or delete on deusede.recebimentos
  for each row execute function deusede.tg_recebimentos_regras();

create or replace function deusede.tg_recebimento_itens_regras()
returns trigger language plpgsql security definer set search_path = deusede as $$
declare
  v_pedido_recebimento uuid;
  v_pedido_item uuid;
  v_solicitado numeric;
  v_aceito numeric;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Itens de recebimento não podem ser alterados nem excluídos.';
  end if;

  select pedido_id into v_pedido_recebimento from deusede.recebimentos where id = new.recebimento_id;
  select pedido_id, quantidade_embalagens into v_pedido_item, v_solicitado
    from deusede.pedido_itens where id = new.pedido_item_id;
  if v_pedido_recebimento is distinct from v_pedido_item then
    raise exception 'O item não pertence ao pedido deste recebimento.';
  end if;

  select coalesce(sum(ri.quantidade_recebida - ri.quantidade_danificada), 0) into v_aceito
    from deusede.recebimento_itens ri
    join deusede.recebimentos r on r.id = ri.recebimento_id and r.cancelado_em is null
   where ri.pedido_item_id = new.pedido_item_id;

  if v_aceito + new.quantidade_recebida - new.quantidade_danificada > v_solicitado then
    raise exception 'Quantidade recebida maior que a pendente (pendente: %).', trim_scale(v_solicitado - v_aceito);
  end if;
  return new;
end $$;

drop trigger if exists recebimento_itens_regras on deusede.recebimento_itens;
create trigger recebimento_itens_regras
  before insert or update or delete on deusede.recebimento_itens
  for each row execute function deusede.tg_recebimento_itens_regras();

-- ---------- Tabelas somente-inclusão

create or replace function deusede.tg_somente_inclusao()
returns trigger language plpgsql as $$
begin
  raise exception 'Registros de % são permanentes e não podem ser alterados nem excluídos.', tg_table_name;
end $$;

drop trigger if exists historico_precos_imutavel on deusede.historico_precos;
create trigger historico_precos_imutavel
  before update or delete on deusede.historico_precos
  for each row execute function deusede.tg_somente_inclusao();

drop trigger if exists eventos_imutavel on deusede.eventos;
create trigger eventos_imutavel
  before update or delete on deusede.eventos
  for each row execute function deusede.tg_somente_inclusao();

-- ---------- updated_at automático

do $$
declare t text;
begin
  foreach t in array array[
    'perfis', 'categorias', 'produtos', 'fornecedores', 'fornecedor_produtos',
    'cotacoes', 'cotacao_itens', 'pedidos', 'pedido_itens', 'configuracoes_empresa'
  ] loop
    execute format('drop trigger if exists set_updated_at on deusede.%I', t);
    execute format(
      'create trigger set_updated_at before update on deusede.%I for each row execute function deusede.tg_set_updated_at()', t
    );
  end loop;
end $$;

-- =====================================================================
-- 11. Visões com totais (calculados sempre a partir dos itens)
--     security_invoker: a visão respeita o RLS de quem consulta.
-- =====================================================================

create or replace view deusede.vw_cotacoes with (security_invoker = true) as
select
  c.*,
  deusede.formatar_numero('COT', c.numero) as numero_formatado,
  f.nome as fornecedor_nome,
  coalesce(t.qtd_itens, 0) as qtd_itens,
  coalesce(t.valor_bruto, 0) as valor_bruto,
  coalesce(t.desconto_itens, 0) + c.desconto_geral as total_descontos,
  coalesce(t.valor_bruto, 0) - coalesce(t.desconto_itens, 0) - c.desconto_geral + c.frete as valor_total,
  (c.validade is not null and c.validade < current_date) as vencida
from deusede.cotacoes c
join deusede.fornecedores f on f.id = c.fornecedor_id
left join lateral (
  select count(*) as qtd_itens,
         sum(round(i.quantidade_embalagens * i.preco_embalagem, 2)) as valor_bruto,
         sum(i.desconto_valor) as desconto_itens
    from deusede.cotacao_itens i
   where i.cotacao_id = c.id
) t on true;

create or replace view deusede.vw_pedido_itens_saldo with (security_invoker = true) as
select
  pi.*,
  coalesce(r.recebido, 0) as quantidade_recebida,
  coalesce(r.danificado, 0) as quantidade_danificada,
  coalesce(r.recebido, 0) - coalesce(r.danificado, 0) as quantidade_aceita,
  greatest(pi.quantidade_embalagens - (coalesce(r.recebido, 0) - coalesce(r.danificado, 0)), 0) as quantidade_pendente,
  round(pi.subtotal * (coalesce(r.recebido, 0) - coalesce(r.danificado, 0)) / pi.quantidade_embalagens, 2) as valor_recebido,
  r.maior_preco_cobrado
from deusede.pedido_itens pi
left join lateral (
  select sum(ri.quantidade_recebida) as recebido,
         sum(ri.quantidade_danificada) as danificado,
         max(ri.preco_cobrado) as maior_preco_cobrado
    from deusede.recebimento_itens ri
    join deusede.recebimentos rc on rc.id = ri.recebimento_id and rc.cancelado_em is null
   where ri.pedido_item_id = pi.id
) r on true;

create or replace view deusede.vw_pedidos with (security_invoker = true) as
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

-- =====================================================================
-- 12. Segurança: RLS em todas as tabelas
--     Sem login (anon) não se lê nem grava nada. Sem política de DELETE
--     onde o histórico precisa ser preservado.
-- =====================================================================

alter table deusede.perfis enable row level security;
alter table deusede.eventos enable row level security;
alter table deusede.categorias enable row level security;
alter table deusede.produtos enable row level security;
alter table deusede.fornecedores enable row level security;
alter table deusede.fornecedor_produtos enable row level security;
alter table deusede.cotacoes enable row level security;
alter table deusede.cotacao_itens enable row level security;
alter table deusede.pedidos enable row level security;
alter table deusede.pedido_itens enable row level security;
alter table deusede.recebimentos enable row level security;
alter table deusede.recebimento_itens enable row level security;
alter table deusede.historico_precos enable row level security;
alter table deusede.configuracoes_empresa enable row level security;

-- Perfis: cada um vê o seu; o admin vê e gerencia todos.
drop policy if exists perfis_select on deusede.perfis;
create policy perfis_select on deusede.perfis for select to authenticated
  using (id = auth.uid() or deusede.e_admin());
drop policy if exists perfis_update on deusede.perfis;
create policy perfis_update on deusede.perfis for update to authenticated
  using (deusede.e_admin()) with check (deusede.e_admin());

-- Leitura para qualquer perfil ativo
do $$
declare t text;
begin
  foreach t in array array[
    'eventos', 'categorias', 'produtos', 'fornecedores', 'fornecedor_produtos', 'cotacoes', 'cotacao_itens',
    'pedidos', 'pedido_itens', 'recebimentos', 'recebimento_itens', 'historico_precos', 'configuracoes_empresa'
  ] loop
    execute format('drop policy if exists %I on deusede.%I', t || '_select', t);
    execute format('create policy %I on deusede.%I for select to authenticated using (deusede.pode_ler())', t || '_select', t);
  end loop;
end $$;

-- Inclusão e alteração para admin/comprador
do $$
declare t text;
begin
  foreach t in array array[
    'categorias', 'produtos', 'fornecedores', 'fornecedor_produtos',
    'cotacoes', 'cotacao_itens', 'pedidos', 'pedido_itens'
  ] loop
    execute format('drop policy if exists %I on deusede.%I', t || '_insert', t);
    execute format('create policy %I on deusede.%I for insert to authenticated with check (deusede.pode_editar())', t || '_insert', t);
    execute format('drop policy if exists %I on deusede.%I', t || '_update', t);
    execute format(
      'create policy %I on deusede.%I for update to authenticated using (deusede.pode_editar()) with check (deusede.pode_editar())',
      t || '_update', t
    );
  end loop;
end $$;

-- Exclusão só do que não é histórico: cadastros nunca usados (as chaves
-- estrangeiras barram os já usados), rascunhos de cotação e itens de
-- rascunho (os gatilhos acima barram o resto).
do $$
declare t text;
begin
  foreach t in array array['categorias', 'produtos', 'fornecedores', 'fornecedor_produtos', 'cotacoes', 'cotacao_itens', 'pedido_itens']
  loop
    execute format('drop policy if exists %I on deusede.%I', t || '_delete', t);
    execute format('create policy %I on deusede.%I for delete to authenticated using (deusede.pode_editar())', t || '_delete', t);
  end loop;
end $$;

-- Recebimentos: conferente também registra; cancelar é com admin/comprador.
drop policy if exists recebimentos_insert on deusede.recebimentos;
create policy recebimentos_insert on deusede.recebimentos for insert to authenticated
  with check (deusede.pode_receber());
drop policy if exists recebimentos_update on deusede.recebimentos;
create policy recebimentos_update on deusede.recebimentos for update to authenticated
  using (deusede.pode_editar()) with check (deusede.pode_editar());
drop policy if exists recebimento_itens_insert on deusede.recebimento_itens;
create policy recebimento_itens_insert on deusede.recebimento_itens for insert to authenticated
  with check (deusede.pode_receber());

-- Histórico de preços: inclusão por admin/comprador; nunca altera/exclui.
drop policy if exists historico_precos_insert on deusede.historico_precos;
create policy historico_precos_insert on deusede.historico_precos for insert to authenticated
  with check (deusede.pode_editar());

-- Dados da empresa: só o admin altera.
drop policy if exists configuracoes_empresa_update on deusede.configuracoes_empresa;
create policy configuracoes_empresa_update on deusede.configuracoes_empresa for update to authenticated
  using (deusede.e_admin()) with check (deusede.e_admin());

-- =====================================================================
-- 13. Acesso ao esquema pela API do Supabase
--     Só usuários logados (e o service_role do servidor). O anônimo não
--     enxerga o esquema; o RLS acima ainda filtra por perfil.
-- =====================================================================

grant usage on schema deusede to authenticated, service_role;
grant select, insert, update, delete on all tables in schema deusede to authenticated;
grant all on all tables in schema deusede to service_role;
grant usage, select on all sequences in schema deusede to authenticated, service_role;
alter default privileges in schema deusede grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema deusede grant all on tables to service_role;
alter default privileges in schema deusede grant usage, select on sequences to authenticated, service_role;

revoke all on schema deusede from anon;
revoke all on all tables in schema deusede from anon;
