import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCheck } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Button, LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Aviso, Carregando } from "@/modules/deu-sede/components/ui/aviso";
import { Campo, Input, Textarea } from "@/modules/deu-sede/components/ui/input";
import { Confirmar } from "@/modules/deu-sede/components/ui/dialogo";
import { Secao } from "@/modules/deu-sede/components/ui/secao";
import { BotaoColarLista, ColarListaDialog, type CandidatoLista } from "@/modules/deu-sede/components/ColarListaDialog";
import { rota } from "@/modules/deu-sede/config/modules";
import { executar, useConsulta } from "@/modules/deu-sede/data/cliente";
import { useCadastros } from "@/modules/deu-sede/data/hooks";
import type { PedidoDetalhe } from "@/modules/deu-sede/data/tipos";
import { pedidoAceitaRecebimento } from "@/modules/deu-sede/domain/status";
import { precoMudou } from "@/modules/deu-sede/domain/colarLista";
import { descreverEmbalagem, hojeISO, lerDecimal, moeda, numero, paraCampo } from "@/modules/deu-sede/domain/formatos";

export function RegistrarRecebimentoPage() {
  const { pedidoId = "" } = useParams();
  const { dados: p, erro } = useConsulta<PedidoDetalhe | null>("obter_pedido", { id: pedidoId });
  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (p === undefined) return <Carregando />;
  if (!p) return <Aviso tom="erro">Pedido não encontrado.</Aviso>;
  if (!pedidoAceitaRecebimento(p.status)) {
    return (
      <Aviso tom="atencao">
        O pedido {p.numero_formatado} não aceita recebimento agora (precisa ter sido enviado ao fornecedor e não estar concluído).{" "}
        <Link to={rota("pedidos", p.id)} className="font-semibold underline">
          Voltar ao pedido
        </Link>
      </Aviso>
    );
  }
  return <Formulario key={p.id} pedido={p} />;
}

interface Entrada {
  recebida: string;
  danificada: string;
  preco: string;
  obs: string;
}

