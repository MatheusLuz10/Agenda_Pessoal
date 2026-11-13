import { lazy, Suspense, type ComponentType } from "react";
import { Carregando } from "@/modules/deu-sede/components/ui/aviso";

// Carrega o código de uma tela só quando ela é aberta (React.lazy), em vez
// de baixar todas as telas junto com o app. Cada tela vira um arquivo
// separado no build.
//
// Depois de um novo deploy, os arquivos antigos deixam de existir e quem
// estava com o app aberto receberia erro ao abrir outra tela. Nesse caso a
// página é recarregada uma vez, para buscar a versão nova.

const CHAVE_RECARGA = "tela-sob-demanda:recarregou";

function lerRecarga(): boolean {
  try {
    return sessionStorage.getItem(CHAVE_RECARGA) === "1";
  } catch {
    return false;
  }
}

function gravarRecarga(valor: boolean) {
  try {
    if (valor) sessionStorage.setItem(CHAVE_RECARGA, "1");
    else sessionStorage.removeItem(CHAVE_RECARGA);
  } catch {
    /* sem sessionStorage: segue sem a proteção contra recarga em loop */
  }
}

async function importarComRecarga<M>(importar: () => Promise<M>): Promise<M> {
  try {
    const modulo = await importar();
    gravarRecarga(false);
    return modulo;
  } catch (erro) {
    if (!lerRecarga()) {
      gravarRecarga(true);
      window.location.reload();
      // segura a tela até o navegador recarregar
      return new Promise<M>(() => {});
    }
    throw erro;
  }
}

/**
 * Uso: `const ProdutosPage = telaSobDemanda(() => import("./ProdutosPage"), "ProdutosPage");`
 * O segundo argumento é o nome do componente exportado pelo arquivo.
 */
export function telaSobDemanda<M extends Record<string, unknown>, K extends keyof M & string>(
  importar: () => Promise<M>,
  nome: K,
) {
  const Tela = lazy(async () => {
    const modulo = await importarComRecarga(importar);
    return { default: modulo[nome] as ComponentType };
  });
  function TelaSobDemanda() {
    return (
      <Suspense fallback={<Carregando />}>
        <Tela />
      </Suspense>
    );
  }
  TelaSobDemanda.displayName = `SobDemanda(${nome})`;
  return TelaSobDemanda;
}
