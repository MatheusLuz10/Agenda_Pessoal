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
  | "excluir_produtos"
  | "config_senha"
  | "verificar_senha"
  | "salvar_seguranca"
  | "contas_pagar"
  | "obter_conta_pagar"
  | "lancar_conta_pagar"
  | "pagar_parcela"
  | "estornar_parcela"
  | "cancelar_conta_pagar"
  | "movimentar_caixa"
  | "caixa"
  | "painel_financeiro"
  | "avisos"
  | "registrar_atividade"
  | "listar_atividades"
  | "obter_rascunho"
  | "salvar_rascunho"
  | "apagar_rascunho";

// Funções que vieram em migrações recentes: o erro diz qual arquivo falta rodar.
const MIGRACAO_DA_FUNCAO: Partial<Record<FuncaoRPC, string>> = {
  registrar_venda: "0024_corrigir_baixa_vendas_estoque.sql",
  listar_vendas: "0009_pdv.sql",
  resumo_vendas: "0009_pdv.sql",
  excluir_produtos: "0013_excluir_produtos.sql",
  contas_pagar: "0016_financeiro.sql",
  obter_conta_pagar: "0016_financeiro.sql",
  lancar_conta_pagar: "0016_financeiro.sql",
  pagar_parcela: "0016_financeiro.sql",
  estornar_parcela: "0016_financeiro.sql",
  cancelar_conta_pagar: "0016_financeiro.sql",
  movimentar_caixa: "0016_financeiro.sql",
  caixa: "0016_financeiro.sql",
  painel_financeiro: "0016_financeiro.sql",
  avisos: "0016_financeiro.sql",
  registrar_atividade: "0017_registros.sql",
  listar_atividades: "0017_registros.sql",
  obter_rascunho: "0019_nota_guardada.sql",
  salvar_rascunho: "0019_nota_guardada.sql",
  apagar_rascunho: "0019_nota_guardada.sql",
};

function mensagemDeErro(e: unknown, fn?: FuncaoRPC): string {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/schema must be one of/i.test(msg) || /Invalid schema/i.test(msg)) {
    return 'O esquema "deusede" ainda não foi liberado no Supabase (Project Settings → Data API → Exposed schemas).';
  }
  if (/Could not find the function/i.test(msg) || /does not exist/i.test(msg)) {
    const arquivo = fn && MIGRACAO_DA_FUNCAO[fn];
    if (arquivo) return `Falta atualizar o banco do DEU SEDE! no Supabase: rode o arquivo supabase/deu-sede/${arquivo} no SQL Editor.`;
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
    throw new Error(mensagemDeErro(e, fn), { cause: e });
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

// Troca de usuário (sair e entrar com outro login na mesma aba): nada do
// login anterior pode continuar na tela, nem "quem sou eu" (meu_acesso) —
// senão o login de pedidos herdava o menu do administrador.
let usuarioAtual: string | null | undefined;
let geracaoUsuario = 0;
supabase?.auth.onAuthStateChange((_evento, sessao) => {
  const id = sessao?.user?.id ?? null;
  if (usuarioAtual !== undefined && id !== usuarioAtual) {
    geracaoUsuario++;
    // fora do aviso do Supabase (ele segura a sessão enquanto avisa)
    setTimeout(invalidar, 0);
  }
  usuarioAtual = id;
});

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
  // com o usuário na chave, a troca de login não mostra dados do anterior
  const base = parametros === null ? "" : `${geracaoUsuario}|${fn}|${parametros}`;
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
