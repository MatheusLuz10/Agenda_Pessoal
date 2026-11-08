import { cn } from "@/lib/utils";

// Marca d'água da distribuidora (recorte do banner: logo + bebidas), bem
// apagada e por cima do conteúdo, sem pegar cliques. O pai precisa ter
// "relative isolate" (e overflow-hidden para não vazar o recorte).
export function MarcaDagua({ className, imgClassName }: { className?: string; imgClassName?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden", className)}
    >
      <img
        src="/marca-dagua.webp"
        alt=""
        width={704}
        height={640}
        className={cn(
          "h-80 w-auto max-w-none opacity-[0.035] mix-blend-multiply [mask-image:radial-gradient(closest-side,black_55%,transparent)] dark:mix-blend-screen",
          imgClassName,
        )}
      />
    </div>
  );
}
