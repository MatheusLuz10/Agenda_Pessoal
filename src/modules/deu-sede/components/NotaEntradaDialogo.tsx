import { useState } from "react";
import { Dialogo } from "@/modules/deu-sede/components/ui/dialogo";
import { Aviso, Carregando } from "@/modules/deu-sede/components/ui/aviso";
import { Button } from "@/modules/deu-sede/components/ui/button";
import { Interruptor } from "@/modules/deu-sede/components/ui/input";
import { executar, useConsulta } from "@/modules/deu-sede/data/cliente";
import type { Acesso, EntradaNota } from "@/modules/deu-sede/data/tipos";
import { dataBR, dataHoraBR, descreverEmbalagem, moeda, numero } from "@/modules/deu-sede/domain/formatos";
import { cn } from "@/lib/utils";

// "Compra avulsa": a nota só conta no Total comprado (painel, relatórios e
// fornecedor) quando alguém liga esta opção. Ligar cria um pedido avulso
// recebido com os itens e preços da nota; desligar tira esse pedido. O
// estoque não muda (a nota já deu a entrada). Só admin e comprador mudam.
function CompraAvulsa({ nota }: { nota: EntradaNota }) {
  const { dados: acesso } = useConsulta<Acesso | null>("meu_acesso");
  const podeMudar = acesso?.papel === "admin" || acesso?.papel === "comprador";
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const compra = nota.compra_avulsa ?? null;

  async function mudar(avulsa: boolean) {
    if (enviando) return;
    setEnviando(true);
    setErro(null);
    try {
      await executar("definir_compra_avulsa", { id: nota.id, avulsa });
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section aria-label="Compra avulsa" className={cn("flex flex-col gap-1 rounded-xl border p-3", compra ? "border-verde/40 bg-verde/5" : "border-linha")}>
      {podeMudar ? (
        <Interruptor ligado={!!compra} aoMudar={mudar} rotulo={enviando ? "Compra avulsa (salvando…)" : "Compra avulsa"} />
      ) : (
        <p className="text-sm font-medium text-verde">Compra avulsa: {compra ? "sim" : "não"}</p>
      )}
      <p className="text-sm text-texto-suave">
        {compra ? (
          <>
            Conta no <strong className="text-verde">Total comprado</strong> como {compra.numero_formatado} ({moeda(compra.valor_total)}).
            {podeMudar && " Desligue para tirar."}
          </>
        ) : (
          <>
            Não conta no Total comprado.{podeMudar && ` Ligue para somar o valor desta nota (${moeda(nota.total)}).`} O estoque não muda.
          </>
        )}
      </p>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
    </section>
  );
}

// Uma entrada por nota já gravada: o que entrou de cada produto, os preços
// e a lista colada como veio (para conferir com a nota em papel).
export function NotaEntradaDialogo({ id, aoFechar }: { id: string | null; aoFechar: () => void }) {
  const { dados: nota, erro } = useConsulta<EntradaNota>("obter_entrada_nota", id ? { id } : null);
  return (
    <Dialogo
      aberto={!!id}
      titulo={nota ? `Entrada ${nota.numero_formatado}` : "Entrada por nota"}
      aoFechar={aoFechar}
      rodape={
        <Button variant="contorno" onClick={aoFechar}>
          Fechar
        </Button>
      }
    >
      {erro ? (
        <Aviso tom="erro">{erro}</Aviso>
      ) : !nota ? (
        <Carregando />
      ) : (
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-texto-suave">Data da entrada</dt>
              <dd className="font-medium text-verde">{dataBR(nota.data_entrada)}</dd>
            </div>
            <div>
              <dt className="text-texto-suave">Nº da nota fiscal</dt>
              <dd className="font-medium text-verde">{nota.numero_nota || "—"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-texto-suave">Fornecedor</dt>
              <dd className="truncate font-medium text-verde">{nota.fornecedor_nome ?? "Sem fornecedor"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-texto-suave">Registrada</dt>
              <dd className="font-medium text-verde">
                {dataHoraBR(nota.created_at)}
                {nota.criado_por_nome ? ` · ${nota.criado_por_nome}` : ""}
              </dd>
            </div>
          </dl>

          <section aria-label="Produtos da nota">
            <h3 className="mb-2 text-sm font-semibold text-verde">
              {nota.itens.length} {nota.itens.length === 1 ? "produto" : "produtos"}
            </h3>
            <ul className="flex flex-col divide-y divide-linha rounded-xl border border-linha">
              {nota.itens.map((i) => {
                const q = Number(i.quantidade_embalagens);
                const un = Number(i.unidades_por_embalagem);
                return (
                  <li key={i.id} className="px-3 py-2">
                    <p className="font-medium break-words text-verde">{i.produto_nome}</p>
                    <p className="text-sm text-texto-suave">
                      {numero(q)} × {descreverEmbalagem(i.tipo_embalagem, un)} ·{" "}
                      <strong className="text-verde">entrou {numero(q * un)} un</strong>
                    </p>
                    <p className="text-sm text-texto-suave">
                      {i.preco_embalagem === null ? "sem preço" : `${moeda(i.preco_embalagem)} por embalagem`} ·{" "}
                      <span className="tabular-nums">{moeda(i.subtotal)}</span>
                    </p>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-right font-semibold text-verde">Total {moeda(nota.total)}</p>
          </section>

          <CompraAvulsa nota={nota} />

          {nota.observacoes && (
            <p className="text-sm text-texto-suave">
              <span className="font-medium text-verde">Observações:</span> {nota.observacoes}
            </p>
          )}

          {nota.lista_colada ? (
            <details className="rounded-xl border border-linha">
              <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-verde">Lista colada (como veio)</summary>
              <pre className="max-h-64 overflow-y-auto border-t border-linha px-3 py-2 font-sans text-sm break-words whitespace-pre-wrap text-texto">
                {nota.lista_colada}
              </pre>
            </details>
          ) : null}
        </div>
      )}
    </Dialogo>
  );
}
