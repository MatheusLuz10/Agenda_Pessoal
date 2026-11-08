import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { cn } from "@/lib/utils";

type Variant = "primario" | "secundario" | "contorno" | "fantasma" | "perigo";
type Size = "md" | "lg" | "icone" | "sm";

const variants: Record<Variant, string> = {
  primario: "bg-amarelo text-verde hover:bg-ouro font-semibold",
  secundario: "bg-verde text-creme hover:bg-verde-700 font-semibold",
  contorno: "border border-linha bg-superficie text-verde hover:bg-offwhite font-medium",
  fantasma: "text-verde hover:bg-offwhite font-medium",
  perigo: "bg-perigo text-destructive-foreground hover:opacity-90 font-semibold",
};

// Botões grandes por padrão (mín. 44px de altura) para uso no celular.
const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm gap-1.5",
  md: "h-11 px-4 text-sm gap-2",
  lg: "h-13 px-6 text-base gap-2",
  icone: "size-11",
};

function classes(variant: Variant, size: Size, className?: string) {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-xl text-center transition-colors disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primario", size = "md", type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={classes(variant, size, className)} {...props} />
  ),
);
Button.displayName = "Button";

/** Link com cara de botão (navegação). */
export function LinkBotao({
  variant = "primario",
  size = "md",
  className,
  ...props
}: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={classes(variant, size, className)} {...props} />;
}
