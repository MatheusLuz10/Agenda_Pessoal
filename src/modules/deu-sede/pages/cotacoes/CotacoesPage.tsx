import { useState } from "react";
import { Link } from "react-router-dom";
import { ClipboardList, Plus } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Aviso, Carregando, Vazio } from "@/modules/deu-sede/components/ui/aviso";
import { CampoBusca } from "@/modules/deu-sede/components/ui/filtros";
import { Select } from "@/modules/deu-sede/components/ui/input";
import { StatusCotacao } from "@/modules/deu-sede/components/ui/status-badge";
import { rota } from "@/modules/deu-sede/config/modules";
import { useConsulta } from "@/modules/deu-sede/data/cliente";
import { useAtrasado, useCadastros } from "@/modules/deu-sede/data/hooks";
import type { CotacaoResumo } from "@/modules/deu-sede/data/tipos";
import { COTACAO_STATUS, COTACAO_STATUS_LABEL } from "@/modules/deu-sede/domain/status";
import { dataBR, moeda } from "@/modules/deu-sede/domain/formatos";

export function CotacoesPage() {
  const { dados: cad } = useCadastros();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [vencidas, setVencidas] = useState(false);
  const buscaAtrasada = useAtrasado(busca);
  const { dados, erro, carregando } = useConsulta<CotacaoResumo[]>("listar_cotacoes", {
    busca: buscaAtrasada.trim() || undefined,
    status: status || undefined,
    fornecedor_id: fornecedor || undefined,
    somente_vencidas: vencidas || undefined,
  });

  return (
    <>
      <PageHeader
        title="Cotações"
        description="Orçamentos dos fornecedores. Cotação não é compra: só vira compra quando gerar um pedido."
        actions={
          <LinkBotao to={rota("cotacoes", "nova")}>
            <Plus className="size-4" /> Nova cotação
          </LinkBotao>
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_12rem_14rem_auto] sm:items-center">
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Número ou fornecedor" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">Todos os status</option>
          {COTACAO_STATUS.map((s) => (
            <option key={s} value={s}>
              {COTACAO_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Select value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} aria-label="Fornecedor">
          <option value="">Todos os fornecedores</option>
          {(cad?.fornecedores ?? []).map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </Select>
        <label className="flex h-11 items-center gap-2 text-sm font-medium text-verde">
          <input type="checkbox" className="size-5 accent-verde" checked={vencidas} onChange={(e) => setVencidas(e.target.checked)} />
          Só vencidas
        </label>
      </div>

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!dados && carregando && <Carregando />}
      {dados && dados.length === 0 && (
        <Vazio icone={ClipboardList} titulo={busca || status || fornecedor || vencidas ? "Nenhuma cotação encontrada" : "Nenhuma cotação registrada"}>
          {busca || status || fornecedor || vencidas ? "Mude os filtros." : "Registre os preços que os fornecedores apresentarem."}
        </Vazio>
      )}
      {dados && dados.length > 0 && (
        <ul className="flex flex-col gap-2">
          {dados.map((c) => (
            <li key={c.id}>
              <Link
                to={rota("cotacoes", c.id)}
                className="flex flex-col gap-1 rounded-xl border border-linha bg-superficie p-4 hover:border-amarelo sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold text-verde">
                    {c.numero_formatado} · {c.fornecedor_nome}
                  </span>
                  <span className="text-sm text-texto-suave">
                    {dataBR(c.data_cotacao)}
                    {c.validade && ` · válida até ${dataBR(c.validade)}`} · {c.qtd_itens} {c.qtd_itens === 1 ? "item" : "itens"}
                  </span>
                </span>
                <span className="flex items-center justify-between gap-3 sm:justify-end">
                  <StatusCotacao status={c.status} vencida={c.vencida} />
                  <span className="font-semibold text-verde tabular-nums">{moeda(c.valor_total)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
