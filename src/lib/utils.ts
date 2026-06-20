import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// Combina várias classes Tailwind condicionalmente (clsx) e remove
// conflitos entre classes equivalentes (twMerge), ex: "p-2 p-4" -> "p-4".
// Usada em quase todo componente para mesclar classes padrão com as
// classes recebidas via prop `className`.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
