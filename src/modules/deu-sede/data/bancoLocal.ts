import type { PGlite } from "@electric-sql/pglite";
import type { FuncaoRPC } from "@/modules/deu-sede/data/cliente";
import { carregarDadosExemplo, marcarExemplo, situacaoExemplo } from "@/modules/deu-sede/data/dadosExemplo";

// MODO DE TESTE LOCAL: sem .env.local o DEU SEDE! roda um Postgres de
// verdade dentro do navegador (PGlite), com as MESMAS migrações do
// Supabase (supabase/deu-sede/*.sql). Assim as regras de negócio são
// testadas exatamente como vão funcionar no banco real — sem login.
// Os dados ficam salvos no IndexedDB deste navegador.

const NOME_BANCO = "deu-sede-teste";
export const USUARIO_LOCAL = "00000000-0000-4000-8000-00000000d5d5";

// Simula o que o Supabase já traz pronto (papéis e o esquema auth).
const PREPARO = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
  end $$;
  create schema if not exists auth;
  create table if not exists auth.users (
    id uuid primary key, email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now()
  );
  create or replace function auth.uid() returns uuid language sql stable as
    $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
  insert into auth.users (id, email) values ('${USUARIO_LOCAL}', 'teste-local@deu-sede')
    on conflict (id) do nothing;
  create table if not exists public.deusede_local_meta (chave text primary key, valor text);
`;

// Hash simples (FNV-1a) para saber se as migrações mudaram.
function hash(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

async function carregarMigracoes(): Promise<string> {
  const arquivos = import.meta.glob("/supabase/deu-sede/*.sql", { query: "?raw", import: "default" });
  const nomes = Object.keys(arquivos).sort();
  const conteudos = await Promise.all(nomes.map((n) => arquivos[n]() as Promise<string>));
  return conteudos.join("\n");
}

async function abrir(): Promise<PGlite> {
  const t0 = performance.now();
  const marca = (etapa: string) => console.debug(`[deu-sede] ${etapa}: ${Math.round(performance.now() - t0)} ms`);
  const [{ PGlite }, migracoes] = await Promise.all([import("@electric-sql/pglite"), carregarMigracoes()]);
  marca("pglite carregado");
  // Modo durável (padrão): cada consulta só termina depois de gravada no
  // IndexedDB. (O modo "relaxedDurability" perdia dados ao recarregar.)
  const db = await PGlite.create(`idb://${NOME_BANCO}`);
  marca("banco aberto");
  await db.exec(PREPARO);

  // Só reaplica as migrações quando elas mudaram (são idempotentes).
  const versao = hash(migracoes);
  const atual = await db.query<{ valor: string }>("select valor from public.deusede_local_meta where chave = 'versao'");
  if (atual.rows[0]?.valor !== versao) {
    await db.exec(migracoes);
    await db.query(
      `insert into public.deusede_local_meta (chave, valor) values ('versao', $1)
       on conflict (chave) do update set valor = excluded.valor`,
      [versao],
    );
    marca("migrações aplicadas");
  }

  // "Logado" como o usuário local (admin do DEU SEDE!).
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [USUARIO_LOCAL]);

  // Primeira abertura com o banco vazio: carrega os dados de EXEMPLO.
  if (situacaoExemplo() === null) {
    const n = await db.query<{ n: number }>("select count(*)::int as n from deusede.produtos");
    if (n.rows[0].n === 0) {
      try {
        await carregarDadosExemplo(async <T,>(fn: FuncaoRPC, payload: object = {}) => {
          const r = await db.query<{ r: T }>(`select deusede.${fn}($1::jsonb) as r`, [JSON.stringify(payload)]);
          return r.rows[0].r;
        });
        marcarExemplo("carregado");
        marca("dados de exemplo carregados");
      } catch (e) {
        console.warn("[deu-sede] não foi possível carregar os dados de exemplo:", e);
        marcarExemplo("vazio");
      }
    } else {
      marcarExemplo("existente");
    }
  }
  return db;
}

let banco: Promise<PGlite> | null = null;

export function bancoLocal(): Promise<PGlite> {
  if (!banco) {
    banco = abrir().catch((e) => {
      banco = null;
      throw e;
    });
  }
  return banco;
}

// Apaga todos os dados de teste deste navegador.
export async function apagarBancoLocal(): Promise<void> {
  if (banco) {
    try {
      (await banco).close();
    } catch {
      /* já fechado */
    }
    banco = null;
  }
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(`/pglite/${NOME_BANCO}`);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
