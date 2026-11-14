import { useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "@/modules/deu-sede/components/ui/button";
import { Campo, Textarea } from "@/modules/deu-sede/components/ui/input";
import { Aviso } from "@/modules/deu-sede/components/ui/aviso";

// Janela modal simples no padrão da marca (no celular abre de baixo).
export function Dialogo({
  aberto,
  titulo,
  aoFechar,
  children,
  rodape,
}: {
  aberto: boolean;
  titulo: string;
  aoFechar: () => void;
  children: ReactNode;
  rodape?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // aoFechar costuma ser uma função nova a cada desenho da tela (a cada tecla
  // digitada): guardada aqui, não reabre o efeito abaixo
  const aoFecharRef = useRef(aoFechar);
  useEffect(() => {
    aoFecharRef.current = aoFechar;
  });
  // Só quando a janela ABRE: Esc fecha e o foco vai para o primeiro campo.
  // (Antes, cada tecla digitada mandava o foco de volta para o primeiro campo.)
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => e.key === "Escape" && aoFecharRef.current();
    document.addEventListener("keydown", aoTeclar);
    ref.current?.querySelector<HTMLElement>("textarea, input, select, button[data-principal]")?.focus();
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [aberto]);

  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <button type="button" className="absolute inset-0 bg-verde/50" aria-label="Fechar" onClick={aoFechar} />
      <div
        ref={ref}
        className="relative flex max-h-[90dvh] w-full flex-col rounded-t-2xl bg-superficie sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-linha px-5 py-3">
          <h2 className="text-base font-semibold text-verde">{titulo}</h2>
          <button
            type="button"
            onClick={aoFechar}
            className="flex size-10 items-center justify-center rounded-xl text-verde hover:bg-offwhite"
            aria-label="Fechar"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {rodape && (
          <div className="flex flex-col-reverse gap-2 border-t border-linha px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Confirmação de ação importante. Com `pedirMotivo`, exige uma
 * justificativa (mínimo 5 caracteres) e a entrega em `aoConfirmar`.
 */
export function Confirmar({
  aberto,
  titulo,
  mensagem,
  textoConfirmar = "Confirmar",
  perigo,
  pedirMotivo,
  rotuloMotivo = "Motivo",
  aoFechar,
  aoConfirmar,
}: {
  aberto: boolean;
  titulo: string;
  mensagem: ReactNode;
  textoConfirmar?: string;
  perigo?: boolean;
  pedirMotivo?: boolean;
  rotuloMotivo?: string;
  aoFechar: () => void;
  aoConfirmar: (motivo: string) => Promise<void> | void;
}) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const fechar = () => {
    if (enviando) return;
    setMotivo("");
    setErro(null);
    aoFechar();
  };

  async function confirmar() {
    if (pedirMotivo && motivo.trim().length < 5) {
      setErro("Escreva uma justificativa (mínimo 5 caracteres).");
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      await aoConfirmar(motivo.trim());
      setMotivo("");
      aoFechar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialogo
      aberto={aberto}
      titulo={titulo}
      aoFechar={fechar}
      rodape={
        <>
          <Button variant="contorno" onClick={fechar} disabled={enviando}>
            Voltar
          </Button>
          <Button data-principal variant={perigo ? "perigo" : "primario"} onClick={confirmar} disabled={enviando}>
            {enviando ? "Aguarde…" : textoConfirmar}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm text-texto">
        <div>{mensagem}</div>
        {pedirMotivo && (
          <Campo rotulo={rotuloMotivo} obrigatorio>
            {(id) => <Textarea id={id} value={motivo} onChange={(e) => setMotivo(e.target.value)} />}
          </Campo>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Dialogo>
  );
}
