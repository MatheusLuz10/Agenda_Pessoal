import { supabase } from "@/lib/supabaseClient";
import { chamar } from "@/modules/deu-sede/data/cliente";

// Registros (logs, migração 0017): o app anota o que cada login faz e manda
// em lotes para o banco. Cada anotação leva o login de quem fez: se o login
// trocar antes do envio, as anotações do anterior são descartadas (nunca
// ficam no nome do outro).

interface Anotacao {
  area: string;
  acao: string;
  descricao: string;
  detalhes?: Record<string, unknown>;
  momento: string;
  usuario: string | null | undefined;
  tentativas: number;
}

let fila: Anotacao[] = [];
let relogio: ReturnType<typeof setTimeout> | null = null;
/** undefined = ainda não sabe (ou modo de teste local, sem login) */
let usuarioAtual: string | null | undefined;

async function enviar() {
  if (relogio) {
    clearTimeout(relogio);
    relogio = null;
  }
  const lote = fila.filter((a) => a.usuario === usuarioAtual || usuarioAtual === undefined);
  fila = [];
  if (lote.length === 0) return;
  try {
    await chamar("registrar_atividade", {
      itens: lote.map(({ area, acao, descricao, detalhes, momento }) => ({ area, acao, descricao, detalhes: detalhes ?? {}, momento })),
    });
  } catch {
    // sem internet (ou banco sem a 0017): tenta mais uma vez depois
    const deNovo = lote.filter((a) => a.tentativas < 2).map((a) => ({ ...a, tentativas: a.tentativas + 1 }));
    fila = [...deNovo, ...fila].slice(-300);
    if (fila.length && !relogio) relogio = setTimeout(() => void enviar(), 15000);
  }
}

/** Anota uma ação do usuário (vai para a tela Registros). */
export function registrarAtividade(area: string, acao: string, descricao: string, detalhes?: Record<string, unknown>) {
  if (usuarioAtual === null) return; // sem login não há quem registrar
  fila.push({ area, acao, descricao, detalhes, momento: new Date().toISOString(), usuario: usuarioAtual, tentativas: 0 });
  if (fila.length >= 50) void enviar();
  else if (!relogio) relogio = setTimeout(() => void enviar(), 2000);
}

if (typeof document !== "undefined") {
  // ao sair da aba ou fechar, manda o que estiver pendente
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void enviar();
  });
}

supabase?.auth.onAuthStateChange((_evento, sessao) => {
  const id = sessao?.user?.id ?? null;
  const entrou = usuarioAtual === null && id !== null;
  if (id !== usuarioAtual) {
    // troca de login: o que era do anterior não vai mais
    fila = fila.filter((a) => a.usuario === id);
  }
  usuarioAtual = id;
  if (entrou) {
    // fora do aviso do Supabase (ele segura a sessão enquanto avisa)
    setTimeout(() => registrarAtividade("acesso", "entrou", "Entrou no sistema", { email: sessao?.user?.email }), 0);
  }
});
