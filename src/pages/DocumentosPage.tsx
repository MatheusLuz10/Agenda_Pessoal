import { FileText } from "lucide-react";

// Área de Documentos limpa, à espera do novo conteúdo.
// (A versão anterior continua em src/pages/DocumentsPage.tsx, sem uso.)
export function DocumentosPage() {
  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-verde sm:text-3xl">Documentos</h1>
      <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-linha px-6 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-offwhite text-marrom">
          <FileText className="size-6" />
        </span>
        <p className="font-semibold text-verde">Área em construção</p>
      </div>
    </>
  );
}
