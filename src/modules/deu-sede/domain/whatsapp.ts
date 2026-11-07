import type { PedidoDetalhe } from "@/modules/deu-sede/data/tipos";
import { dataBR, descreverEmbalagem, moeda, numero, somenteDigitos } from "@/modules/deu-sede/domain/formatos";

/** Número no padrão internacional do WhatsApp (55 + DDD + número). */
export function numeroWhatsapp(texto: string | null | undefined): string | null {
  const d = somenteDigitos(texto);
  if (d.length < 10 || d.length > 13) return null;
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

export function linkWhatsapp(numeroDestino: string, texto: string): string {
  return `https://wa.me/${numeroDestino}?text=${encodeURIComponent(texto)}`;
}

/** Mensagem do pedido para o fornecedor (o usuário revisa e envia). */
export function mensagemPedido(p: PedidoDetalhe): string {
  const empresa = p.empresa?.nome || "DEU SEDE!";
  const linhas: string[] = [];
  linhas.push(`*Pedido de compra ${p.numero_formatado}*`);
  linhas.push(`${empresa}`);
  linhas.push(`Data: ${dataBR(p.data_pedido)}`);
  linhas.push(`Fornecedor: ${p.fornecedor_nome}`);
  linhas.push("");
  linhas.push("*Itens*");
  p.itens.forEach((i, n) => {
    linhas.push(`${n + 1}. ${i.produto_nome}`);
    linhas.push(
      `   ${numero(i.quantidade_embalagens)} × ${descreverEmbalagem(i.tipo_embalagem, i.unidades_por_embalagem)} — ${moeda(i.preco_embalagem)} cada`,
    );
    if (Number(i.desconto_valor) > 0) linhas.push(`   Desconto: ${moeda(i.desconto_valor)}`);
    linhas.push(`   Subtotal: ${moeda(i.subtotal)}`);
  });
  linhas.push("");
  linhas.push(`Soma dos itens: ${moeda(p.valor_bruto)}`);
  if (Number(p.total_descontos) > 0) linhas.push(`Descontos: − ${moeda(p.total_descontos)}`);
  linhas.push(`Frete: ${Number(p.frete) > 0 ? moeda(p.frete) : "sem frete"}`);
  linhas.push(`*Total: ${moeda(p.valor_total)}*`);
  if (p.condicao_pagamento) linhas.push(`Pagamento: ${p.condicao_pagamento}`);
  if (p.previsao_entrega) linhas.push(`Entrega prevista: ${dataBR(p.previsao_entrega)}`);
  if (p.fornecedor?.condicoes_comerciais) linhas.push(`Condições combinadas: ${p.fornecedor.condicoes_comerciais}`);
  if (p.observacoes) linhas.push(`Observações: ${p.observacoes}`);
  linhas.push("");
  linhas.push("Por favor, confirme o recebimento deste pedido. Obrigado!");
  return linhas.join("\n");
}
