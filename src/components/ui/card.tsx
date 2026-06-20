import * as React from "react";
import { cn } from "@/lib/utils";

// Conjunto de componentes "Card" no padrão shadcn/ui: cada peça é só uma
// <div> estilizada com uma função específica. Compor Card > CardHeader/
// CardContent/CardFooter dá consistência visual sem precisar repetir
// classes Tailwind em cada tela.

// Container externo do cartão (borda, fundo, sombra, cantos arredondados).
function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-sm",
        className
      )}
      {...props}
    />
  );
}

// Área de cabeçalho do cartão (título + descrição, normalmente).
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn("flex flex-col gap-1.5 p-5", className)}
      {...props}
    />
  );
}

// Título em destaque dentro do CardHeader.
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-semibold leading-none", className)}
      {...props}
    />
  );
}

// Texto secundário/explicativo abaixo do CardTitle.
function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

// Corpo principal do cartão, onde entra o conteúdo da tela.
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("p-5 pt-0", className)} {...props} />
  );
}

// Rodapé do cartão, geralmente usado para botões de ação.
function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center p-5 pt-0", className)}
      {...props}
    />
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
