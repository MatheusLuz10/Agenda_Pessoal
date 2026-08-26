import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssistantChat } from "@/components/assistant/AssistantChat";

// Botão flutuante presente em qualquer tela (renderizado pelo
// AppLayout) que abre um popup de conversa com o Assistente — substitui
// a antiga aba/tela "/assistente". Fica acima da barra de navegação
// fixa embaixo (ver BottomNav em Sidebar.tsx), por isso "bottom-20".
export function AssistantWidget() {
  const [open, setOpen] = useState(false);
  // No celular, o teclado virtual encolhe o "visual viewport" sem mudar
  // o tamanho da janela — um painel só com `bottom-36` fixo pode acabar
  // atrás do teclado. Reagindo ao VisualViewport, o painel sobe junto
  // quando o teclado abre, em vez de ficar escondido embaixo dele.
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!open || !viewport) return;

    function handleViewportChange() {
      const offset = window.innerHeight - viewport!.height - viewport!.offsetTop;
      setKeyboardOffset(Math.max(0, offset));
    }

    handleViewportChange();
    viewport.addEventListener("resize", handleViewportChange);
    viewport.addEventListener("scroll", handleViewportChange);
    return () => {
      viewport.removeEventListener("resize", handleViewportChange);
      viewport.removeEventListener("scroll", handleViewportChange);
    };
  }, [open]);

  return (
    <>
      {open && (
        <div
          className="fixed right-4 z-40 flex w-[calc(100vw-2rem)] max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl"
          style={{ bottom: `calc(9rem + ${keyboardOffset}px)` }}
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <span className="text-sm font-semibold">Assistente</span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={() => setOpen(false)}
              aria-label="Fechar assistente"
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="p-4">
            <AssistantChat compact />
          </div>
        </div>
      )}

      <Button
        size="icon"
        onClick={() => setOpen((prev) => !prev)}
        className="fixed bottom-20 right-4 z-40 size-12 rounded-full shadow-lg"
        aria-label={open ? "Fechar assistente" : "Abrir assistente"}
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
      </Button>
    </>
  );
}
