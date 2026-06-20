import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

// Usado na tela de Tarefas para filtrar por calendário sem trocar de página.
const Tabs = TabsPrimitive.Root; // controla qual aba está ativa

// Faixa que agrupa visualmente os botões de aba.
function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "inline-flex h-10 items-center justify-center rounded-lg bg-muted p-1",
        className
      )}
      {...props}
    />
  );
}

// Botão de uma aba individual; fica destacado quando está ativo.
function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all data-[state=active]:bg-card data-[state=active]:shadow-sm",
        className
      )}
      {...props}
    />
  );
}

// Conteúdo exibido quando a aba correspondente está ativa.
function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("mt-4", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
