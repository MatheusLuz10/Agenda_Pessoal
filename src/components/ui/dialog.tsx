import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Modal acessível construído sobre @radix-ui/react-dialog: o Radix cuida
// de foco, ESC para fechar, clique fora e portal (renderizar fora da
// árvore normal do DOM); aqui só aplicamos a aparência com Tailwind.
const Dialog = DialogPrimitive.Root; // estado aberto/fechado do modal
const DialogTrigger = DialogPrimitive.Trigger; // elemento que abre o modal ao ser clicado
const DialogPortal = DialogPrimitive.Portal; // renderiza o conteúdo direto no <body>
const DialogClose = DialogPrimitive.Close; // botão/elemento que fecha o modal

// Fundo escurecido (overlay) exibido atrás do modal.
function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  );
}

// Caixa central do modal: centraliza na tela, anima entrada/saída e
// inclui automaticamente o botão "X" de fechar no canto superior direito.
// Clicar fora do modal NÃO fecha — só o "X" (ou um botão explícito tipo
// "Cancelar"/"Fechar" no rodapé) — evita perder um formulário em
// preenchimento por um clique sem querer fora da caixa.
function DialogContent({
  className,
  children,
  onPointerDownOutside,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        onPointerDownOutside={onPointerDownOutside ?? ((e) => e.preventDefault())}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-card p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 max-h-[90vh] overflow-y-auto",
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute top-4 right-4 rounded-md opacity-60 transition-opacity hover:opacity-100 outline-none">
          <X className="size-4" />
          <span className="sr-only">Fechar</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

// Agrupa título + descrição no topo do modal.
function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5 mb-4", className)}
      {...props}
    />
  );
}

// Área de botões de ação no rodapé do modal (ex: "Salvar", "Cancelar").
function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex flex-col-reverse gap-2 mt-6 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

// Título principal do modal (lido em voz alta por leitores de tela).
function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg font-semibold", className)}
      {...props}
    />
  );
}

// Texto de apoio abaixo do título, explicando o propósito do modal.
function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogClose,
};
