import { useConsulta } from "@/modules/deu-sede/data/cliente";

/** Quantas coisas pedem atenção em cada aba do DEU SEDE! (chave = módulo). */
export type Avisos = Partial<Record<"pedidos" | "contas" | "recebimentos" | "estoque" | "produtos", number>>;

// Bolinha vermelha do menu. Recarrega depois de qualquer gravação e ao
// voltar para a aba; sem a migração 0016 no banco, simplesmente não mostra.
export function useAvisos(ativo = true): Avisos {
  const { dados } = useConsulta<Avisos>("avisos", ativo ? {} : null);
  return dados ?? {};
}

export function totalAvisos(a: Avisos): number {
  return Object.values(a).reduce<number>((s, n) => s + (Number(n) || 0), 0);
}
