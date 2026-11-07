import { fimDoMes, hojeISO, inicioDoMes, somarDias } from "@/modules/deu-sede/domain/formatos";

export type Atalho = "hoje" | "mes" | "mes_passado" | "90dias" | "ano" | "personalizado";

export interface Periodo {
  de: string;
  ate: string;
  atalho: Atalho;
}

export function periodoDoAtalho(atalho: Atalho, atual?: Periodo, hoje = hojeISO()): Periodo {
  switch (atalho) {
    case "hoje":
      return { atalho, de: hoje, ate: hoje };
    case "mes":
      return { atalho, de: inicioDoMes(hoje), ate: hoje };
    case "mes_passado":
      return { atalho, de: inicioDoMes(hoje, -1), ate: fimDoMes(inicioDoMes(hoje, -1)) };
    case "90dias":
      return { atalho, de: somarDias(hoje, -89), ate: hoje };
    case "ano":
      return { atalho, de: `${hoje.slice(0, 4)}-01-01`, ate: hoje };
    default:
      return { atalho, de: atual?.de ?? inicioDoMes(hoje), ate: atual?.ate ?? hoje };
  }
}
