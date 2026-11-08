// Testa as migrações do DEU SEDE! (supabase/deu-sede/*.sql) num Postgres
// local (PGlite), com um "auth" e uma tabela da Agenda simulados como no
// Supabase. Não precisa de internet nem do banco real.
//   npm run test:deu-sede
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const dir = new URL("./", import.meta.url);
const migration = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(new URL(f, dir), "utf8"))
  .join("\n");
const db = new PGlite();

let ok = 0;
let fail = 0;
function pass(msg) { ok++; console.log("  ✔", msg); }
function bad(msg, extra = "") { fail++; console.log("  ✘", msg, extra); }

async function expectOk(msg, sql, params) {
  try { const r = await db.query(sql, params); pass(msg); return r; }
  catch (e) { bad(msg, "-> " + e.message); return null; }
}
async function expectErr(msg, sql, pattern, params) {
  try { await db.query(sql, params); bad(msg, "-> NÃO deu erro"); }
  catch (e) {
    if (!pattern || pattern.test(e.message)) pass(`${msg}  [${e.message}]`);
    else bad(msg, "-> erro diferente: " + e.message);
  }
}
// Como usuário: RLS ignora (0 linhas). Como superusuário: o gatilho barra com erro.
async function zeroRows(msg, sql, params, pattern) {
  const r = await db.query(sql, params);
  r.affectedRows === 0 ? pass(msg + ' — RLS: 0 linhas') : bad(msg + ' — RLS', r.affectedRows + ' linhas');
  await asSuper();
  await expectErr(msg + ' — gatilho, mesmo p/ superusuário', sql, pattern, params);
  await as('00000000-0000-0000-0000-0000000000aa');
}
async function one(sql, params) { return (await db.query(sql, params)).rows[0]; }
async function as(userId) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${userId ?? ""}', false);`);
  await db.exec(userId ? "set role authenticated" : "set role anon");
}
async function asSuper() { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);"); }


const ADMIN = "00000000-0000-0000-0000-0000000000aa";
const OUTRO_ANTIGO = "00000000-0000-0000-0000-0000000000a2";
const LEITOR = "00000000-0000-0000-0000-0000000000bb";
const SEM_PERFIL = "00000000-0000-0000-0000-0000000000cc";

// --- Simula o Supabase com a Agenda Pessoal já instalada
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(), email text,
    raw_user_meta_data jsonb default '{}', created_at timestamptz default now()
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  -- usuários que já existiam na Agenda (o mais antigo é o dono)
  insert into auth.users (id, email, created_at) values
    ('${ADMIN}', 'dono@agenda.local', '2025-01-01'),
    ('${OUTRO_ANTIGO}', 'outro@agenda.local', '2025-06-01');
  -- tabela da Agenda usada pela página pública (acesso anônimo)
  create table public.service_requests (id serial primary key, descricao text);
  grant usage on schema public to anon, authenticated;
  grant select, insert on public.service_requests to anon;
  grant usage on all sequences in schema public to anon;
