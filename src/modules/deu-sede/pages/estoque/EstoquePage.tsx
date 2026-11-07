import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PackagePlus, Warehouse } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Button, LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Badge } from "@/modules/deu-sede/components/ui/badge";
import { Aviso, Carregando, Vazio } from "@/modules/deu-sede/components/ui/aviso";
import { CampoBusca, Segmentado } from "@/modules/deu-sede/components/ui/filtros";
import { Select } from "@/modules/deu-sede/components/ui/input";
import { Secao, Tabela } from "@/modules/deu-sede/components/ui/secao";
import { MovimentoEstoqueDialog } from "@/modules/deu-sede/components/MovimentoEstoqueDialog";
import { rota } from "@/modules/deu-sede/config/modules";
import { useConsulta } from "@/modules/deu-sede/data/cliente";
import { useCadastros } from "@/modules/deu-sede/data/hooks";
import type { EntradaNotaResumo, ItemEstoque, MovimentoEstoque } from "@/modules/deu-sede/data/tipos";
import { contemBusca, dataBR, dataHoraBR, descreverQuantidade, moeda, moedaUnitaria, numero } from "@/modules/deu-sede/domain/formatos";
import { useSenha } from "@/modules/deu-sede/senha";

type Aba = "saldo" | "movimentos" | "entradas";
type Filtro = "com_saldo" | "abaixo" | "todos";

export function EstoquePage() {
  const [aba, setAba] = useState<Aba>("saldo");
  return (
    <>
      <PageHeader
        title="Estoque"
        description="Saldo de cada produto. Entra pelo recebimento de pedidos e pela entrada de notas; sai pelas vendas do PDV e por saídas/ajustes."
        actions={
          <LinkBotao to={rota("estoque", "entrada")}>
            <PackagePlus className="size-4" /> Entrada por nota
          </LinkBotao>
        }
      />
      <div className="mb-4">
        <Segmentado<Aba>
          rotulo="Visão"
          valor={aba}
          aoMudar={setAba}
          opcoes={[
            { valor: "saldo", rotulo: "Saldo" },
            { valor: "movimentos", rotulo: "Movimentações" },
            { valor: "entradas", rotulo: "Entradas por nota" },
          ]}
        />
      </div>
      {aba === "saldo" && <Saldo />}
      {aba === "movimentos" && <Movimentos />}
      {aba === "entradas" && <Entradas />}
    </>
  );
}

