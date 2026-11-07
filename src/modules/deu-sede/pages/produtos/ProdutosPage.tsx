import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Package, Plus } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Badge } from "@/modules/deu-sede/components/ui/badge";
import { Aviso, Carregando, Vazio } from "@/modules/deu-sede/components/ui/aviso";
import { CampoBusca, Segmentado } from "@/modules/deu-sede/components/ui/filtros";
import { Select } from "@/modules/deu-sede/components/ui/input";
import { rota } from "@/modules/deu-sede/config/modules";
import { useCadastros } from "@/modules/deu-sede/data/hooks";
import { contemBusca, descreverEmbalagem, descreverVolume, moedaUnitaria } from "@/modules/deu-sede/domain/formatos";

type FiltroStatus = "ativos" | "inativos" | "todos";

export function ProdutosPage() {
  const { dados, erro, categorias, vinculosPorProduto } = useCadastros();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [status, setStatus] = useState<FiltroStatus>("ativos");

  const lista = useMemo(
    () =>
      (dados?.produtos ?? []).filter(
        (p) =>
          contemBusca(busca, p.nome, p.marca, p.codigo) &&
          (!categoria || p.categoria_id === categoria) &&
          (status === "todos" || p.ativo === (status === "ativos")),
      ),
    [dados, busca, categoria, status],
  );

  return (
    <>
      <PageHeader
        title="Produtos"
        description="Cadastro central de produtos, embalagens e preços por fornecedor."
        actions={
          <LinkBotao to={rota("produtos", "novo")}>
            <Plus className="size-4" /> Novo produto
          </LinkBotao>
        }
      />

      {erro && <Aviso tom="erro">{erro}</Aviso>}
      {!dados && !erro && <Carregando />}

      {dados && dados.produtos.length === 0 && (
        <Vazio icone={Package} titulo="Nenhum produto cadastrado">
          Cadastre os produtos que a DEU SEDE! compra. Depois registre as cotações dos fornecedores.
        </Vazio>
      )}

      {dados && dados.produtos.length > 0 && (
        <>
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Pesquisar por nome, marca ou código" className="sm:flex-1" />
            <Select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria" className="sm:w-52">
              <option value="">Todas as categorias</option>
              {dados.categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
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
            {lista.length} {lista.length === 1 ? "produto" : "produtos"}
          </p>

          {lista.length === 0 ? (
            <Vazio icone={Package} titulo="Nenhum produto encontrado">
              Mude a busca ou os filtros.
            </Vazio>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {lista.map((p) => {
                const precos = (vinculosPorProduto.get(p.id) ?? []).filter((v) => v.ativo && v.preco_unitario !== null);
                const menor = precos.length ? Math.min(...precos.map((v) => Number(v.preco_unitario))) : null;
                const detalhes = [p.marca, descreverVolume(p.volume_por_unidade, p.unidade_medida), descreverEmbalagem(p.tipo_embalagem, p.unidades_por_embalagem)]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li key={p.id}>
                    <Link
                      to={rota("produtos", p.id)}
                      className="flex h-full flex-col gap-1.5 rounded-xl border border-linha bg-superficie p-4 hover:border-amarelo"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-verde">{p.nome}</span>
                        <span className="flex shrink-0 gap-1">
                          {!p.ativo && <Badge tone="perigo">Inativo</Badge>}
                          <Badge>{categorias.get(p.categoria_id)?.nome ?? "—"}</Badge>
                        </span>
                      </div>
                      <span className="text-sm text-texto-suave">{detalhes}</span>
                      <span className="text-sm text-texto">
                        {menor !== null ? (
                          <>
                            Menor preço atual: <strong>{moedaUnitaria(menor)}</strong>/un · {precos.length}{" "}
                            {precos.length === 1 ? "fornecedor" : "fornecedores"}
                          </>
                        ) : (
                          <span className="text-texto-suave">Sem preço cadastrado</span>
                        )}
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
