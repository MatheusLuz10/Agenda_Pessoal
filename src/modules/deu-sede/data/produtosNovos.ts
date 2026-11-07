import { chamar, invalidar } from "@/modules/deu-sede/data/cliente";
import type { LinhaAplicada } from "@/modules/deu-sede/components/ColarListaDialog";
import type { Produto } from "@/modules/deu-sede/data/tipos";

/**
 * Lista colada com produtos novos: cadastra cada um e devolve as linhas
 * já apontando para o produto criado (candidatoId preenchido).
 */
export async function cadastrarProdutosNovos(linhas: LinhaAplicada[]): Promise<LinhaAplicada[]> {
  const resultado: LinhaAplicada[] = [];
  let criou = false;
  try {
    for (const l of linhas) {
      if (!l.novo) {
        resultado.push(l);
        continue;
      }
      const p = await chamar<Produto>("salvar_produto", {
        nome: l.novo.nome,
        categoria_id: l.novo.categoria_id,
        tipo_embalagem: l.novo.tipo_embalagem,
        unidades_por_embalagem: l.novo.unidades_por_embalagem,
        observacoes: "Cadastrado pela lista colada.",
      });
      criou = true;
      resultado.push({ ...l, candidatoId: p.id, novo: undefined });
    }
  } finally {
    if (criou) invalidar();
  }
  return resultado;
}