`);

console.log("\n1) Migração");
try { await db.exec(migration); pass("roda do zero"); }
catch (e) { bad("roda do zero", `-> ${e.message} | ${e.where ?? ""}`); process.exit(1); }
try { await db.exec(migration); pass("roda de novo sem erro (idempotente)"); }
catch (e) { bad("idempotente", `-> ${e.message} | ${e.where ?? ""}`); }
await db.exec("set search_path = deusede, public");

console.log("\n2) Usuários e papéis");
const perfis = (await db.query("select id, papel from deusede.perfis order by id")).rows;
perfis.length === 1 && perfis[0].id === ADMIN && perfis[0].papel === "admin"
  ? pass("só o usuário mais antigo da Agenda (o dono) virou admin, mesmo rodando 2x")
  : bad("admin inicial", JSON.stringify(perfis));
await db.exec(`insert into auth.users (id, email) values ('${LEITOR}', 'leitura@agenda.local'), ('${SEM_PERFIL}', 'sem@agenda.local')`);
const novos = await one("select count(*)::int n from deusede.perfis");
novos.n === 1 ? pass("usuário novo da Agenda não ganha acesso ao DEU SEDE! sozinho") : bad("perfil automático", novos.n);
await db.exec(`insert into deusede.perfis (id, nome, papel) values ('${LEITOR}', 'Leitor', 'consulta')`);
const cats = await one("select count(*)::int n from deusede.categorias");
cats.n === 7 ? pass("7 categorias iniciais (sem duplicar na 2ª execução)") : bad("categorias", cats.n);

console.log("\n3) Cadastros");
await as(ADMIN);
const f1 = (await expectOk("admin cadastra fornecedor",
  `insert into fornecedores (nome, whatsapp, cnpj) values ('Teste Fornecedor 1', '11999990000', '12345678000190') returning id`))?.rows[0].id;
await expectErr("CNPJ duplicado bloqueado",
  `insert into fornecedores (nome, cnpj) values ('Outro', '12345678000190')`, /duplicate key/);
await expectErr("nome de fornecedor duplicado (maiúsc./espaços) bloqueado",
  `insert into fornecedores (nome) values ('  teste fornecedor 1 ')`, /duplicate key/);
await expectErr("WhatsApp com letras bloqueado",
  `insert into fornecedores (nome, whatsapp) values ('X', '(11) 9999-0000')`, /check constraint/);
const cat = (await one("select id from categorias where nome = 'Cervejas'")).id;
const p1 = (await expectOk("admin cadastra produto",
  `insert into produtos (nome, categoria_id, marca, tipo_embalagem, unidades_por_embalagem, volume_por_unidade, unidade_medida)
   values ('Produto Teste Lata', $1, 'Marca T', 'caixa', 12, 269, 'ml') returning id`, [cat]))?.rows[0].id;
await expectErr("mesmo produto (nome+marca+volume) não duplica",
  `insert into produtos (nome, categoria_id, marca, volume_por_unidade, unidade_medida, unidades_por_embalagem)
   values ('produto teste lata', $1, 'MARCA T', 269, 'ml', 15)`, /duplicate key/, [cat]);

console.log("\n4) Cotação");
const c1 = (await expectOk("cria cotação", `insert into cotacoes (fornecedor_id, frete) values ($1, 25) returning id`, [f1]))?.rows[0].id;
const ci = (await expectOk("adiciona item (10 cx × R$ 39,90, desconto R$ 9,00)",
  `insert into cotacao_itens (cotacao_id, produto_id, produto_nome, tipo_embalagem, unidades_por_embalagem,
     quantidade_embalagens, preco_embalagem, desconto_valor)
   values ($1, $2, 'Produto Teste Lata', 'caixa', 12, 10, 39.90, 9) returning id, subtotal, preco_unitario`, [c1, p1]))?.rows[0];
ci && Number(ci.subtotal) === 390 ? pass("subtotal = 399,00 − 9,00 = 390,00") : bad("subtotal", ci?.subtotal);
ci && Number(ci.preco_unitario) === 3.25 ? pass("preço por unidade = 390 / 120 = 3,25") : bad("preço unitário", ci?.preco_unitario);
const vc = await one("select valor_bruto, total_descontos, valor_total, numero_formatado from vw_cotacoes where id = $1", [c1]);
Number(vc.valor_total) === 415 ? pass(`total da cotação ${vc.numero_formatado} = 390 + 25 frete = 415`) : bad("total cotação", JSON.stringify(vc));
await expectErr("pula status inválido (em elaboração → aprovada)",
  `update cotacoes set status = 'aprovada' where id = $1`, /não permitida/, [c1]);
await expectOk("marca como recebida", `update cotacoes set status = 'recebida' where id = $1`, [c1]);
await expectErr("item de cotação recebida não muda",
  `update cotacao_itens set preco_embalagem = 10 where id = $1`, /não podem mais ser alterados/, [ci?.id]);
await expectErr("frete de cotação recebida não muda",
  `update cotacoes set frete = 0 where id = $1`, /preservados/, [c1]);
await expectOk("observação de cotação recebida pode ser editada",
  `update cotacoes set observacoes = 'ok' where id = $1`, [c1]);
await expectErr("cotação recebida não é excluída",
  `delete from cotacoes where id = $1`, /histórico/, [c1]);
const c2 = (await one(`insert into cotacoes (fornecedor_id) values ($1) returning id`, [f1])).id;
await expectOk("rascunho de cotação pode ser excluído", `delete from cotacoes where id = $1`, [c2]);
await expectErr("validade antes da data da cotação bloqueada",
  `insert into cotacoes (fornecedor_id, data_cotacao, validade) values ($1, '2026-11-07', '2026-11-01')`, /check constraint/, [f1]);

console.log("\n5) Pedido");
const lote = "11111111-1111-1111-1111-111111111111";
const ped = (await expectOk("cria pedido a partir da cotação",
  `insert into pedidos (lote_id, fornecedor_id, cotacao_id, fornecedor_nome, frete) values ($1, $2, $3, 'Teste Fornecedor 1', 25) returning id`,
  [lote, f1, c1]))?.rows[0].id;
await expectErr("mesmo lote + fornecedor não duplica (clique repetido)",
  `insert into pedidos (lote_id, fornecedor_id, fornecedor_nome) values ($1, $2, 'x')`, /duplicate key/, [lote, f1]);
await expectErr("pedido não nasce aprovado (ficaria sem itens)",
  `insert into pedidos (fornecedor_id, fornecedor_nome, status) values ($1, 'x', 'aprovado')`, /começa em elaboração/, [f1]);
await expectErr("cotação não nasce recebida (ficaria sem itens)",
  `insert into cotacoes (fornecedor_id, status) values ($1, 'recebida')`, /começa em elaboração/, [f1]);
await expectErr("não aprova pedido sem itens",
  `update pedidos set status = 'aprovado' where id = $1`, /ao menos um item/, [ped]);
const pi = (await expectOk("adiciona 20 caixas ao pedido",
  `insert into pedido_itens (pedido_id, produto_id, cotacao_item_id, produto_nome, tipo_embalagem, unidades_por_embalagem, quantidade_embalagens, preco_embalagem)
   values ($1, $2, $3, 'Produto Teste Lata', 'caixa', 12, 20, 39.90) returning id`, [ped, p1, ci?.id]))?.rows[0].id;
await expectErr("não envia sem aprovar", `update pedidos set status = 'enviado' where id = $1`, /não permitida/, [ped]);
await expectOk("aprova", `update pedidos set status = 'aprovado' where id = $1`, [ped]);
await expectErr("item de pedido aprovado não muda",
  `update pedido_itens set quantidade_embalagens = 1 where id = $1`, /não podem mais ser alterados/, [pi]);
await expectErr("frete de pedido aprovado não muda", `update pedidos set frete = 0 where id = $1`, /não podem mais/, [ped]);
await expectErr("recebimento antes do envio bloqueado",
  `insert into recebimentos (pedido_id) values ($1)`, /enviado ao fornecedor/, [ped]);
await expectOk("marca como enviado ao fornecedor", `update pedidos set status = 'enviado' where id = $1`, [ped]);
const env = await one("select enviado_em from pedidos where id = $1", [ped]);
env.enviado_em ? pass("data de envio registrada automaticamente") : bad("enviado_em");

console.log("\n6) Recebimento parcial e conclusão");
await expectErr("não marca recebido sem recebimento", `update pedidos set status = 'recebido' where id = $1`, /Registre o recebimento/, [ped]);
const r1 = (await one(`insert into recebimentos (pedido_id) values ($1) returning id`, [ped])).id;
await expectOk("recebe 15 de 20 caixas",
  `insert into recebimento_itens (recebimento_id, pedido_item_id, quantidade_recebida) values ($1, $2, 15)`, [r1, pi]);
await expectOk("status parcialmente recebido", `update pedidos set status = 'parcialmente_recebido' where id = $1`, [ped]);
let s = await one("select quantidade_embalagens, quantidade_aceita, quantidade_pendente from vw_pedido_itens_saldo where id = $1", [pi]);
Number(s.quantidade_pendente) === 5 ? pass("solicitado 20, recebido 15, pendente 5") : bad("saldo", JSON.stringify(s));
await expectErr("não aceita receber mais do que o pendente",
  `insert into recebimento_itens (recebimento_id, pedido_item_id, quantidade_recebida)
   values ((select id from recebimentos where pedido_id = $1 limit 1), $2, 1)`, /duplicate key|pendente/, [ped, pi]);
const r2 = (await one(`insert into recebimentos (pedido_id) values ($1) returning id`, [ped])).id;
await expectErr("excedente bloqueado no 2º recebimento",
  `insert into recebimento_itens (recebimento_id, pedido_item_id, quantidade_recebida) values ($1, $2, 6)`, /pendente: 5/, [r2, pi]);
await expectOk("recebe as 5 restantes (1 danificada)",
  `insert into recebimento_itens (recebimento_id, pedido_item_id, quantidade_recebida, quantidade_danificada) values ($1, $2, 5, 1)`, [r2, pi]);
s = await one("select quantidade_pendente from vw_pedido_itens_saldo where id = $1", [pi]);
Number(s.quantidade_pendente) === 1 ? pass("caixa danificada continua pendente (1)") : bad("pendente após avaria", JSON.stringify(s));
await expectErr("recebimento lançado não é alterado",
  `update recebimentos set data_recebimento = '2020-01-01' where id = $1`, /não pode ser alterado/, [r2]);
await expectOk("conclui o pedido", `update pedidos set status = 'recebido' where id = $1`, [ped]);
await expectErr("pedido recebido não muda mais", `update pedidos set observacoes = 'x' where id = $1`, /não pode mais ser alterado/, [ped]);
await zeroRows("pedido não é excluído", `delete from pedidos where id = $1`, [ped], /cancelamento/);
const vp = await one("select numero_formatado, valor_total, valor_recebido_itens, compra_realizada from vw_pedidos where id = $1", [ped]);
Number(vp.valor_total) === 823 && vp.compra_realizada
  ? pass(`${vp.numero_formatado}: total 798 + 25 frete = 823; recebido ${vp.valor_recebido_itens}; conta como compra`)
  : bad("totais do pedido", JSON.stringify(vp));

console.log("\n7) Cancelamento");
const ped2 = (await one(`insert into pedidos (fornecedor_id, fornecedor_nome) values ($1, 'Teste Fornecedor 1') returning id`, [f1])).id;
await expectErr("cancelar exige motivo", `update pedidos set status = 'cancelado' where id = $1`, /motivo/, [ped2]);
await expectOk("cancela com motivo", `update pedidos set status = 'cancelado', motivo_cancelamento = 'Fornecedor sem estoque' where id = $1`, [ped2]);
const vp2 = await one("select compra_realizada from vw_pedidos where id = $1", [ped2]);
vp2.compra_realizada === false ? pass("pedido cancelado não conta como compra") : bad("cancelado conta como compra");

console.log("\n8) Histórico e auditoria");
const h = (await expectOk("registra preço no histórico",
  `insert into historico_precos (produto_id, fornecedor_id, origem, data_referencia, tipo_embalagem, unidades_por_embalagem, preco_embalagem)
   values ($1, $2, 'manual', current_date, 'caixa', 12, 41.50) returning id, preco_unitario`, [p1, f1]))?.rows[0];
await zeroRows("histórico de preço não é alterado", `update historico_precos set preco_embalagem = 1 where id = $1`, [h?.id], /permanentes/);
await zeroRows("histórico de preço não é excluído", `delete from historico_precos where id = $1`, [h?.id], /permanentes/);
const ev = await one("select count(*)::int n from eventos where entidade_id = $1", [ped]);
ev.n >= 6 ? pass(`${ev.n} eventos de auditoria do pedido (criação, status, recebimentos)`) : bad("eventos", ev.n);
await zeroRows("auditoria não é apagada", `delete from eventos`, [], /permanentes/);
await expectOk("produto usado em cotação: desativar funciona", `update produtos set ativo = false where id = $1`, [p1]);
await expectErr("produto usado em cotação não é excluído", `delete from produtos where id = $1`, /foreign key/, [p1]);

console.log("\n9) Permissões (RLS)");
await as(LEITOR);
const lido = await one("select count(*)::int n from produtos");
lido.n === 1 ? pass("perfil 'consulta' lê produtos") : bad("leitor lê", lido.n);
await expectErr("perfil 'consulta' não cadastra fornecedor",
  `insert into fornecedores (nome) values ('Invasor')`, /row-level security/);
const upd = await db.query(`update produtos set nome = 'hack' where id = $1`, [p1]);
upd.affectedRows === 0 ? pass("perfil 'consulta' não altera produto (0 linhas)") : bad("leitor alterou produto");
const meusPerfis = await one("select count(*)::int n from perfis");
meusPerfis.n === 1 ? pass("perfil 'consulta' só vê o próprio perfil") : bad("perfis visíveis", meusPerfis.n);
const promo = await db.query(`update perfis set papel = 'admin' where id = '${LEITOR}'`);
promo.affectedRows === 0 ? pass("perfil 'consulta' não se promove a admin (0 linhas)") : bad("leitor se promoveu");
await as(null);
await expectErr("sem login (anon) não lê nada", `select * from deusede.produtos`, /permission denied for schema deusede/);
await expectErr("sem login (anon) não grava nada", `insert into deusede.categorias (nome) values ('x')`, /permission denied for schema deusede/);
await asSuper();
const papel = await one(`select papel from perfis where id = '${LEITOR}'`);
papel.papel === "consulta" ? pass("papel do leitor continua 'consulta'") : bad("leitor virou", papel.papel);

console.log("\n10) Convivência com a Agenda Pessoal");
await as(SEM_PERFIL);
const semPerfil = await one("select count(*)::int n from produtos");
semPerfil.n === 0 ? pass("logado na Agenda mas sem perfil no DEU SEDE!: não vê nada") : bad("sem perfil viu", semPerfil.n);
await expectErr("logado sem perfil não grava", `insert into fornecedores (nome) values ('x')`, /row-level security/);
await as(null);
await expectOk("página pública da Agenda (anônimo) continua gravando", `insert into public.service_requests (descricao) values ('teste')`);
await expectErr("anônimo não enxerga o esquema deusede", `select 1 from deusede.produtos`, /permission denied/);
await asSuper();
const publicas = await one(`select count(*)::int n from pg_tables where schemaname = 'public' and tablename <> 'service_requests'`);
publicas.n === 0 ? pass("nenhuma tabela criada no esquema public da Agenda") : bad("tabelas no public", publicas.n);

// =====================================================================
// Etapas 2 a 7 — roteiro de aceitação da especificação, pelas funções
// (RPC) que o app chama.
// =====================================================================
async function rpc(fn, payload = {}) {
  const r = await db.query(`select deusede.${fn}($1::jsonb) as r`, [JSON.stringify(payload)]);
  return r.rows[0].r;
}
async function rpcOk(msg, fn, payload) {
  try { const r = await rpc(fn, payload); pass(msg); return r; }
  catch (e) { bad(msg, "-> " + e.message); return null; }
}
async function rpcErr(msg, fn, payload, pattern) {
  return expectErr(msg, `select deusede.${fn}($1::jsonb)`, pattern, [JSON.stringify(payload)]);
}
const num = (v) => Number(v);

console.log("\n11) Etapa 2 — cadastros");
await as(ADMIN);
const fa = await rpcOk("#1 cadastra fornecedor A", "salvar_fornecedor", { nome: "Fornecedor A (teste)", whatsapp: "11911110000" });
const fb = await rpcOk("#1 cadastra fornecedor B", "salvar_fornecedor", { nome: "Fornecedor B (teste)", whatsapp: "5511922220000" });
const fc = await rpcOk("#1 cadastra fornecedor C", "salvar_fornecedor", { nome: "Fornecedor C (teste)" });
await rpcErr("nome repetido tem mensagem clara", "salvar_fornecedor", { nome: "fornecedor a (TESTE)" }, /Já existe um fornecedor com esse nome/);
const catBebida = (await one("select id from categorias where nome = 'Cervejas'")).id;
const catRefri = (await one("select id from categorias where nome = 'Refrigerantes'")).id;
const brahma = await rpcOk("cadastra produto (caixa c/ 12)", "salvar_produto", {
  nome: "Cerveja Teste Lata 269 ml", categoria_id: catBebida, marca: "Teste", tipo_embalagem: "caixa",
  unidades_por_embalagem: 12, volume_por_unidade: 269, unidade_medida: "ml" });
const refri = await rpcOk("cadastra produto (fardo c/ 6)", "salvar_produto", {
  nome: "Refrigerante Teste 2 L", categoria_id: catRefri, tipo_embalagem: "fardo", unidades_por_embalagem: 6,
  volume_por_unidade: 2, unidade_medida: "l" });
await rpcErr("produto sem categoria barrado", "salvar_produto", { nome: "X" }, /Escolha a categoria/);
const vinc = await rpcOk("#2 mesmo produto com outra embalagem e preço (fardo c/ 15 no C)", "salvar_fornecedor_produto", {
  fornecedor_id: fc.id, produto_id: brahma.id, tipo_embalagem: "fardo", unidades_por_embalagem: 15, preco_atual: 49.5 });
let cad = await rpc("cadastros");
cad.fornecedores.length >= 3 && cad.produtos.some((x) => x.id === brahma.id)
  ? pass("cadastros() devolve fornecedores e produtos") : bad("cadastros()");
const fpC = cad.fornecedor_produtos.find((x) => x.id === vinc.id);
num(fpC?.preco_unitario) === 3.3 ? pass("preço atual por unidade = 49,50 / 15 = 3,30") : bad("preço unitário vínculo", fpC?.preco_unitario);
await rpcOk("desativa produto e reativa", "definir_ativo", { tabela: "produtos", id: refri.id, ativo: false });
await rpc("definir_ativo", { tabela: "produtos", id: refri.id, ativo: true });

console.log("\n12) Etapa 3 — cotações");
// "hoje" como o app manda (data de Brasília), não a data em UTC.
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const cotA = await rpcOk("#3 cotação do A (recebida)", "salvar_cotacao", {
  fornecedor_id: fa.id, data_cotacao: hoje, frete: 30, status: "recebida", itens: [
    { produto_id: brahma.id, quantidade_embalagens: 20, preco_embalagem: 39.9 },
    { produto_id: refri.id, quantidade_embalagens: 10, preco_embalagem: 45 }] });
const cotB = await rpcOk("#3 cotação do B (recebida)", "salvar_cotacao", {
  fornecedor_id: fb.id, data_cotacao: hoje, frete: 0, status: "recebida", itens: [
    { produto_id: brahma.id, quantidade_embalagens: 20, preco_embalagem: 41.5 },
    { produto_id: refri.id, quantidade_embalagens: 10, preco_embalagem: 42, desconto_valor: 10 }] });
const cotC = await rpcOk("#3 cotação do C (recebida, fardo c/ 15)", "salvar_cotacao", {
  fornecedor_id: fc.id, data_cotacao: hoje, frete: 50, status: "recebida", itens: [
    { produto_id: brahma.id, tipo_embalagem: "fardo", unidades_por_embalagem: 15, quantidade_embalagens: 16, preco_embalagem: 48 }] });
num(cotA?.valor_total) === 30 + 798 + 450 ? pass("total da cotação A = 798 + 450 + 30 frete = 1.278,00") : bad("total cot A", cotA?.valor_total);
await rpcErr("cotação recebida não é editada", "salvar_cotacao", { ...{ id: cotA.id, fornecedor_id: fa.id },
  itens: [{ produto_id: brahma.id, quantidade_embalagens: 1, preco_embalagem: 1 }] }, /não pode mais ser editada/);
await rpcErr("rejeitar exige motivo", "mudar_status_cotacao", { id: cotB.id, status: "rejeitada" }, /motivo/);
const rasc = await rpcOk("rascunho de cotação", "salvar_cotacao", { fornecedor_id: fa.id,
  itens: [{ produto_id: refri.id, quantidade_embalagens: 1, preco_embalagem: 40 }] });
await rpcOk("rascunho editado (itens substituídos)", "salvar_cotacao", { id: rasc.id, fornecedor_id: fa.id,
  itens: [{ produto_id: refri.id, quantidade_embalagens: 2, preco_embalagem: 41 }] });
await rpcOk("rascunho excluído", "excluir_cotacao", { id: rasc.id });
const dup = await rpcOk("duplicar cotação recebida", "duplicar_cotacao", { id: cotA.id });
dup?.status === "em_elaboracao" && dup.itens.length === 2 ? pass("cópia nasce em elaboração com os 2 itens") : bad("duplicar", JSON.stringify(dup?.status));
const histBrahma = await rpc("historico_produto", { produto_id: brahma.id });
histBrahma.length === 4 ? pass("histórico do produto: 1 manual + 3 de cotação") : bad("histórico brahma", histBrahma.length);
cad = await rpc("cadastros");
const fpA = cad.fornecedor_produtos.find((x) => x.fornecedor_id === fa.id && x.produto_id === brahma.id);
fpA && num(fpA.preco_atual) === 39.9 && fpA.preco_origem === "cotacao"
  ? pass("cotação recebida atualizou o preço atual do fornecedor A") : bad("preço atual via cotação", JSON.stringify(fpA));

console.log("\n13) Etapa 4 — comparação");
const ofertas = await rpc("ofertas_comparacao", { produto_ids: [brahma.id] });
const unit = Object.fromEntries(ofertas.map((o) => [o.fornecedor_nome[11], num(o.preco_unitario)]));
unit.A === 3.325 && unit.B === 3.4583 && unit.C === 3.2
  ? pass("#4 preço por unidade normalizado: A 3,325 · B 3,4583 · C 3,20 (fardo 15)") : bad("ofertas", JSON.stringify(unit));
ofertas.every((o) => o.cotacao_status === "recebida") ? pass("só entram cotações recebidas (rascunho/cópia fora)") : bad("status ofertas");

console.log("\n14) Etapa 5 — pedidos");
const ofC = ofertas.find((o) => o.fornecedor_id === fc.id);
const ofRefriB = (await rpc("ofertas_comparacao", { produto_ids: [refri.id] })).find((o) => o.fornecedor_id === fb.id);
const loteMontar = "22222222-2222-2222-2222-222222222222";
const pedidoPayload = { lote_id: loteMontar,
  itens: [
    { fornecedor_id: fc.id, produto_id: brahma.id, cotacao_item_id: ofC.cotacao_item_id, quantidade_embalagens: 16 },
    { fornecedor_id: fb.id, produto_id: refri.id, cotacao_item_id: ofRefriB.cotacao_item_id, quantidade_embalagens: 5 }],
  fornecedores: [{ fornecedor_id: fc.id, frete: 50 }, { fornecedor_id: fb.id, frete: 0 }] };
const lote1 = await rpcOk("#5/#6 itens de 2 fornecedores geram pedidos separados", "gerar_pedidos", pedidoPayload);
lote1?.pedidos.length === 2 && lote1.pedidos.every((x) => x.status === "aprovado")
  ? pass("2 pedidos independentes, aprovados") : bad("pedidos gerados", JSON.stringify(lote1?.pedidos?.map((x) => x.status)));
const pedC = lote1.pedidos.find((x) => x.fornecedor_id === fc.id);
const pedB = lote1.pedidos.find((x) => x.fornecedor_id === fb.id);
num(pedC.valor_total) === 16 * 48 + 50 ? pass("#7 pedido C = 16 × 48,00 + 50 frete = 818,00 (igual à cotação)") : bad("valor C", pedC.valor_total);
num(pedB.valor_total) === 5 * 42 - 5 ? pass("#7 pedido B = 5 × 42,00 − desconto proporcional 5,00 = 205,00") : bad("valor B", pedB.valor_total);
pedC.cotacao_id === cotC.id ? pass("pedido guarda a cotação de origem") : bad("cotação de origem");
const lote2 = await rpc("gerar_pedidos", pedidoPayload);
const totalPed = await one("select count(*)::int n from pedidos where lote_id = $1", [loteMontar]);
lote2.pedidos.length === 2 && totalPed.n === 2 ? pass("clique repetido devolve os mesmos 2 pedidos (sem duplicar)") : bad("duplicou", totalPed.n);
await rpcErr("preço de outro fornecedor barrado", "gerar_pedidos", { lote_id: "33333333-3333-3333-3333-333333333333",
  itens: [{ fornecedor_id: fa.id, produto_id: brahma.id, cotacao_item_id: ofC.cotacao_item_id, quantidade_embalagens: 1 }] }, /não pertence/);
await rpcErr("recebido não é marcado à mão", "mudar_status_pedido", { id: pedC.id, status: "recebido" }, /registro de recebimento/);
await rpcOk("#8 confirma envio pelo WhatsApp -> Enviado", "mudar_status_pedido", { id: pedC.id, status: "enviado" });
await rpcOk("previsão de entrega atualizada", "atualizar_pedido", { id: pedC.id, previsao_entrega: hoje, observacoes: "Entregar pela manhã" });
await rpcErr("cancelar sem motivo barrado", "mudar_status_pedido", { id: pedB.id, status: "cancelado" }, /motivo/);

console.log("\n15) Etapa 6 — recebimentos");
let det = await rpc("obter_pedido", { id: pedC.id });
const itemC = det.itens[0];
const chave = "44444444-4444-4444-4444-444444444444";
det = await rpcOk("#9 recebimento parcial (10 de 16)", "registrar_recebimento", { pedido_id: pedC.id, chave_idempotencia: chave,
  itens: [{ pedido_item_id: itemC.id, quantidade_recebida: 10, preco_cobrado: 48.5 }] });
det?.status === "parcialmente_recebido" && num(det.itens[0].quantidade_pendente) === 6
  ? pass("status Parcialmente recebido; pendente 6") : bad("parcial", det?.status);
await rpc("registrar_recebimento", { pedido_id: pedC.id, chave_idempotencia: chave,
  itens: [{ pedido_item_id: itemC.id, quantidade_recebida: 10 }] });
const recs = await one("select count(*)::int n from recebimentos where pedido_id = $1", [pedC.id]);
recs.n === 1 ? pass("reenvio do mesmo recebimento não duplica") : bad("recebimento duplicado", recs.n);
det = await rpcOk("#10 recebe o restante (6)", "registrar_recebimento", { pedido_id: pedC.id,
  itens: [{ pedido_item_id: itemC.id, quantidade_recebida: 6 }] });
det?.status === "recebido" ? pass("tudo recebido -> pedido concluído (Recebido)") : bad("conclusão", det?.status);
det.recebimentos[0].itens[0].preco_cobrado == 48.5 ? pass("divergência de preço registrada (cobrado 48,50 × pedido 48,00)") : bad("divergência");
await rpc("mudar_status_pedido", { id: pedB.id, status: "enviado" });
const itemB = (await rpc("obter_pedido", { id: pedB.id })).itens[0];
await rpcOk("nota com preço novo (43,00 × 42,00 do pedido), confirmado", "registrar_recebimento", {
  pedido_id: pedB.id, atualizar_precos: true,
  itens: [{ pedido_item_id: itemB.id, quantidade_recebida: 3, quantidade_danificada: 1, preco_cobrado: 43 }] });
const cadNota = await rpc("cadastros");
const fpNota = cadNota.fornecedor_produtos.find((x) => x.fornecedor_id === fb.id && x.produto_id === refri.id);
fpNota && num(fpNota.preco_atual) === 43 && fpNota.preco_origem === "nota"
  ? pass("preço da nota virou o preço atual do fornecedor B (origem: nota)") : bad("preço da nota", JSON.stringify(fpNota));
const histNota = await rpc("historico_produto", { produto_id: refri.id, fornecedor_id: fb.id });
histNota.some((h) => h.origem === "nota" && num(h.preco_embalagem) === 43) ? pass("histórico registra o preço da nota") : bad("histórico nota");
num((await rpc("obter_pedido", { id: pedB.id })).itens[0].preco_embalagem) === 42 ? pass("o pedido continua com o preço negociado (42,00)") : bad("pedido mudou com a nota");
await rpcErr("concluir com pendência exige justificativa", "concluir_pedido", { id: pedB.id }, /Explique/);
det = await rpcOk("conclui com pendência e justificativa", "concluir_pedido", { id: pedB.id, justificativa: "Fornecedor sem estoque do restante" });
det?.status === "recebido" && det.eventos.some((e) => e.acao === "concluido_com_pendencia")
  ? pass("auditoria registra a conclusão com pendência") : bad("concluir pendência");
(await rpc("listar_recebimentos")).filter((r) => [pedC.id, pedB.id].includes(r.pedido_id)).length === 3
  ? pass("histórico lista os 3 recebimentos desses pedidos") : bad("listar recebimentos");

console.log("\n16) Etapa 7 — painel e relatórios");
const painel = await rpc("painel", { de: hoje, ate: hoje });
num(painel.total_comprado) === 818 + 205 + 823 ? pass(`painel: total comprado ${painel.total_comprado} (só pedidos enviados; cotações fora)`) : bad("painel total", painel.total_comprado);
painel.pedidos_realizados === 3 ? pass("painel: 3 compras realizadas") : bad("painel pedidos", painel.pedidos_realizados);
painel.fornecedor_maior_volume?.nome ? pass(`painel: maior volume = ${painel.fornecedor_maior_volume.nome}`) : bad("maior volume");
painel.mensal.length === 12 ? pass("painel: comparativo de 12 meses") : bad("mensal", painel.mensal.length);
const rf = await rpcOk("#11 relatório financeiro por fornecedor e período", "relatorio_financeiro", { de: hoje, ate: hoje, fornecedor_id: fc.id });
num(rf?.resumo.total_comprado) === 818 && num(rf.resumo.total_fretes) === 50 ? pass("financeiro do C: 818,00 com 50,00 de frete") : bad("financeiro C", JSON.stringify(rf?.resumo));
const rforn = await rpcOk("relatório de fornecedores", "relatorio_fornecedores", { de: hoje, ate: hoje });
rforn?.find((x) => x.fornecedor_id === fc.id)?.qtd_pedidos === 1 ? pass("fornecedores: C com 1 pedido") : bad("rel fornecedores");
const rprod = await rpcOk("relatório de produtos", "relatorio_produtos", { de: hoje, ate: hoje });
const lb = rprod?.find((x) => x.produto_id === brahma.id);
lb && num(lb.unidades_compradas) === 240 && num(lb.menor_preco_unitario) === 3.2 && lb.melhor_fornecedor === "Fornecedor C (teste)"
  ? pass("produtos: 240 latas, menor preço 3,20, melhor fornecedor C") : bad("rel produtos", JSON.stringify(lb));
const rped = await rpcOk("relatório de pedidos", "relatorio_pedidos", { de: hoje, ate: hoje });
rped?.por_status?.recebido?.quantidade >= 2 ? pass("pedidos por status") : bad("rel pedidos", JSON.stringify(rped?.por_status));

console.log("\n17) #13 — mudar o preço atual não altera o passado");
const antes = (await rpc("historico_produto", { produto_id: brahma.id })).map((h) => `${h.id}:${h.preco_embalagem}`).sort();
await rpcOk("altera preço atual do C para 52,00", "salvar_fornecedor_produto", { id: vinc.id, preco_atual: 52 });
const depois = await rpc("historico_produto", { produto_id: brahma.id });
antes.every((x) => depois.map((h) => `${h.id}:${h.preco_embalagem}`).includes(x)) && depois.length === antes.length + 1
  ? pass("histórico anterior intacto + 1 linha nova") : bad("histórico mudou");
const itemCdepois = (await rpc("obter_pedido", { id: pedC.id })).itens[0];
num(itemCdepois.preco_embalagem) === 48 ? pass("pedido continua com 48,00") : bad("pedido mudou", itemCdepois.preco_embalagem);
const cotCdepois = await rpc("obter_cotacao", { id: cotC.id });
num(cotCdepois.itens[0].preco_embalagem) === 48 ? pass("cotação continua com 48,00") : bad("cotação mudou");

console.log("\n18) Estoque");
await as(ADMIN);
const saldoDe = async (produto_id) => num((await rpc("estoque", { produto_id }))[0]?.saldo_unidades);
(await saldoDe(brahma.id)) === 240 ? pass("recebimento do pedido C deu entrada de 16 fardos × 15 = 240 latas") : bad("saldo brahma", await saldoDe(brahma.id));
(await saldoDe(refri.id)) === 12 ? pass("pedido B: 3 recebidos − 1 avariado = 2 fardos × 6 = 12 unidades (avaria não entra)") : bad("saldo refri", await saldoDe(refri.id));
(await saldoDe(p1)) === 228 ? pass("PED-00001: 19 caixas aceitas × 12 = 228 unidades") : bad("saldo p1", await saldoDe(p1));
const chaveNota = "55555555-5555-5555-5555-555555555555";
const nota = await rpcOk("entrada por nota (sem pedido), com preço atualizado", "registrar_entrada_nota", {
  chave_idempotencia: chaveNota, fornecedor_id: fa.id, numero_nota: "123", atualizar_precos: true,
  itens: [{ produto_id: brahma.id, quantidade_embalagens: 2, preco_embalagem: 40, tipo_embalagem: "caixa", unidades_por_embalagem: 12 }] });
nota?.numero_formatado?.startsWith("ENT-") && num(nota.total) === 80 ? pass(`${nota.numero_formatado}: 2 caixas a R$ 40,00 = R$ 80,00`) : bad("nota", JSON.stringify(nota));
(await saldoDe(brahma.id)) === 264 ? pass("saldo 240 + 24 = 264") : bad("saldo após nota", await saldoDe(brahma.id));
await rpc("registrar_entrada_nota", { chave_idempotencia: chaveNota, itens: [{ produto_id: brahma.id, quantidade_embalagens: 2 }] });
(await saldoDe(brahma.id)) === 264 ? pass("reenviar a mesma nota não duplica a entrada") : bad("nota duplicada");
const fpNotaA = (await rpc("cadastros")).fornecedor_produtos.find((x) => x.fornecedor_id === fa.id && x.produto_id === brahma.id && x.unidades_por_embalagem === 12);
num(fpNotaA?.preco_atual) === 40 && fpNotaA.preco_origem === "nota" ? pass("preço da nota confirmado virou o preço atual do A") : bad("preço atual via nota", JSON.stringify(fpNotaA));
await rpcErr("saída maior que o saldo é barrada", "registrar_movimento_estoque", { produto_id: brahma.id, tipo: "saida", quantidade: 300, motivo: "Venda" }, /maior que o saldo/);
await rpcErr("saída sem motivo é barrada", "registrar_movimento_estoque", { produto_id: brahma.id, tipo: "saida", quantidade: 1 }, /motivo/);
await rpcOk("saída de 5 caixas (60 latas) — venda", "registrar_movimento_estoque", { produto_id: brahma.id, tipo: "saida", quantidade: 5, unidade: "embalagem", motivo: "Venda" });
(await saldoDe(brahma.id)) === 204 ? pass("saldo 264 − 60 = 204") : bad("saldo após saída", await saldoDe(brahma.id));
await rpcOk("ajuste pela contagem física (contou 200)", "registrar_movimento_estoque", { produto_id: brahma.id, tipo: "ajuste", contagem: 200 });
(await saldoDe(brahma.id)) === 200 ? pass("ajuste gerou −4 e o saldo ficou 200") : bad("saldo após ajuste", await saldoDe(brahma.id));
const movs = await rpc("movimentos_estoque", { produto_id: brahma.id });
movs.length === 5 && num(movs[0].saldo_apos) === 200 && movs.some((m) => m.pedido_numero) && movs.some((m) => m.nota_entrada_numero)
  ? pass("movimentações com saldo após cada uma, pedido e nota de origem") : bad("movimentos", JSON.stringify(movs.map((m) => [m.origem, m.saldo_apos])));
await zeroRows("movimentação não é alterada", "update estoque_movimentos set quantidade_unidades = 1", [], /permanentes/);
await rpcOk("produto com estoque mínimo de 20 caixas", "salvar_produto", { ...brahma, estoque_minimo: 20 });
const resumoEst = await rpc("resumo_estoque");
resumoEst.lista_abaixo_minimo.some((x) => x.produto_id === brahma.id) ? pass("200 latas = 16,7 caixas < mínimo de 20: aparece abaixo do mínimo") : bad("abaixo do mínimo", JSON.stringify(resumoEst));
await as(LEITOR);
await rpcErr("perfil 'consulta' não dá entrada no estoque", "registrar_entrada_nota", { itens: [{ produto_id: brahma.id, quantidade_embalagens: 1 }] }, /não tem permissão/);
await as(ADMIN);

console.log("\n19) PDV integrado ao estoque");
await as(ADMIN);
await rpcOk("preço de venda: R$ 4,50 a lata e R$ 50,00 a caixa c/ 12", "salvar_produto", { ...brahma, estoque_minimo: 20, preco_venda: 4.5, preco_venda_embalagem: 50 });
const chaveVenda = "66666666-6666-6666-6666-666666666666";
const venda = await rpcOk("venda: 1 caixa + 6 latas, desconto R$ 2, dinheiro R$ 100", "registrar_venda", {
  chave_idempotencia: chaveVenda, forma_pagamento: "dinheiro", valor_recebido: 100, desconto: 2,
  itens: [{ produto_id: brahma.id, unidade_venda: "embalagem", quantidade: 1 }, { produto_id: brahma.id, unidade_venda: "unidade", quantidade: 6 }] });
venda && num(venda.subtotal) === 77 && num(venda.total) === 75 && num(venda.troco) === 25
  ? pass(`${venda.numero_formatado}: 50 + 27 = 77 − 2 = 75; troco R$ 25`) : bad("venda", JSON.stringify(venda && [venda.subtotal, venda.total, venda.troco]));
(await saldoDe(brahma.id)) === 182 ? pass("baixa no estoque: 200 − 18 = 182") : bad("saldo após venda", await saldoDe(brahma.id));
await rpc("registrar_venda", { chave_idempotencia: chaveVenda, itens: [{ produto_id: brahma.id, quantidade: 1 }] });
(await saldoDe(brahma.id)) === 182 ? pass("clique repetido em finalizar não duplica a venda") : bad("venda duplicada");
await rpcErr("não vende mais que o saldo", "registrar_venda", { forma_pagamento: "pix", itens: [{ produto_id: brahma.id, quantidade: 1000 }] }, /Estoque insuficiente/);
await rpcErr("produto sem preço de venda pede o preço", "registrar_venda", { forma_pagamento: "pix", itens: [{ produto_id: refri.id, quantidade: 1 }] }, /Informe o preço/);
await rpcOk("preço digitado no caixa", "registrar_venda", { forma_pagamento: "pix", itens: [{ produto_id: refri.id, quantidade: 2, preco_unitario: 9.99 }] });
await rpcErr("dinheiro recebido menor que o total", "registrar_venda", { forma_pagamento: "dinheiro", valor_recebido: 1, itens: [{ produto_id: brahma.id, quantidade: 1 }] }, /menor que o total/);
await rpcErr("cancelar exige motivo", "cancelar_venda", { id: venda.id }, /motivo/);
const cancelada = await rpcOk("cancela a venda com motivo", "cancelar_venda", { id: venda.id, motivo: "Cliente desistiu" });
cancelada?.status === "cancelada" && (await saldoDe(brahma.id)) === 200 ? pass("venda cancelada devolve 18 latas: saldo 200") : bad("estorno venda", await saldoDe(brahma.id));
const resumoV = await rpc("resumo_vendas");
num(resumoV.total) === 19.98 && resumoV.canceladas === 1 && num(resumoV.por_forma.pix) === 19.98
  ? pass("resumo do dia: R$ 19,98 em PIX; cancelada fora do total") : bad("resumo vendas", JSON.stringify(resumoV));
(await rpc("movimentos_estoque", { produto_id: brahma.id })).some((m) => m.venda_numero && m.origem === "estorno_venda")
  ? pass("movimentações mostram a venda e o estorno") : bad("movimentos venda");
await asSuper();
await db.exec(`insert into deusede.perfis (id, nome, papel) values ('${SEM_PERFIL}', 'Vendedor', 'vendedor')`);
await as(SEM_PERFIL);
await rpcOk("perfil 'vendedor' vende", "registrar_venda", { forma_pagamento: "debito", itens: [{ produto_id: brahma.id, quantidade: 1 }] });
await rpcErr("perfil 'vendedor' não cancela venda", "cancelar_venda", { id: venda.id, motivo: "teste de permissão" }, /administrador ou comprador/);
await rpcErr("perfil 'vendedor' não altera cadastro", "salvar_produto", { ...brahma, preco_venda: 0.01 }, /não tem permissão/);
await asSuper();
await db.exec(`delete from deusede.perfis where id = '${SEM_PERFIL}'`);

console.log("\n20) Catálogo de referência");
await as(ADMIN);
const catalogo = [
  { nome: "Cerveja Exemplo Catálogo Lata 350 ml", categoria: "Cervejas", marca: "Exemplo", tipo_embalagem: "pack", unidades_por_embalagem: 12, volume_por_unidade: 350, unidade_medida: "ml" },
  { nome: "Cachaça Exemplo", categoria: "Bebidas quentes", tipo_embalagem: "unidade", unidades_por_embalagem: 1 },
];
const imp1 = await rpcOk("importa 2 produtos (cria a categoria Bebidas quentes)", "importar_produtos", { produtos: catalogo });
imp1?.criados === 2 && imp1.categorias_criadas === 1 ? pass("2 produtos e 1 categoria criados") : bad("importar", JSON.stringify(imp1));
const imp2 = await rpc("importar_produtos", { produtos: catalogo });
imp2.criados === 0 && imp2.existentes === 2 ? pass("reimportar não duplica") : bad("reimportar", JSON.stringify(imp2));

console.log("\n21) Senha de 4 dígitos");
await as(ADMIN);
const cfg0 = await rpc("config_senha");
cfg0.definida === false && cfg0.areas.includes("relatorios") ? pass("sem senha criada; relatórios protegidos por padrão") : bad("config inicial", JSON.stringify(cfg0));
await rpcErr("senha precisa de 4 números", "salvar_seguranca", { pin_novo: "12a4" }, /4 números/);
await rpcOk("cria a senha 2468", "salvar_seguranca", { pin_novo: "2468" });
(await rpc("verificar_senha", { pin: "2468" })).ok === true ? pass("senha certa libera") : bad("senha certa");
(await rpc("verificar_senha", { pin: "1111" })).ok === false ? pass("senha errada não libera") : bad("senha errada");
await rpcErr("trocar exige a senha atual", "salvar_seguranca", { pin_atual: "0000", pin_novo: "1357" }, /Senha atual incorreta/);
const cfg1 = await rpcOk("escolhe áreas (tira o painel)", "salvar_seguranca", { pin_atual: "2468", areas: ["relatorios", "cancelar_venda"] });
!cfg1?.areas.includes("painel") && cfg1.areas.includes("configuracoes") ? pass("painel liberado; configurações continuam protegidas") : bad("areas", JSON.stringify(cfg1));
const vazamento = JSON.stringify(await rpc("empresa")) + JSON.stringify(cfg1);
!/2468|pin_hash|pin_sal/.test(vazamento) ? pass("a senha e o hash nunca saem do banco") : bad("vazou senha");
await expectErr("tabela da senha não é legível pela API", "select * from seguranca", /permission denied/);
await as(LEITOR);
await rpcErr("só o administrador troca a senha", "salvar_seguranca", { pin_atual: "2468", pin_novo: "1111" }, /administrador/);
await as(ADMIN);

console.log("\n22) Permissões nas funções");
await as(LEITOR);
await rpcErr("perfil 'consulta' não grava por função", "salvar_fornecedor", { nome: "Z" }, /não tem permissão/);
(await rpc("cadastros")).produtos.length > 0 ? pass("perfil 'consulta' lê pelas funções") : bad("consulta lê");
await as(SEM_PERFIL);
const vazio = await rpc("cadastros");
vazio.produtos.length === 0 && (await rpc("meu_acesso")) === null ? pass("sem perfil: funções não devolvem nada") : bad("sem perfil leu");
await rpcErr("sem perfil não registra recebimento", "registrar_recebimento", { pedido_id: pedB.id }, /não tem permissão/);
await asSuper();

console.log("\n23) Datas no horário de Brasília (o Supabase roda em UTC)");
await asSuper();
const semFuso = await one(`select count(*)::int as n, string_agg(p.proname, ', ') as nomes
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'deusede' and p.prokind = 'f'
    and (p.prolang = (select oid from pg_language where lanname = 'plpgsql')
         or p.prosrc ~* '(current_date|current_timestamp|localtime|now\\(|date_trunc|to_char|::date)')
    and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c ilike 'timezone=%')`);
semFuso.n === 0 ? pass("toda função que grava ou calcula data roda no horário de Brasília") : bad("funções sem fuso:", semFuso.nomes);
await db.exec("set timezone = 'UTC'");
await as(ADMIN);
const cotHoje = await rpcOk("cotação sem data informada", "salvar_cotacao", {
  fornecedor_id: fa.id, itens: [{ produto_id: brahma.id, quantidade_embalagens: 1, preco_embalagem: 1 }] });
const hojeBr = (await one("select (now() at time zone 'America/Sao_Paulo')::date::text as d")).d;
cotHoje?.data_cotacao === hojeBr
  ? pass(`data da cotação = hoje em Brasília (${hojeBr}), mesmo com o banco em UTC`)
  : bad("data da cotação", `${cotHoje?.data_cotacao} ≠ ${hojeBr} (hoje em Brasília)`);
await asSuper();

console.log(`\nResultado: ${ok} ok, ${fail} falha(s)`);
process.exit(fail ? 1 : 0);
