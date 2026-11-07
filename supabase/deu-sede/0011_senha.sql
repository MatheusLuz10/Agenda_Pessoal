-- =====================================================================
-- DEU SEDE! — Migração 0011: senha de 4 dígitos das áreas sensíveis
--
-- Trava de tela para uso compartilhado (ex.: o caixa usa o PDV e não
-- entra em relatórios, compras ou configurações sem a senha).
-- A senha nunca é guardada: só o hash (sha256 com sal). A tabela não é
-- legível pela API; tudo passa pelas funções abaixo.
-- =====================================================================

create table if not exists deusede.seguranca (
  id boolean primary key default true check (id),
  pin_hash text,
  pin_sal text,
  areas text[] not null default array[
    'painel', 'fornecedores', 'cotacoes', 'comparacao', 'pedidos', 'relatorios', 'configuracoes',
    'produtos_editar', 'estoque_ajuste', 'cancelar_venda', 'pdv_desconto'
  ],
  atualizado_em timestamptz not null default now()
);
insert into deusede.seguranca (id) values (true) on conflict (id) do nothing;

alter table deusede.seguranca enable row level security;
revoke all on deusede.seguranca from anon, authenticated;
grant all on deusede.seguranca to service_role;

create or replace function deusede.hash_senha(p_sal text, p_pin text)
returns text language sql immutable as $$
  select encode(sha256(convert_to(p_sal || ':' || p_pin, 'UTF8')), 'hex')
$$;

-- Situação da senha (sem revelar nada dela).
create or replace function deusede.config_senha(p jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path = deusede as $$
declare s deusede.seguranca;
begin
  if not deusede.pode_ler() then return null; end if;
  select * into s from deusede.seguranca where id;
  return jsonb_build_object(
    'definida', s.pin_hash is not null,
    -- configurações ficam sempre protegidas
    'areas', to_jsonb(array(select distinct unnest(s.areas || array['configuracoes']))),
    'atualizado_em', s.atualizado_em
  );
end $$;

create or replace function deusede.verificar_senha(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = deusede as $$
declare s deusede.seguranca;
begin
  if not deusede.pode_ler() then raise exception 'Seu usuário não tem acesso ao DEU SEDE!.'; end if;
  select * into s from deusede.seguranca where id;
  if s.pin_hash is null then return jsonb_build_object('ok', true, 'definida', false); end if;
  return jsonb_build_object('ok', s.pin_hash = deusede.hash_senha(s.pin_sal, coalesce(deusede.txt(p, 'pin'), '')), 'definida', true);
end $$;

-- Cria/troca a senha e escolhe as áreas protegidas (só administrador).
-- Com senha já criada, exige a senha atual.
create or replace function deusede.salvar_seguranca(p jsonb)
returns jsonb language plpgsql security definer set search_path = deusede as $$
declare
  s deusede.seguranca;
  v_novo text := deusede.txt(p, 'pin_novo');
  v_sal text;
  v_permitidas text[] := array[
    'painel', 'fornecedores', 'cotacoes', 'comparacao', 'pedidos', 'relatorios', 'configuracoes',
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
end $$;
