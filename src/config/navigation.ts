import { CalendarDays, FileText, ScanBarcode, Settings, ShoppingCart } from "lucide-react";
import type { ItemMenu } from "@/components/layout/Shell";

// Menu do app (lateral no computador, barra inferior no celular — ver
// components/layout/Shell). O assistente continua como balão flutuante
// (AssistantWidget), não como aba.
export const NAV_ITEMS: ItemMenu[] = [
  { key: "agenda", to: "/calendarios", label: "Calendário", shortLabel: "Calendário", icon: CalendarDays, end: false },
  { key: "documentos", to: "/documentos", label: "Documentos", shortLabel: "Documentos", icon: FileText },
  { key: "pdv", to: "/pdv", label: "PDV", shortLabel: "PDV", icon: ScanBarcode },
  // Abre a seção de compras, que tem menu próprio.
  { key: "deu-sede", to: "/deu-sede", label: "DEU SEDE! Compras", shortLabel: "DEU SEDE!", icon: ShoppingCart },
  { key: "configuracoes", to: "/configuracoes", label: "Configurações", shortLabel: "Config.", icon: Settings },
];
