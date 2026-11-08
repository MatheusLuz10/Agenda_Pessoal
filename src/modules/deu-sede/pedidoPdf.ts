// PDF do pedido de compra (mesmo visual dos relatórios: identificação da
// DEU SEDE!, data e totais), para mandar ao fornecedor ou imprimir.
import { exportarPdf, type Relatorio } from "@/modules/deu-sede/exportar";
import type { PedidoDetalhe } from "@/modules/deu-sede/data/tipos";
import { dataBR, descreverEmbalagem, moeda } from "@/modules/deu-sede/domain/formatos";

export function relatorioDoPedido(p: PedidoDetalhe): Relatorio {
  const resumo: [string, string][] = [
    ["Total do pedido", moeda(p.valor_total)],
    ["Produtos", String(p.itens.length)],
  ];
  if (Number(p.frete) > 0) resumo.push(["Frete", moeda(p.frete)]);
  if (Number(p.total_descontos) > 0) resumo.push(["Descontos", moeda(p.total_descontos)]);
  const filtros = [`Fornecedor: ${p.fornecedor_nome}`];
  if (p.condicao_pagamento) filtros.push(`Pagamento: ${p.condicao_pagamento}`);
  if (p.previsao_entrega) filtros.push(`Entrega prevista: ${dataBR(p.previsao_entrega)}`);
  return {
    titulo: `Pedido de compra ${p.numero_formatado}`,
    empresa: p.empresa?.nome || "DEU SEDE!",
    periodo: `Data do pedido: ${dataBR(p.data_pedido)}`,
    filtros,
    resumo,
    tabelas: [
      {
        titulo: "Produtos",
        colunas: [
          { titulo: "Produto" },
          { titulo: "Embalagem" },
          { titulo: "Qtd.", formato: "numero" },
          { titulo: "Valor/emb.", formato: "moeda" },
          { titulo: "Total", formato: "moeda" },
        ],
        linhas: p.itens.map((i) => [
          i.produto_nome,
          descreverEmbalagem(i.tipo_embalagem, i.unidades_por_embalagem),
          Number(i.quantidade_embalagens),
          Number(i.preco_embalagem),
          Number(i.subtotal),
        ]),
        totais: ["Total", null, null, null, Number(p.valor_total)],
      },
    ],
    observacao: p.observacoes || undefined,
  };
}

export function gerarPdfPedido(p: PedidoDetalhe) {
  return exportarPdf(relatorioDoPedido(p));
}
