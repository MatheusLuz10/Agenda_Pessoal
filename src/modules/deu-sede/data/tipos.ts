import type { CotacaoStatus, PedidoStatus } from "@/modules/deu-sede/domain/status";

// Formato dos dados devolvidos pelas funções do esquema "deusede"
// (mesmos nomes das colunas do banco).

export type Embalagem = "caixa" | "fardo" | "pack" | "engradado" | "garrafao" | "unidade" | "outro";
export type UnidadeMedida = "ml" | "l" | "g" | "kg" | "un";
export type Papel = "admin" | "comprador" | "conferente" | "consulta";

export interface Acesso {
  id: string;
  nome: string;
  papel: Papel;
}

export interface Categoria {
  id: string;
  nome: string;
  ordem: number;
  ativo: boolean;
}

export interface Produto {
  id: string;
  nome: string;
  categoria_id: string;
  marca: string | null;
  codigo: string | null;
  tipo_embalagem: Embalagem;
  unidades_por_embalagem: number;
  volume_por_unidade: number | null;
  unidade_medida: UnidadeMedida | null;
  observacoes: string | null;
  ativo: boolean;
  estoque_minimo: number | null;
  preco_venda: number | null;
  preco_venda_embalagem: number | null;
  created_at: string;
  updated_at: string;
}