function Saldo() {
  const { dados, erro } = useConsulta<ItemEstoque[]>("estoque");
  const { dados: cad } = useCadastros();
  const { pedirSenha } = useSenha();
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("com_saldo");
  const [movendo, setMovendo] = useState<ItemEstoque | null>(null);

  const lista = useMemo(
    () =>
      (dados ?? []).filter(
        (e) =>
          contemBusca(busca, e.produto_nome, e.codigo) &&
          (!categoria || e.categoria_id === categoria) &&
          (filtro === "todos" || (filtro === "abaixo" ? e.abaixo_minimo : Number(e.saldo_unidades) !== 0)),
      ),
    [dados, busca, categoria, filtro],
  );
  const valor = (dados ?? []).reduce((s, e) => s + Number(e.valor_estimado), 0);
  const abaixo = (dados ?? []).filter((e) => e.abaixo_minimo && e.ativo).length;

  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile rotulo="Valor estimado em estoque" valor={moeda(valor)} />
        <Tile rotulo="Produtos com estoque" valor={String(dados.filter((e) => Number(e.saldo_unidades) > 0).length)} />
        <button type="button" onClick={() => setFiltro("abaixo")} className="text-left">
          <Tile rotulo="Abaixo do mínimo" valor={String(abaixo)} alerta={abaixo > 0} />
        </button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <CampoBusca valor={busca} aoMudar={setBusca} placeholder="Pesquisar produto ou código" className="sm:flex-1" />
        <Select value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria" className="sm:w-52">
          <option value="">Todas as categorias</option>
          {(cad?.categorias ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Select>
        <Segmentado<Filtro>
          rotulo="Mostrar"
          valor={filtro}
          aoMudar={setFiltro}
          opcoes={[
            { valor: "com_saldo", rotulo: "Com estoque" },
            { valor: "abaixo", rotulo: "Abaixo do mínimo" },
            { valor: "todos", rotulo: "Todos" },
          ]}
        />
      </div>
      {lista.length === 0 ? (
        <Vazio icone={Warehouse} titulo="Nada para mostrar">
          {filtro === "com_saldo" ? "Nenhum produto com estoque. Registre um recebimento ou uma entrada por nota." : "Mude a busca ou o filtro."}
        </Vazio>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((e) => (
            <li key={e.produto_id} className="flex flex-col gap-2 rounded-xl border border-linha bg-superficie p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link to={rota("produtos", e.produto_id)} className="font-semibold text-verde hover:underline">
                  {e.produto_nome}
                </Link>
                <p className="text-sm text-texto-suave">
                  {e.categoria_nome}
                  {e.ultimo_custo_unitario !== null && ` · último custo ${moedaUnitaria(e.ultimo_custo_unitario)}/un`}
                  {e.ultima_entrada && ` · última entrada ${dataBR(e.ultima_entrada)}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <span className="text-right">
                  <span className={Number(e.saldo_unidades) < 0 ? "block font-bold text-perigo" : "block font-bold text-verde"}>
                    {descreverQuantidade(e.saldo_unidades, e.unidades_por_embalagem, e.tipo_embalagem)}
                  </span>
                  <span className="block text-xs text-texto-suave">
                    {numero(e.saldo_unidades)} un{e.estoque_minimo !== null && ` · mínimo ${numero(e.estoque_minimo)} emb.`}
                  </span>
                </span>
                {e.abaixo_minimo && <Badge tone="amarelo">Abaixo do mínimo</Badge>}
                <Button size="sm" variant="contorno" onClick={async () => (await pedirSenha("estoque_ajuste")) && setMovendo(e)}>
                  Saída / ajuste
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {movendo && <MovimentoEstoqueDialog item={movendo} aoFechar={() => setMovendo(null)} />}
    </div>
  );
}

const ORIGEM: Record<MovimentoEstoque["origem"], string> = {
  recebimento: "Recebimento de pedido",
  nota: "Entrada por nota",
  saida_manual: "Saída",
  ajuste_contagem: "Ajuste de contagem",
  estorno_recebimento: "Estorno de recebimento",
  venda: "Venda (PDV)",
  estorno_venda: "Venda cancelada",
};

export function ListaMovimentos({ movimentos, mostrarProduto = true }: { movimentos: MovimentoEstoque[]; mostrarProduto?: boolean }) {
  if (movimentos.length === 0) return <p className="px-5 pb-4 text-sm text-texto-suave">Nenhuma movimentação.</p>;
  return (
    <Tabela>
      <thead>
        <tr>
          <th>Quando</th>
          {mostrarProduto && <th>Produto</th>}
          <th>Origem</th>
          <th className="num">Quantidade</th>
          <th className="num">Saldo depois</th>
        </tr>
      </thead>
      <tbody>
        {movimentos.map((m) => (
          <tr key={m.id}>
            <td className="text-xs">{dataHoraBR(m.created_at)}</td>
            {mostrarProduto && (
              <td>
                <Link to={rota("produtos", m.produto_id)} className="font-medium text-verde hover:underline">
                  {m.produto_nome}
                </Link>
              </td>
            )}
            <td>
              {ORIGEM[m.origem]}{" "}
              {m.pedido_id && (
                <Link to={rota("pedidos", m.pedido_id)} className="text-marrom underline">
                  {m.pedido_numero}
                </Link>
              )}
              {m.nota_entrada_numero && <span className="text-texto-suave">{m.nota_entrada_numero}</span>}
              {m.venda_numero && <span className="text-texto-suave">{m.venda_numero}</span>}
              {m.fornecedor_nome && <span className="block text-xs text-texto-suave">{m.fornecedor_nome}{m.nota_fiscal && ` · NF ${m.nota_fiscal}`}</span>}
              {m.motivo && m.origem !== "venda" && <span className="block text-xs text-texto-suave">{m.motivo}</span>}
            </td>
            <td className={Number(m.quantidade_unidades) < 0 ? "num font-semibold text-perigo" : "num font-semibold text-sucesso"}>
              {Number(m.quantidade_unidades) > 0 ? "+" : ""}
              {numero(m.quantidade_unidades)} un
            </td>
            <td className="num">{descreverQuantidade(m.saldo_apos, m.unidades_por_embalagem, m.tipo_embalagem)}</td>
          </tr>
        ))}
      </tbody>
    </Tabela>
  );
}

function Movimentos() {
  const { dados, erro } = useConsulta<MovimentoEstoque[]>("movimentos_estoque", { limite: 200 });
  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;
  return (
    <Secao titulo="Últimas movimentações" descricao="Cada entrada e saída fica registrada para sempre; correções viram um novo ajuste." semPadding>
      <ListaMovimentos movimentos={dados} />
    </Secao>
  );
}

function Entradas() {
  const { dados, erro } = useConsulta<EntradaNotaResumo[]>("listar_entradas_nota");
  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;
  return (
    <Secao titulo="Entradas por nota (sem pedido)" semPadding>
      {dados.length === 0 ? (
        <p className="px-5 pb-4 text-sm text-texto-suave">Nenhuma entrada por nota ainda.</p>
      ) : (
        <ul className="divide-y divide-linha">
          {dados.map((n) => (
            <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
              <span>
                <span className="block font-medium text-verde">
                  {n.numero_formatado} · {n.fornecedor_nome ?? "Sem fornecedor"}
                </span>
                <span className="text-sm text-texto-suave">
                  {dataBR(n.data_entrada)}
                  {n.numero_nota && ` · NF ${n.numero_nota}`} · {n.qtd_itens} {n.qtd_itens === 1 ? "produto" : "produtos"}
                </span>
              </span>
              <span className="font-semibold text-verde tabular-nums">{moeda(n.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}

function Tile({ rotulo, valor, alerta }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className={alerta ? "rounded-xl border border-amarelo bg-amarelo/15 px-4 py-3" : "rounded-xl border border-linha bg-superficie px-4 py-3"}>
      <p className="text-xs font-medium tracking-wide text-texto-suave uppercase">{rotulo}</p>
      <p className="mt-1 text-xl font-bold text-verde tabular-nums">{valor}</p>
    </div>
  );
}
