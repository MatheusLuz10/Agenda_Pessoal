import {
  ChartColumn,
  ClipboardList,
  LayoutDashboard,
  Package,
  PackageCheck,
  Warehouse,
  Scale,
  Settings,
  ShoppingCart,
  Store,
  type LucideIcon,
} from "lucide-react";

// Base de todas as rotas da distribuidora.
export const DEU_SEDE_BASE = "/deu-sede";

/** Caminho dentro do DEU SEDE! (ex.: rota("pedidos", id)). */
export function rota(...partes: (string | number)[]): string {
  return [DEU_SEDE_BASE, ...partes].join("/");
}

// Fonte única do menu (lateral no computador, barra inferior no celular).
export interface ModuleInfo {
  key: string;
  to: string;
  label: string;
  /** Rótulo curto para a barra inferior do celular. */
  shortLabel: string;
  icon: LucideIcon;
  /** Aparece direto na barra inferior do celular (o resto fica em "Mais"). */
  noCelular: boolean;
}

export const MODULES: ModuleInfo[] = [
  { key: "painel", to: DEU_SEDE_BASE, label: "Painel inicial", shortLabel: "Painel", icon: LayoutDashboard, noCelular: false },
  { key: "pedidos", to: rota("pedidos"), label: "Pedidos de compra", shortLabel: "Pedidos", icon: ShoppingCart, noCelular: true },
  { key: "recebimentos", to: rota("recebimentos"), label: "Recebimentos", shortLabel: "Receber", icon: PackageCheck, noCelular: true },
  { key: "estoque", to: rota("estoque"), label: "Estoque", shortLabel: "Estoque", icon: Warehouse, noCelular: true },
  { key: "produtos", to: rota("produtos"), label: "Produtos", shortLabel: "Produtos", icon: Package, noCelular: false },
  { key: "fornecedores", to: rota("fornecedores"), label: "Fornecedores", shortLabel: "Fornec.", icon: Store, noCelular: false },
  { key: "cotacoes", to: rota("cotacoes"), label: "Cotações", shortLabel: "Cotações", icon: ClipboardList, noCelular: false },
  { key: "comparacao", to: rota("comparacao"), label: "Comparação de preços", shortLabel: "Comparar", icon: Scale, noCelular: false },
  { key: "relatorios", to: rota("relatorios"), label: "Relatórios", shortLabel: "Relatórios", icon: ChartColumn, noCelular: false },
  { key: "configuracoes", to: rota("configuracoes"), label: "Configurações", shortLabel: "Config.", icon: Settings, noCelular: false },
];