export interface Fornecedor {
  id: string;
  nome: string;
  vendedor: string | null;
  telefone: string | null;
  whatsapp: string | null;
  cnpj: string | null;
  endereco: string | null;
  email: string | null;
  condicoes_comerciais: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

export interface FornecedorProduto {
  id: string;
  fornecedor_id: string;
  produto_id: string;
  codigo_no_fornecedor: string | null;
  tipo_embalagem: Embalagem;
  unidades_por_embalagem: number;
  preco_atual: number | null;
  preco_unitario: number | null;
  preco_atualizado_em: string | null;
  preco_origem: "manual" | "cotacao" | "nota";
  ativo: boolean;
}

export interface Cadastros {
  categorias: Categoria[];
  produtos: Produto[];
  fornecedores: Fornecedor[];
  fornecedor_produtos: FornecedorProduto[];
}

export interface HistoricoPreco {
  id: string;
  produto_id: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  origem: "cotacao" | "manual" | "pedido" | "nota";
  data_referencia: string;
  tipo_embalagem: Embalagem;
  unidades_por_embalagem: number;
  preco_embalagem: number;
  preco_unitario: number;
  cotacao_id: string | null;
  cotacao_numero: string | null;
  created_at: string;
}

export interface Evento {
  id: number;
  acao: string;
  status_anterior: string | null;
  status_novo: string | null;
  detalhe: string | null;
  created_at: string;
}

export interface CotacaoItem {
  id: string;
  produto_id: string;
  produto_nome: string;
  tipo_embalagem: Embalagem;
  unidades_por_embalagem: number;
  quantidade_embalagens: number;
  preco_embalagem: number;
  desconto_valor: number;
  subtotal: number;
  preco_unitario: number;
  observacoes: string | null;
}

export interface CotacaoResumo {
  id: string;
  numero: number;
  numero_formatado: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  data_cotacao: string;
  validade: string | null;
  status: CotacaoStatus;
  frete: number;
  desconto_geral: number;
  condicao_pagamento: string | null;
  prazo_entrega: string | null;
  observacoes: string | null;
  motivo_status: string | null;
  qtd_itens: number;
  valor_bruto: number;
  total_descontos: number;
  valor_total: number;
  vencida: boolean;
  created_at: string;
  updated_at: string;
}

export interface CotacaoDetalhe extends CotacaoResumo {
  itens: CotacaoItem[];
  eventos: Evento[];
  pedidos: { id: string; numero_formatado: string; status: PedidoStatus }[];
  fornecedor: Fornecedor | null;
}

export interface Oferta {
  cotacao_item_id: string;
  produto_id: string;
  produto_nome: string;
  cotacao_id: string;
  cotacao_numero: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  fornecedor_ativo: boolean;
  cotacao_status: CotacaoStatus;
  data_cotacao: string;
  validade: string | null;
  vencida: boolean;
  tipo_embalagem: Embalagem;
  unidades_por_embalagem: number;
  quantidade_embalagens: number;
  preco_embalagem: number;
  desconto_valor: number;
  preco_unitario: number;
  frete: number;
  desconto_geral: number;
  condicao_pagamento: string | null;
  prazo_entrega: string | null;
}

export interface PedidoResumo {
  id: string;
  numero: number;
  numero_formatado: string;
  lote_id: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  fornecedor_whatsapp: string | null;
  cotacao_id: string | null;
  status: PedidoStatus;
  data_pedido: string;
  previsao_entrega: string | null;
  condicao_pagamento: string | null;
  frete: number;
  desconto_geral: number;
  observacoes: string | null;
  enviado_em: string | null;
  concluido_em: string | null;
  cancelado_em: string | null;
  motivo_cancelamento: string | null;
  compra_realizada: boolean;
  qtd_itens: number;
  valor_bruto: number;
  total_descontos: number;
  valor_total: number;
  valor_recebido_itens: number;
  quantidade_pendente: number;
  created_at: string;
}

export interface PedidoItem {
  id: string;
  produto_id: string;
  cotacao_item_id: string | null;
  produto_nome: string;
  tipo_embalagem: Embalagem;
  unidades_por_embalagem: number;
  quantidade_embalagens: number;
  preco_embalagem: number;
  desconto_valor: number;
  subtotal: number;
  preco_unitario: number;
  quantidade_recebida: number;
  quantidade_danificada: number;
  quantidade_aceita: number;
  quantidade_pendente: number;
  valor_recebido: number;
  maior_preco_cobrado: number | null;
}

export interface RecebimentoItem {
  id: string;
  pedido_item_id: string;
  produto_nome: string;
  quantidade_recebida: number;
  quantidade_danificada: number;
  preco_cobrado: number | null;
  preco_pedido: number;
  observacoes: string | null;
}

export interface Recebimento {
  id: string;
  numero: number;
  numero_formatado: string;
  data_recebimento: string;
  nota_fiscal: string | null;
  observacoes: string | null;
  cancelado_em: string | null;
  itens: RecebimentoItem[];
}

export interface Empresa {
  nome: string;
  cnpj: string | null;
  telefone: string | null;
  email: string | null;
  endereco: string | null;
}

export interface PedidoDetalhe extends PedidoResumo {
  itens: PedidoItem[];
  recebimentos: Recebimento[];
  eventos: Evento[];
  cotacao_numero: string | null;
  fornecedor: Fornecedor | null;
  empresa: Empresa | null;
}

export interface RecebimentoResumo {
  id: string;
  numero_formatado: string;
  data_recebimento: string;
  nota_fiscal: string | null;
  pedido_id: string;
  pedido_numero: string;
  fornecedor_nome: string;
  pedido_status: PedidoStatus;
  total_recebido: number;
  total_danificado: number;
  divergencias_preco: number;
}

export interface Painel {
  periodo: { de: string; ate: string };
  total_comprado: number;
  total_recebido: number;
  pedidos_realizados: number;
  valor_medio_pedido: number;
  total_frete: number;
  total_descontos: number;
  orcamentos_recebidos: number;
  orcamentos_aguardando_analise: number;
  pedidos_aguardando_aprovacao: number;
  pedidos_aprovados_nao_enviados: number;
  pedidos_aguardando_confirmacao: number;
  pedidos_aguardando_recebimento: number;
  pedidos_parcialmente_recebidos: number;
  fornecedores_ativos: number;
  fornecedor_maior_volume: { fornecedor_id: string; nome: string; total: number; pedidos: number } | null;
  produtos_mais_comprados: { produto_id: string; produto_nome: string; unidades: number; embalagens: number; total: number }[];
  maiores_altas: VariacaoPreco[];
  maiores_quedas: VariacaoPreco[];
  mensal: { mes: string; total: number; recebido: number; pedidos: number }[];
}

export interface VariacaoPreco {
  produto_id: string;
  produto_nome: string;
  fornecedor_id: string;
  fornecedor_nome: string;
  anterior: number;
  atual: number;
  variacao_pct: number;
  data_referencia: string;
}

export interface FiltrosRelatorio {
  de: string;
  ate: string;
  fornecedor_id?: string;
  produto_id?: string;
  categoria_id?: string;
  status?: string;
  numero?: string;
}

// ------------------------------------------------------------ Estoque

export interface ItemEstoque {
  produto_id: string;
  produto_nome: string;
  codigo: string | null;
  categoria_id: string;
  categoria_nome: string;
  tipo_embalagem: Embalagem;
  unidades_por_embalagem: number;
  estoque_minimo: number | null;
  ativo: boolean;
  saldo_unidades: number;
  saldo_embalagens: number;
  ultima_entrada: string | null;
  ultima_movimentacao: string | null;
  ultimo_custo_unitario: number | null;
  valor_estimado: number;
  abaixo_minimo: boolean;
}

export interface MovimentoEstoque {
  id: number;
  produto_id: string;
  produto_nome: string;
  unidades_por_embalagem: number;
  tipo_embalagem: Embalagem;
  tipo: "entrada" | "saida" | "ajuste";
  origem: "recebimento" | "nota" | "saida_manual" | "ajuste_contagem" | "estorno_recebimento" | "venda" | "estorno_venda";
  quantidade_unidades: number;
  custo_unitario: number | null;
  saldo_apos: number;
  motivo: string | null;
  data_movimento: string;
  created_at: string;
  recebimento_numero: string | null;
  pedido_id: string | null;
  pedido_numero: string | null;
  nota_entrada_id: string | null;
  nota_entrada_numero: string | null;
  venda_id: string | null;
  venda_numero: string | null;
  fornecedor_nome: string | null;
  nota_fiscal: string | null;
}

export interface ResumoEstoque {
  valor_estimado: number;
  produtos_com_saldo: number;
  abaixo_minimo: number;
  lista_abaixo_minimo: {
    produto_id: string;
    produto_nome: string;
    saldo_embalagens: number;
    estoque_minimo: number;
    tipo_embalagem: Embalagem;
    unidades_por_embalagem: number;
  }[];
}

export interface EntradaNotaResumo {
  id: string;
  numero_formatado: string;
  data_entrada: string;
  numero_nota: string | null;
  fornecedor_id: string | null;
  fornecedor_nome: string | null;
  qtd_itens: number;
  total: number;
}

// ----------------------------------------------------------------- PDV

export type FormaPagamento = "dinheiro" | "pix" | "debito" | "credito" | "outro";

export interface ProdutoPdv {
  produto_id: string;
  nome: string;
  codigo: string | null;
  marca: string | null;
  categoria_id: string;
  categoria_nome: string;
  tipo_embalagem: Embalagem;
  unidades_por_embalagem: number;
  preco_venda: number | null;
  preco_venda_embalagem: number | null;
  saldo_unidades: number;
}

export interface VendaItem {
  id: string;
  produto_id: string;
  produto_nome: string;
  unidade_venda: "unidade" | "embalagem";
  unidades_por_item: number;
  quantidade: number;
  quantidade_unidades: number;
  preco_tabela: number | null;
  preco_unitario: number;
  subtotal: number;
}

export interface Venda {
  id: string;
  numero_formatado: string;
  status: "concluida" | "cancelada";
  forma_pagamento: FormaPagamento;
  cliente: string | null;
  subtotal: number;
  desconto: number;
  total: number;
  valor_recebido: number | null;
  troco: number | null;
  observacoes: string | null;
  motivo_cancelamento: string | null;
  created_at: string;
  data: string;
  itens: VendaItem[];
  empresa: Empresa | null;
}

export interface VendaResumo {
  id: string;
  numero_formatado: string;
  status: "concluida" | "cancelada";
  forma_pagamento: FormaPagamento;
  cliente: string | null;
  total: number;
  desconto: number;
  troco: number | null;
  created_at: string;
  data: string;
  motivo_cancelamento: string | null;
  qtd_itens: number;
}

export interface ResumoVendas {
  total: number;
  qtd_vendas: number;
  ticket_medio: number;
  descontos: number;
  custo_total: number;
  margem: number;
  canceladas: number;
  por_forma: Partial<Record<FormaPagamento, number>>;
  mais_vendidos: { produto_id: string; produto_nome: string; unidades: number; total: number }[];
}
