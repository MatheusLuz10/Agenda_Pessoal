import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useConsulta } from "@/modules/deu-sede/data/cliente";
import type { Cadastros, Categoria, Fornecedor, FornecedorProduto, Produto } from "@/modules/deu-sede/data/tipos";

/** Cadastros (categorias, produtos, fornecedores, vínculos) com índices por id. */
export function useCadastros() {
  const { dados, erro, carregando } = useConsulta<Cadastros>("cadastros");
  const indices = useMemo(() => {
    const categorias = new Map<string, Categoria>();
    const produtos = new Map<string, Produto>();
    const fornecedores = new Map<string, Fornecedor>();
    const vinculosPorProduto = new Map<string, FornecedorProduto[]>();
    const vinculosPorFornecedor = new Map<string, FornecedorProduto[]>();
    for (const c of dados?.categorias ?? []) categorias.set(c.id, c);
    for (const p of dados?.produtos ?? []) produtos.set(p.id, p);
    for (const f of dados?.fornecedores ?? []) fornecedores.set(f.id, f);
    for (const v of dados?.fornecedor_produtos ?? []) {
      vinculosPorProduto.set(v.produto_id, [...(vinculosPorProduto.get(v.produto_id) ?? []), v]);
      vinculosPorFornecedor.set(v.fornecedor_id, [...(vinculosPorFornecedor.get(v.fornecedor_id) ?? []), v]);
    }
    return { categorias, produtos, fornecedores, vinculosPorProduto, vinculosPorFornecedor };
  }, [dados]);
  return { dados, erro, carregando, ...indices };
}

/** Valor que só muda depois que o usuário para de digitar. */
export function useAtrasado<T>(valor: T, ms = 300): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setAtrasado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return atrasado;
}

/**
 * Envio de formulário/ação: bloqueia cliques repetidos enquanto grava e
 * guarda a mensagem de erro do banco.
 */
export function useEnvio() {
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const emAndamento = useRef(false);

  const enviar = useCallback(async <T,>(acao: () => Promise<T>): Promise<T | undefined> => {
    if (emAndamento.current) return undefined;
    emAndamento.current = true;
    setEnviando(true);
    setErro(null);
    try {
      return await acao();
    } catch (e) {
      setErro((e as Error).message);
      return undefined;
    } finally {
      emAndamento.current = false;
      setEnviando(false);
    }
  }, []);

  return { enviando, erro, setErro, enviar };
}
