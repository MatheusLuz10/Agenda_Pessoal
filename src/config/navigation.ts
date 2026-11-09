import { CalendarDays, FileText, ScanBarcode, ScrollText, Settings, ShoppingCart } from "lucide-react";
import type { ItemMenu } from "@/components/layout/Shell";

// Menu do app (lateral no computador, barra inferior no celular — ver
// components/layout/Shell). O assistente continua como balão flutuante
// (AssistantWidget), não como aba.
export const NAV_ITEMS: ItemMenu[] = [
  // Abre a seção de compras, que tem menu próprio.
  { key: "deu-sede", to: "/deu-sede", label: "DEU SEDE! Compras", shortLabel: "DEU SEDE!", icon: ShoppingCart, noCelular: true },
  { key: "pdv", to: "/pdv", label: "PDV", shortLabel: "PDV", icon: ScanBarcode, noCelular: true },
  { key: "agenda", to: "/calendarios", label: "Calendário", shortLabel: "Calendário", icon: CalendarDays, end: false, noCelular: true },
  { key: "documentos", to: "/documentos", label: "Documentos", shortLabel: "Documentos", icon: FileText, noCelular: true },
  { key: "configuracoes", to: "/configuracoes", label: "Configurações", shortLabel: "Config.", icon: Settings },
  // registros (logs) ficam na seção DEU SEDE!; o atalho fica abaixo de Configurações
  { key: "registros", to: "/deu-sede/registros", label: "Registros (logs)", shortLabel: "Logs", icon: ScrollText },
];
