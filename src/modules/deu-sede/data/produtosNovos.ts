import { chamar, invalidar } from "@/modules/deu-sede/data/cliente";
import type { LinhaAplicada } from "@/modules/deu-sede/components/ColarListaDialog";
import type { Cadastros, Produto } from "@/modules/deu-sede/data/tipos";
import { normalizarBusca } from "@/modules/deu-sede/domain/formatos";

const chave = (nome: string) => normalizarBusca(nome).replace(/\s+/g, " ");

/**
 * Lista colada com produtos novos: cadastra cada um e devolve as linhas
 * já apontando para o produto criado (candidatoId preenchido).
 * Se um produto com o mesmo nome já existir (ex.: aplicar de novo depois
 * de uma falha no meio), reaproveita em vez de tentar duplicar.
 */
export async function cadastrarProdutosNovos(linhas: LinhaAplicada[]): Promise<LinhaAplicada[]> {
  if (!linhas.some((l) => l.novo)) return linhas;
  const cad = await chamar<Cadastros>("cadastros");
  const existentes = new Map(cad.produtos.map((p) => [chave(p.nome), p.id]));
  const resultado: LinhaAplicada[] = [];
  let criou = false;
  try {
    for (const l of linhas) {
      if (!l.novo) {
        resultado.push(l);
        continue;
      }
      const jaExiste = existentes.get(chave(l.novo.nome));
      if (jaExiste) {
        resultado.push({ ...l, candidatoId: jaExiste, novo: undefined });
        continue;
      }
      const p = await chamar<Produto>("salvar_produto", {
        nome: l.novo.nome,
        codigo: l.novo.codigo,
        categoria_id: l.novo.categoria_id,
        tipo_embalagem: l.novo.tipo_embalagem,
        unidades_por_embalagem: l.novo.unidades_por_embalagem,
        observacoes: "Cadastrado pela lista colada.",
      });
      criou = true;
      existentes.set(chave(p.nome), p.id);
      resultado.push({ ...l, candidatoId: p.id, novo: undefined });
    }
  } finally {
    if (criou) invalidar();
  }
  return resultado;
}
