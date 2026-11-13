import { useCallback, useEffect, useRef, useState } from "react";
import { chamar } from "@/modules/deu-sede/data/cliente";

export type EstadoRascunho = "carregando" | "vazio" | "salvando" | "salvo" | "erro";

interface Guardado<T> {
  chave: string;
  dados: T;
  atualizado_em: string;
}

/**
 * Guarda na nuvem, por login, o que está sendo preenchido numa tela (ex.: a
 * nota de entrada), para não perder nada se der erro, se a página fechar ou
 * se trocar de aparelho.
 *   - ao abrir, entrega o que estava guardado em `aoRecuperar`;
 *   - cada mudança é salva depois de uma pausa curta; tela vazia apaga;
 *   - antes de gravar de verdade, `pausar()` (o servidor apaga o rascunho
 *     na mesma transação; assim um salvamento atrasado não o recria);
 *     deu certo: `concluir()`; deu erro: `retomar()`.
 */
export function useRascunho<T extends object>(chave: string, valor: T, vazio: boolean, aoRecuperar: (dados: T, quando: string) => void) {
  const [estado, setEstado] = useState<EstadoRascunho>("carregando");
  const pronto = useRef(false);
  const existe = useRef(false);
  const pausado = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const emAndamento = useRef<Promise<unknown>>(Promise.resolve());
  const recuperar = useRef(aoRecuperar);
  const atual = useRef({ valor, vazio });

  useEffect(() => {
    recuperar.current = aoRecuperar;
    atual.current = { valor, vazio };
  });

  const gravar = useCallback(async () => {
    const { valor: v, vazio: semNada } = atual.current;
    if (semNada && !existe.current) return;
    setEstado("salvando");
    const p = semNada ? chamar("apagar_rascunho", { chave }) : chamar("salvar_rascunho", { chave, dados: v });
    emAndamento.current = p.catch(() => undefined);
    try {
      await p;
      existe.current = !semNada;
      setEstado(semNada ? "vazio" : "salvo");
    } catch {
      setEstado("erro");
    }
  }, [chave]);

  // abre o rascunho guardado (sem conseguir ler, não salva por cima)
  useEffect(() => {
    let vivo = true;
    chamar<Guardado<T> | null>("obter_rascunho", { chave })
      .then((r) => {
        if (!vivo) return;
        pronto.current = true;
        if (r?.dados) {
          existe.current = true;
          recuperar.current(r.dados, r.atualizado_em);
          setEstado("salvo");
        } else setEstado("vazio");
      })
      .catch(() => vivo && setEstado("erro"));
    return () => {
      vivo = false;
    };
  }, [chave]);

  const texto = JSON.stringify(valor);
  useEffect(() => {
    if (!pronto.current || pausado.current) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!pausado.current) void gravar();
    }, 800);
    return () => window.clearTimeout(timer.current);
  }, [texto, vazio, gravar]);

  const pausar = useCallback(async () => {
    pausado.current = true;
    window.clearTimeout(timer.current);
    await emAndamento.current;
  }, []);
  const retomar = useCallback(() => {
    pausado.current = false;
    if (pronto.current) void gravar();
  }, [gravar]);
  const concluir = useCallback(() => {
    existe.current = false;
    pausado.current = false;
    setEstado("vazio");
  }, []);
  const descartar = useCallback(async () => {
    window.clearTimeout(timer.current);
    await emAndamento.current;
    await chamar("apagar_rascunho", { chave });
    existe.current = false;
    setEstado("vazio");
  }, [chave]);

  return { estado, pausar, retomar, concluir, descartar };
}
