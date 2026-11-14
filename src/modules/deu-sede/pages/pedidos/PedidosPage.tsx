import { useState } from "react";
import { Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Badge } from "@/modules/deu-sede/components/ui/badge";
import { Aviso, Carregando, Vazio } from "@/modules/deu-sede/components/ui/aviso";
import { CampoBusca } from "@/modules/deu-sede/components/ui/filtros";
import { Select } from "@/modules/deu-sede/components/ui/input";
import { StatusPedido } from "@/modules/deu-sede/components/ui/status-badge";
import { rota } from "@/modules/deu-sede/config/modules";
import { useConsulta } from "@/modules/deu-sede/data/cliente";
import { useAtrasado, useCadastros } from "@/modules/deu-sede/data/hooks";
import type { PedidoResumo } from "@/modules/deu-sede/data/tipos";
import { PEDIDO_STATUS, PEDIDO_STATUS_LABEL } from "@/modules/deu-sede/domain/status";
import { dataBR, moeda } from "@/modules/deu-sede/domain/formatos";

export function PedidosPage() {
  const { dados: cad } = useCadastros();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("abertos");
  const [fornecedor, setFornecedor] = useState("");
  const buscaAtrasada = useAtrasado(busca);
  const { dados, erro, carregando } = useConsulta<PedidoResumo[]>("listar_pedidos", {
    busca: buscaAtrasada.trim() || undefined,
    status: status && status !== "abertos" ? status : undefined,
    abertos: status === "abertos" || undefined,
    fornecedor_id: fornecedor || undefined,
  });

  return (
    <>
      <PageHeader
        title="Pedidos de compra"
        description="Pedidos enviados aos fornecedores e o andamento de cada entrega."
        actions={
          <LinkBotao to={rota("pedidos", "montar")}>
            <ShoppingCart className="size-4" /> Montar pedido
          </LinkBotao>
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_14rem_14rem]">
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Número do pedido ou fornecedor" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="abertos">Em andamento</option>
          <option value="">Todos os status</option>
          {PEDIDO_STATUS.map((s) => (
            <option key={s} value={s}>
              {PEDIDO_STATUS_LABEL[s]}
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
      </div>
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!dados && carregando && <Carregando />}
      {dados && dados.length === 0 && (
        <Vazio icone={ShoppingCart} titulo="Nenhum pedido encontrado">
          {status === "abertos" && !busca && !fornecedor ? "Nenhum pedido em andamento. Use “Montar pedido” para começar." : "Mude os filtros."}
        </Vazio>
      )}
      {dados && dados.length > 0 && (
        <ul className="flex flex-col gap-2">
          {dados.map((p) => (
            <li key={p.id}>
              <Link
                to={rota("pedidos", p.id)}
                className="flex flex-col gap-1 rounded-xl border border-linha bg-superficie p-4 hover:border-amarelo sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold text-verde">
                    {p.numero_formatado} · {p.fornecedor_nome} {p.nota_entrada_id && <Badge tone="amarelo">Pedido avulso</Badge>}
                  </span>
                  <span className="text-sm text-texto-suave">
                    {dataBR(p.data_pedido)} · {p.qtd_itens} {p.qtd_itens === 1 ? "produto" : "produtos"}
                    {p.previsao_entrega && ` · entrega prevista ${dataBR(p.previsao_entrega)}`}
                  </span>
                </span>
                <span className="flex items-center justify-between gap-3 sm:justify-end">
                  <StatusPedido status={p.status} />
                  <span className="font-semibold text-verde tabular-nums">{moeda(p.valor_total)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
