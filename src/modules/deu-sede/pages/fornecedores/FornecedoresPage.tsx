import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Store } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Badge } from "@/modules/deu-sede/components/ui/badge";
import { Aviso, Carregando, Vazio } from "@/modules/deu-sede/components/ui/aviso";
import { CampoBusca, Segmentado } from "@/modules/deu-sede/components/ui/filtros";
import { rota } from "@/modules/deu-sede/config/modules";
import { useCadastros } from "@/modules/deu-sede/data/hooks";
import { contemBusca, formatarCnpj, formatarTelefone } from "@/modules/deu-sede/domain/formatos";

type FiltroStatus = "ativos" | "inativos" | "todos";

export function FornecedoresPage() {
  const { dados, erro, vinculosPorFornecedor } = useCadastros();
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState<FiltroStatus>("ativos");

  const lista = useMemo(
    () =>
      (dados?.fornecedores ?? []).filter(
        (f) =>
          contemBusca(busca, f.nome, f.vendedor, f.cnpj, formatarCnpj(f.cnpj), f.telefone, f.whatsapp, f.email) &&
          (status === "todos" || f.ativo === (status === "ativos")),
      ),
    [dados, busca, status],
  );

  return (
    <>
      <PageHeader
        title="Fornecedores"
        description="Contatos, condições comerciais e histórico de cada fornecedor."
        actions={
          <LinkBotao to={rota("fornecedores", "novo")}>
            <Plus className="size-4" /> Novo fornecedor
          </LinkBotao>
        }
      />
      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!dados && !erro && <Carregando />}
      {dados && dados.fornecedores.length === 0 && (
        <Vazio icone={Store} titulo="Nenhum fornecedor cadastrado">
          Cadastre os fornecedores para montar e enviar pedidos pelo WhatsApp.
        </Vazio>
      )}
      {dados && dados.fornecedores.length > 0 && (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Pesquisar por nome, vendedor, CNPJ ou telefone" className="sm:flex-1" />
            <Segmentado
              rotulo="Situação"
              valor={status}
              aoMudar={setStatus}
              opcoes={[
                { valor: "ativos", rotulo: "Ativos" },
                { valor: "inativos", rotulo: "Inativos" },
                { valor: "todos", rotulo: "Todos" },
              ]}
            />
          </div>
          <p className="mb-2 text-sm text-texto-suave">
            {lista.length} {lista.length === 1 ? "fornecedor" : "fornecedores"}
          </p>
          {lista.length === 0 ? (
            <Vazio icone={Store} titulo="Nenhum fornecedor encontrado">
              Mude a busca ou o filtro.
            </Vazio>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {lista.map((f) => {
                const produtos = (vinculosPorFornecedor.get(f.id) ?? []).filter((v) => v.ativo).length;
                return (
                  <li key={f.id}>
                    <Link
                      to={rota("fornecedores", f.id)}
                      className="flex h-full flex-col gap-1 rounded-xl border border-linha bg-superficie p-4 hover:border-amarelo"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-verde">{f.nome}</span>
                        {!f.ativo && <Badge tone="perigo">Inativo</Badge>}
                      </span>
                      {f.vendedor && <span className="text-sm text-texto">Vendedor: {f.vendedor}</span>}
                      <span className="text-sm text-texto-suave">
                        {[f.whatsapp && `WhatsApp ${formatarTelefone(f.whatsapp)}`, f.telefone && formatarTelefone(f.telefone)]
                          .filter(Boolean)
                          .join(" · ") || "Sem telefone"}
                      </span>
                      <span className="text-sm text-texto-suave">
                        {produtos} {produtos === 1 ? "produto com preço" : "produtos com preço"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </>
  );
}
