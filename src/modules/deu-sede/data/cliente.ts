import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabaseClient";
import { bancoLocal } from "@/modules/deu-sede/data/bancoLocal";

// Toda conversa com o banco passa por aqui: uma função SQL (RPC) do
// esquema "deusede", que recebe e devolve JSON. Com Supabase configurado
// vai para o Supabase; sem, vai para o banco de teste no navegador.
export type FuncaoRPC =
  | "meu_acesso"
  | "cadastros"
  | "historico_produto"
  | "movimentos_produto"
  | "resumo_fornecedor"
  | "salvar_categoria"
  | "salvar_produto"
  | "salvar_fornecedor"
  | "salvar_fornecedor_produto"
  | "definir_ativo"
  | "empresa"
  | "salvar_empresa"
  | "listar_cotacoes"
  | "obter_cotacao"
  | "salvar_cotacao"
  | "mudar_status_cotacao"
  | "duplicar_cotacao"
  | "excluir_cotacao"
  | "ofertas_comparacao"
  | "gerar_pedidos"
  | "listar_pedidos"
  | "obter_pedido"
  | "mudar_status_pedido"
  | "atualizar_pedido"
  | "registrar_recebimento"
  | "concluir_pedido"
  | "listar_recebimentos"
  | "painel"
  | "relatorio_financeiro"
  | "relatorio_fornecedores"
  | "relatorio_produtos"
  | "relatorio_pedidos"
  | "estoque"
  | "resumo_estoque"
  | "movimentos_estoque"
  | "registrar_entrada_nota"
  | "listar_entradas_nota"
  | "obter_entrada_nota"
  | "registrar_movimento_estoque"
  | "pdv_produtos"
  | "registrar_venda"
  | "cancelar_venda"
  | "obter_venda"
  | "listar_vendas"
  | "resumo_vendas"
  | "importar_produtos"
  | "config_senha"
  | "verificar_senha"
  | "salvar_seguranca";

function mensagemDeErro(e: unknown): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/schema must be one of/i.test(msg) || /Invalid schema/i.test(msg)) {
    return 'O esquema "deusede" ainda não foi liberado no Supabase (Project Settings → Data API → Exposed schemas).';
  }
  if (/Could not find the function/i.test(msg) || /does not exist/i.test(msg)) {
    return "O banco do DEU SEDE! ainda não foi instalado no Supabase: rode os arquivos de supabase/deu-sede no SQL Editor.";
  }
  if (/Failed to fetch|NetworkError/i.test(msg)) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
  return msg;
}

export async function chamar<T>(fn: FuncaoRPC, payload: object = {}): Promise<T> {
  try {
    if (supabase) {
      const { data, error } = await supabase.schema("deusede").rpc(fn, { p: payload });
      if (error) throw error;
      return data as T;
    }
    const db = await bancoLocal();
    const r = await db.query<{ r: T }>(`select deusede.${fn}($1::jsonb) as r`, [JSON.stringify(payload)]);
    return r.rows[0].r;
  } catch (e) {
    throw new Error(mensagemDeErro(e), { cause: e });
  }
}

// ---------------------------------------------------------------------
// Atualização das telas: depois de qualquer gravação, todas as consultas
// abertas recarregam. Também recarrega ao voltar para a aba (ex.: algo
// foi alterado em outro aparelho).
// ---------------------------------------------------------------------
let versao = 0;
const ouvintes = new Set<() => void>();
const cache = new Map<string, Promise<unknown>>();

export function invalidar() {
  versao++;
  cache.clear();
  ouvintes.forEach((f) => f());
}

function assinar(f: () => void) {
  ouvintes.add(f);
  return () => {
    ouvintes.delete(f);
  };
}

/** Grava e avisa as telas para recarregarem. */
export async function executar<T>(fn: FuncaoRPC, payload: object = {}): Promise<T> {
  try {
    return await chamar<T>(fn, payload);
  } finally {
    invalidar();
  }
}

interface Estado<T> {
  /** consulta (função + parâmetros), sem a versão */
  base: string;
  /** base + versão dos dados */
  chave: string;
  dados?: T;
  erro?: string;
}

/** Consulta com cache compartilhado entre componentes. `null` = não consultar. */
export function useConsulta<T>(fn: FuncaoRPC, payload: object | null = {}) {
  const v = useSyncExternalStore(assinar, () => versao);
  const parametros = payload === null ? null : JSON.stringify(payload);
  const base = parametros === null ? "" : `${fn}|${parametros}`;
  const chave = base ? `${v}|${base}` : "";
  const [estado, setEstado] = useState<Estado<T>>({ base: "", chave: "" });

  useEffect(() => {
    if (!chave || parametros === null) return;
    let vivo = true;
    let promessa = cache.get(chave) as Promise<T> | undefined;
    if (!promessa) {
      promessa = chamar<T>(fn, JSON.parse(parametros));
      cache.set(chave, promessa);
      promessa.catch(() => cache.delete(chave));
    }
    promessa.then(
      (dados) => vivo && setEstado({ base, chave, dados }),
      (e: Error) => vivo && setEstado({ base, chave, erro: e.message }),
    );
    return () => {
      vivo = false;
    };
  }, [fn, base, chave, parametros]);

  const mesmaConsulta = estado.base === base;
  return {
    // enquanto recarrega a MESMA consulta, mantém os dados anteriores na tela
    dados: mesmaConsulta ? estado.dados : undefined,
    erro: estado.chave === chave ? estado.erro : undefined,
    carregando: !!chave && estado.chave !== chave,
  };
}

/** Recarrega tudo quando a aba volta a ficar visível. */
export function useRecarregarAoVoltar() {
  useEffect(() => {
    const aoMudar = () => {
      if (document.visibilityState === "visible") invalidar();
    };
    document.addEventListener("visibilitychange", aoMudar);
    return () => document.removeEventListener("visibilitychange", aoMudar);
  }, []);
}