function Formulario({ pedido }: { pedido: PedidoDetalhe }) {
  const navigate = useNavigate();
  const { produtos, vinculosPorFornecedor } = useCadastros();
  const [chave] = useState(() => crypto.randomUUID());
  const [data, setData] = useState(hojeISO());
  const [nota, setNota] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [entradas, setEntradas] = useState<Record<string, Entrada>>(() =>
    Object.fromEntries(pedido.itens.map((i) => [i.id, { recebida: "", danificada: "", preco: "", obs: "" }])),
  );
  const [concluir, setConcluir] = useState(false);
  const [justificativa, setJustificativa] = useState("");
  const [atualizarPrecos, setAtualizarPrecos] = useState(true);
  const [colarAberto, setColarAberto] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const mudar = (id: string, campos: Partial<Entrada>) => setEntradas((x) => ({ ...x, [id]: { ...x[id], ...campos } }));

  const linhas = pedido.itens.map((i) => {
    const e = entradas[i.id];
    const recebida = lerDecimal(e.recebida) ?? 0;
    const danificada = lerDecimal(e.danificada) ?? 0;
    const preco = lerDecimal(e.preco);
    const pendenteDepois = Math.max(0, Number(i.quantidade_pendente) - (recebida - danificada));
    return { i, e, recebida, danificada, preco, pendenteDepois, divergente: precoMudou(preco, i.preco_embalagem) };
  });
  const pendenteDepois = linhas.reduce((s, l) => s + l.pendenteDepois, 0);
  const divergentes = linhas.filter((l) => l.divergente);

  function validar(): string | null {
    if (!linhas.some((l) => l.recebida > 0 || l.danificada > 0)) return "Informe a quantidade recebida de ao menos um produto.";
    for (const l of linhas) {
      const nome = l.i.produto_nome;
      if ([l.recebida, l.danificada, l.preco ?? 0].some((n) => Number.isNaN(n) || n < 0)) return `Valor inválido em "${nome}".`;
      if (l.danificada > l.recebida) return `Em "${nome}", avariadas não pode ser maior que recebidas.`;
      if (l.recebida - l.danificada > Number(l.i.quantidade_pendente) + 1e-9)
        return `Em "${nome}", chegou mais do que o pendente (${numero(l.i.quantidade_pendente)}). Registre o excedente nas observações.`;
    }
    if (concluir && pendenteDepois > 0 && justificativa.trim().length < 5) return "Explique por que o pedido será concluído com itens pendentes.";
    if (!data) return "Informe a data do recebimento.";
    return null;
  }

  function revisar() {
    const problema = validar();
    setErro(problema);
    if (!problema) setConfirmar(true);
  }

  async function registrar() {
    await executar("registrar_recebimento", {
      pedido_id: pedido.id,
      chave_idempotencia: chave,
      data_recebimento: data,
      nota_fiscal: nota,
      observacoes,
      concluir: concluir && pendenteDepois > 0,
      justificativa,
      atualizar_precos: divergentes.length > 0 && atualizarPrecos,
      itens: linhas.map((l) => ({
        pedido_item_id: l.i.id,
        quantidade_recebida: l.recebida,
        quantidade_danificada: l.danificada,
        preco_cobrado: l.preco,
        observacoes: l.e.obs,
      })),
    });
    navigate(rota("pedidos", pedido.id), { replace: true });
  }

  const candidatos: CandidatoLista[] = pedido.itens.map((i) => {
    const produto = produtos.get(i.produto_id);
    const vinculo = (vinculosPorFornecedor.get(pedido.fornecedor_id) ?? []).find((v) => v.produto_id === i.produto_id);
    return {
      id: i.id,
      nome: i.produto_nome,
      rotulo: `${i.produto_nome} · ${descreverEmbalagem(i.tipo_embalagem, i.unidades_por_embalagem)}`,
      codigos: [produto?.codigo, vinculo?.codigo_no_fornecedor],
      unidadesPorEmbalagem: i.unidades_por_embalagem,
      precoReferencia: i.preco_embalagem,
    };
  });

  return (
    <>
      <PageHeader
        title={`Recebimento do pedido ${pedido.numero_formatado}`}
        description={`${pedido.fornecedor_nome} · confira o que chegou`}
        actions={<BotaoColarLista aoClicar={() => setColarAberto(true)} />}
      />
      <div className="grid gap-5">
        <Secao titulo="Nota e data">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Data do recebimento" obrigatorio>
              {(id) => <Input id={id} type="date" value={data} max={hojeISO()} onChange={(e) => setData(e.target.value)} />}
            </Campo>
            <Campo rotulo="Número da nota fiscal">{(id) => <Input id={id} value={nota} onChange={(e) => setNota(e.target.value)} />}</Campo>
          </div>
        </Secao>

        <Secao
          titulo="Conferência dos produtos"
          descricao="Quantidades na embalagem do pedido. Preencha o preço só se a nota veio diferente do pedido."
          acoes={
            <Button
              size="sm"
              variant="secundario"
              onClick={() =>
                setEntradas((x) =>
                  Object.fromEntries(pedido.itens.map((i) => [i.id, { ...x[i.id], recebida: paraCampo(Number(i.quantidade_pendente)) }])),
                )
              }
            >
              <CheckCheck className="size-4" /> Tudo chegou conforme o pedido
            </Button>
          }
        >
          <ul className="flex flex-col gap-3">
            {linhas.map((l) => (
              <li key={l.i.id} className="rounded-xl border border-linha p-3">
                <p className="font-semibold text-verde">{l.i.produto_nome}</p>
                <p className="text-sm text-texto-suave">
                  {descreverEmbalagem(l.i.tipo_embalagem, l.i.unidades_por_embalagem)} · pedido {numero(l.i.quantidade_embalagens)} · pendente{" "}
                  <strong>{numero(l.i.quantidade_pendente)}</strong> · {moeda(l.i.preco_embalagem)}/emb.
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <Campo rotulo="Recebidas">
                    {(id) => <Input id={id} inputMode="decimal" value={l.e.recebida} onChange={(e) => mudar(l.i.id, { recebida: e.target.value })} />}
                  </Campo>
                  <Campo rotulo="Avariadas">
                    {(id) => <Input id={id} inputMode="decimal" placeholder="0" value={l.e.danificada} onChange={(e) => mudar(l.i.id, { danificada: e.target.value })} />}
                  </Campo>
                  <Campo rotulo="Preço na nota">
                    {(id) => (
                      <Input id={id} inputMode="decimal" placeholder={paraCampo(l.i.preco_embalagem, 2)} value={l.e.preco} onChange={(e) => mudar(l.i.id, { preco: e.target.value })} />
                    )}
                  </Campo>
                </div>
                <Input
                  className="mt-2"
                  aria-label={`Observação sobre ${l.i.produto_nome}`}
                  placeholder="Observação (opcional)"
                  value={l.e.obs}
                  onChange={(e) => mudar(l.i.id, { obs: e.target.value })}
                />
                <p className="mt-2 flex flex-wrap gap-x-4 text-sm">
                  {l.recebida > 0 && (
                    <span className={l.pendenteDepois > 0 ? "text-marrom" : "text-sucesso"}>
                      {l.pendenteDepois > 0 ? `Faltando ${numero(l.pendenteDepois)}` : "Completo"}
                    </span>
                  )}
                  {l.divergente && (
                    <span className="font-medium text-marrom">
                      Preço diferente: pedido {moeda(l.i.preco_embalagem)} → nota {moeda(l.preco)}
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </Secao>

        <Secao titulo="Resultado">
          <div className="flex flex-col gap-3 text-sm">
            {pendenteDepois === 0 ? (
              <Aviso tom="sucesso">Tudo será recebido: o pedido será concluído.</Aviso>
            ) : (
              <>
                <Aviso tom="atencao">
                  Depois deste recebimento ainda ficam {numero(pendenteDepois)} embalagem(ns) pendente(s). O pedido fica como “Parcialmente
                  recebido” e aceita novos recebimentos.
                </Aviso>
                <label className="flex items-start gap-2 font-medium text-verde">
                  <input type="checkbox" className="mt-0.5 size-5 accent-verde" checked={concluir} onChange={(e) => setConcluir(e.target.checked)} />
                  O restante não vai chegar: concluir o pedido mesmo assim
                </label>
                {concluir && (
                  <Campo rotulo="Justificativa" obrigatorio>
                    {(id) => <Textarea id={id} rows={2} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />}
                  </Campo>
                )}
              </>
            )}
            <Campo rotulo="Observações do recebimento">
              {(id) => <Textarea id={id} rows={2} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />}
            </Campo>
          </div>
        </Secao>

        {erro && <Aviso tom="erro">{erro}</Aviso>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <LinkBotao to={rota("pedidos", pedido.id)} variant="contorno">
            Cancelar
          </LinkBotao>
          <Button size="lg" onClick={revisar}>
            Registrar recebimento
          </Button>
        </div>
      </div>

      <ColarListaDialog
        aberto={colarAberto}
        titulo="Colar lista da nota"
        explicacao="Cole a lista de produtos da nota fiscal (por exemplo, gerada por IA a partir da foto da nota). Os produtos são reconhecidos e conferidos com o pedido."
        candidatos={candidatos}
        rotuloReferencia="Preço do pedido"
        aoFechar={() => setColarAberto(false)}
        aoAplicar={(itens) => {
          setEntradas((x) => {
            const novo = { ...x };
            for (const it of itens) {
              novo[it.candidatoId] = {
                ...novo[it.candidatoId],
                recebida: paraCampo(it.quantidade),
                preco: it.precoAlterado ? paraCampo(it.valorUnitario, 2) : "",
              };
            }
            return novo;
          });
        }}
      />
      <Confirmar
        aberto={confirmar}
        titulo="Confirmar recebimento?"
        mensagem={
          <div className="flex flex-col gap-3">
            <ul className="list-disc pl-5">
              {linhas
                .filter((l) => l.recebida > 0 || l.danificada > 0)
                .map((l) => (
                  <li key={l.i.id}>
                    {l.i.produto_nome}: {numero(l.recebida)} recebida(s)
                    {l.danificada > 0 && `, ${numero(l.danificada)} avariada(s)`}
                  </li>
                ))}
            </ul>
            {divergentes.length > 0 && (
              <div className="rounded-xl border border-amarelo/50 bg-amarelo/15 p-3 text-marrom">
                <p className="font-semibold">Preços diferentes do pedido:</p>
                <ul className="mb-2 list-disc pl-5">
                  {divergentes.map((l) => (
                    <li key={l.i.id}>
                      {l.i.produto_nome}: {moeda(l.i.preco_embalagem)} → {moeda(l.preco)}
                    </li>
                  ))}
                </ul>
                <label className="flex items-start gap-2 font-medium">
                  <input type="checkbox" className="mt-0.5 size-5 accent-verde" checked={atualizarPrecos} onChange={(e) => setAtualizarPrecos(e.target.checked)} />
                  Atualizar o preço atual do fornecedor com os valores da nota
                </label>
                <p className="mt-1 text-xs">O pedido continua com o preço negociado; a divergência fica registrada.</p>
              </div>
            )}
            {pendenteDepois === 0 ? <p>O pedido será concluído.</p> : concluir ? <p>O pedido será concluído com itens pendentes.</p> : null}
          </div>
        }
        textoConfirmar="Confirmar recebimento"
        aoFechar={() => setConfirmar(false)}
        aoConfirmar={registrar}
      />
    </>
  );
}
