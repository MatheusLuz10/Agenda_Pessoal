import { CalendarDays, ScanBarcode, ShoppingCart } from "lucide-react";
import type { ItemMenu } from "@/components/layout/Shell";

// Menu do app (lateral no computador, barra inferior no celular — ver
// components/layout/Shell). O assistente continua como balão flutuante
// (AssistantWidget), não como aba.
export const NAV_ITEMS: ItemMenu[] = [
  // Abre a administração (compras, estoque, financeiro...), que tem menu próprio.
  { key: "deu-sede", to: "/deu-sede", label: "ADM - DEU SEDE!", shortLabel: "ADM", icon: ShoppingCart, noCelular: true },
  { key: "pdv", to: "/pdv", label: "PDV", shortLabel: "PDV", icon: ScanBarcode, noCelular: true },
  { key: "agenda", to: "/calendarios", label: "Calendário", shortLabel: "Calendário", icon: CalendarDays, end: false, noCelular: true },
];
