import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const base =
  "w-full rounded-xl border border-linha bg-white px-3 text-base text-verde placeholder:text-texto-suave/90 focus:border-amarelo focus:outline-none disabled:bg-offwhite/60 disabled:text-texto-suave";

const TIPOS_SEM_LIMITE_TEXTO = new Set(["number", "date", "time", "datetime-local", "month", "week", "color", "range", "file", "checkbox", "radio", "hidden"]);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, type = "text", maxLength, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    maxLength={maxLength ?? (TIPOS_SEM_LIMITE_TEXTO.has(type) ? undefined : 80)}
    className={cn(base, "h-11", className)}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, rows = 3, maxLength, ...props }, ref) => (
    <textarea ref={ref} rows={rows} maxLength={maxLength ?? 80} className={cn(base, "py-2.5", className)} {...props} />
  ),
);
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(base, "h-11 pr-8", className)} {...props} />
));
Select.displayName = "Select";

/** Rótulo + campo + ajuda/erro. O id do campo é ligado ao rótulo. */
export function Campo({
  rotulo,
  obrigatorio,
  ajuda,
  erro,
  className,
  children,
}: {
  rotulo: string;
  obrigatorio?: boolean;
  ajuda?: ReactNode;
  erro?: string | null;
  className?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-verde">
        {rotulo}
        {obrigatorio && <span className="text-perigo"> *</span>}
      </label>
      {children(id)}
      {erro ? <p className="text-xs font-medium text-perigo">{erro}</p> : ajuda ? <p className="text-xs text-texto-suave">{ajuda}</p> : null}
    </div>
  );
}

export function Interruptor({
  ligado,
  aoMudar,
  rotulo,
}: {
  ligado: boolean;
  aoMudar: (v: boolean) => void;
  rotulo: string;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-medium text-verde">
      <input type="checkbox" className="peer sr-only" checked={ligado} onChange={(e) => aoMudar(e.target.checked)} />
      <span className="relative h-6 w-11 shrink-0 rounded-full bg-linha transition-colors peer-checked:bg-verde peer-focus-visible:outline-3 peer-focus-visible:outline-ouro after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5" />
      {rotulo}
    </label>
  );
}
