import { useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { PageHeader } from "@/modules/deu-sede/components/PageHeader";
import { Button, LinkBotao } from "@/modules/deu-sede/components/ui/button";
import { Card } from "@/modules/deu-sede/components/ui/card";
import { Aviso, Carregando } from "@/modules/deu-sede/components/ui/aviso";
import { Campo, Input, Interruptor, Select, Textarea } from "@/modules/deu-sede/components/ui/input";
import { Dialogo } from "@/modules/deu-sede/components/ui/dialogo";
import { rota } from "@/modules/deu-sede/config/modules";
import { executar } from "@/modules/deu-sede/data/cliente";
import { useCadastros, useEnvio } from "@/modules/deu-sede/data/hooks";
import type { Categoria, Embalagem, Fornecedor, Produto, UnidadeMedida } from "@/modules/deu-sede/data/tipos";
import { arredondar, descreverEmbalagem, EMBALAGENS, lerDecimal, moeda, moedaUnitaria, paraCampo, UNIDADES_MEDIDA } from "@/modules/deu-sede/domain/formatos";

export function ProdutoFormPage() {
  const { id } = useParams();
  const { dados, erro, produtos, vinculosPorProduto } = useCadastros();
  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;
  const produto = id ? produtos.get(id) : undefined;
  if (id && !produto) return <Aviso tom="erro">Produto não encontrado.</Aviso>;
  // menor preço atual entre os fornecedores, por unidade (referência para o preço de venda)
  const custos = (id ? (vinculosPorProduto.get(id) ?? []) : [])
    .filter((v) => v.ativo && v.preco_unitario !== null)
    .map((v) => Number(v.preco_unitario));
  const custoUnitario = custos.length ? Math.min(...custos) : null;
  return (
    <Formulario
      key={id ?? "novo"}
      produto={produto ?? null}
      categorias={dados.categorias}
      fornecedores={dados.fornecedores.filter((f) => f.ativo)}
      custoUnitario={custoUnitario}
    />
  );
}

function Formulario({
  produto,
  categorias,
  fornecedores,
  custoUnitario,
}: {
  produto: Produto | null;
  categorias: Categoria[];
  fornecedores: Fornecedor[];
  custoUnitario: number | null;
}) {
  const navigate = useNavigate();
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [categoriaId, setCategoriaId] = useState(produto?.categoria_id ?? "");
  const [marca, setMarca] = useState(produto?.marca ?? "");
  const [codigo, setCodigo] = useState(produto?.codigo ?? "");
  const [tipo, setTipo] = useState<Embalagem>(produto?.tipo_embalagem ?? "caixa");
  const [unidades, setUnidades] = useState(String(produto?.unidades_por_embalagem ?? 12));
  const [volume, setVolume] = useState(paraCampo(produto?.volume_por_unidade));
  const [unidadeMedida, setUnidadeMedida] = useState<UnidadeMedida | "">(produto?.unidade_medida ?? "ml");
  const [observacoes, setObservacoes] = useState(produto?.observacoes ?? "");
  const [ativo, setAtivo] = useState(produto?.ativo ?? true);
  const [vendaUnidade, setVendaUnidade] = useState(paraCampo(produto?.preco_venda, 2));
  const [vendaEmbalagem, setVendaEmbalagem] = useState(paraCampo(produto?.preco_venda_embalagem, 2));
  // produto novo: já liga a um fornecedor (opcional); o preço de custo vira o preço dele
  const [fornecedorId, setFornecedorId] = useState("");
  // preço de custo (por embalagem); no banco fica por unidade (custo_referencia)
  const [custo, setCusto] = useState(() =>
    produto?.custo_referencia != null ? paraCampo(arredondar(Number(produto.custo_referencia) * produto.unidades_por_embalagem, 2), 2) : "",
  );
  // custo por unidade usado na margem: o digitado; sem ele, o do fornecedor
  const custoUnDe = (texto: string, unidadesTexto: string) => {
    const c = lerDecimal(texto);
    const u = Number(unidadesTexto);
    return c !== null && !Number.isNaN(c) && c >= 0 && Number.isInteger(u) && u > 0 ? c / u : null;
  };
  const custoBase = custoUnDe(custo, unidades) ?? custoUnitario;
  // margem sobre o custo: digitar a margem calcula o preço e vice-versa
  const margemDe = (venda: number | null, base: number | null) =>
    // inteiro: o preço vai a centavos, então 25% pode voltar como 25,07%
    venda === null || Number.isNaN(venda) || base === null || base <= 0 ? "" : paraCampo(Math.round((venda / base - 1) * 100));
  const [margem, setMargem] = useState(() =>
    margemDe(
      produto?.preco_venda ?? null,
      produto?.custo_referencia != null ? Number(produto.custo_referencia) : custoUnitario,
    ),
  );

  function mudarMargem(texto: string) {
    setMargem(texto);
    const m = lerDecimal(texto);
    if (m !== null && !Number.isNaN(m) && custoBase !== null) setVendaUnidade(paraCampo(arredondar(custoBase * (1 + m / 100)), 2));
  }

  function mudarVendaUnidade(texto: string) {
    setVendaUnidade(texto);
    setMargem(margemDe(lerDecimal(texto), custoBase));
  }

  // mudar o custo mantém o preço de venda e recalcula a margem
  function mudarCusto(texto: string) {
    setCusto(texto);
    setMargem(margemDe(lerDecimal(vendaUnidade), custoUnDe(texto, unidades) ?? custoUnitario));
  }
  const [novaCategoria, setNovaCategoria] = useState<string | null>(null);
  const { enviando, erro, setErro, enviar } = useEnvio();
  const envioCategoria = useEnvio();

  async function salvar(e: FormEvent) {
    e.preventDefault();
    const unidadesNum = Number(unidades);
    const volumeNum = lerDecimal(volume);
    if (!nome.trim()) return setErro("Informe o nome do produto.");
    if (!categoriaId) return setErro("Escolha a categoria.");
    if (!Number.isInteger(unidadesNum) || unidadesNum <= 0) return setErro("Unidades por embalagem deve ser um número inteiro maior que zero.");
    if (volumeNum !== null && (Number.isNaN(volumeNum) || volumeNum <= 0)) return setErro("Volume ou peso inválido.");
    const vendaUnNum = lerDecimal(vendaUnidade);
    const vendaEmbNum = lerDecimal(vendaEmbalagem);
    if (vendaUnNum !== null && (Number.isNaN(vendaUnNum) || vendaUnNum < 0)) return setErro("Preço de venda por unidade inválido.");
    if (vendaEmbNum !== null && (Number.isNaN(vendaEmbNum) || vendaEmbNum < 0)) return setErro("Preço de venda da embalagem inválido.");
    const custoNum = lerDecimal(custo);
    if (custoNum !== null && (Number.isNaN(custoNum) || custoNum < 0)) return setErro("Preço de custo inválido.");
    const salvo = await enviar(async () => {
      const p = await executar<Produto>("salvar_produto", {
        id: produto?.id,
        nome,
        categoria_id: categoriaId,
        marca,
        codigo,
        tipo_embalagem: tipo,
        unidades_por_embalagem: unidadesNum,
        volume_por_unidade: volumeNum,
        unidade_medida: volumeNum === null ? null : unidadeMedida || null,
        observacoes,
        ativo,
        // o banco grava o que vier: mandar sempre para não apagar
        estoque_minimo: produto?.estoque_minimo ?? null,
        preco_venda: vendaUnNum === null ? null : arredondar(vendaUnNum),
        preco_venda_embalagem: vendaEmbNum === null || unidadesNum <= 1 ? null : arredondar(vendaEmbNum),
        custo_referencia: custoNum === null ? null : arredondar(custoNum / unidadesNum, 4),
      });
      if (!produto && fornecedorId) {
        await executar("salvar_fornecedor_produto", {
          fornecedor_id: fornecedorId,
          produto_id: p.id,
          tipo_embalagem: tipo,
          unidades_por_embalagem: unidadesNum,
          preco_atual: custoNum === null ? null : arredondar(custoNum),
          ativo: true,
        });
      }
      return p;
    });
    if (salvo) navigate(rota("produtos", salvo.id), { replace: true });
  }

  async function criarCategoria() {
    const nomeCat = (novaCategoria ?? "").trim();
    if (!nomeCat) return envioCategoria.setErro("Informe o nome da categoria.");
    const criada = await envioCategoria.enviar(() => executar<Categoria>("salvar_categoria", { nome: nomeCat }));
    if (criada) {
      setCategoriaId(criada.id);
      setNovaCategoria(null);
    }
  }

  const unidadesNum = Number(unidades);
  const variasUnidades = Number.isInteger(unidadesNum) && unidadesNum > 1;
  const vendaUnLida = lerDecimal(vendaUnidade);
  const vendaUnValida = vendaUnLida !== null && !Number.isNaN(vendaUnLida) && vendaUnLida > 0 ? vendaUnLida : null;
  const sugestaoEmbalagem = vendaUnValida !== null && variasUnidades ? arredondar(vendaUnValida * unidadesNum) : null;
  const rotuloEmb = descreverEmbalagem(tipo, Number.isInteger(unidadesNum) && unidadesNum > 0 ? unidadesNum : 1).toLowerCase();
  const custoDigitadoUn = custoUnDe(custo, unidades);
  const ajudaCusto =
    custoDigitadoUn !== null && variasUnidades
      ? `Por unidade: ${moedaUnitaria(custoDigitadoUn)}.`
      : custoUnitario !== null
        ? `Custo do fornecedor: ${moedaUnitaria(custoUnitario)} por unidade.`
        : "Quanto você paga. Opcional.";
  const ajudaVendaUnidade = "Preço que aparece no PDV.";

  const voltar = produto ? rota("produtos", produto.id) : rota("produtos");
  const categoriasVisiveis = categorias.filter((c) => c.ativo || c.id === categoriaId);

  return (
    <>
      <PageHeader title={produto ? "Editar produto" : "Novo produto"} description={produto?.nome} />
      <Card className="max-w-3xl">
        <form onSubmit={salvar} className="flex flex-col gap-4 p-4 sm:p-5" noValidate>
          <Campo rotulo="Nome do produto" obrigatorio ajuda="Ex.: Cerveja Brahma Chopp Lata 269 ml">
            {(id) => <Input id={id} value={nome} onChange={(e) => setNome(e.target.value)} autoFocus={!produto} />}
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Categoria" obrigatorio>
              {(id) => (
                <div className="flex gap-2">
                  <Select id={id} value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
                    <option value="">Escolha…</option>
                    {categoriasVisiveis.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </Select>
                  <Button variant="contorno" size="icone" aria-label="Nova categoria" title="Nova categoria" onClick={() => setNovaCategoria("")}>
                    <Plus className="size-4" />
                  </Button>
                </div>
              )}
            </Campo>
            <Campo rotulo="Marca">{(id) => <Input id={id} value={marca} onChange={(e) => setMarca(e.target.value)} />}</Campo>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Código do produto" ajuda="Deixe em branco e o sistema dá o próximo número (0001, 0002…). Pode usar o código de barras.">
              {(id) => <Input id={id} value={codigo} placeholder="Automático" onChange={(e) => setCodigo(e.target.value)} />}
            </Campo>
            <div className="grid grid-cols-[1fr_6rem] gap-2">
              <Campo rotulo="Volume ou peso por unidade">
                {(id) => <Input id={id} inputMode="decimal" placeholder="Ex.: 269" value={volume} onChange={(e) => setVolume(e.target.value)} />}
              </Campo>
              <Campo rotulo="Medida">
                {(id) => (
                  <Select id={id} value={unidadeMedida} onChange={(e) => setUnidadeMedida(e.target.value as UnidadeMedida)}>
                    {UNIDADES_MEDIDA.map((u) => (
                      <option key={u.valor} value={u.valor}>
                        {u.rotulo}
                      </option>
                    ))}
                  </Select>
                )}
              </Campo>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Tipo de embalagem (padrão)" obrigatorio>
              {(id) => (
                <Select id={id} value={tipo} onChange={(e) => setTipo(e.target.value as Embalagem)}>
                  {EMBALAGENS.map((e) => (
                    <option key={e.valor} value={e.valor}>
                      {e.rotulo}
                    </option>
                  ))}
                </Select>
              )}
            </Campo>
            <Campo rotulo="Unidades por embalagem" obrigatorio ajuda="Cada fornecedor pode ter outra embalagem (ex.: fardo c/ 15).">
              {(id) => <Input id={id} inputMode="numeric" value={unidades} onChange={(e) => setUnidades(e.target.value)} />}
            </Campo>
          </div>
          {!produto && fornecedores.length > 0 && (
            <fieldset className="flex flex-col gap-3 rounded-lg border border-linha p-3 sm:p-4">
              <legend className="px-1 text-sm font-semibold">Fornecedor (opcional)</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo rotulo="Fornecedor" ajuda="Quem vende este produto. O preço de custo abaixo vira o preço dele.">
                  {(id) => (
                    <Select id={id} value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
                      <option value="">Nenhum</option>
                      {fornecedores.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome}
                        </option>
                      ))}
                    </Select>
                  )}
                </Campo>
              </div>
            </fieldset>
          )}
          <fieldset className="flex flex-col gap-3 rounded-lg border border-linha p-3 sm:p-4">
            <legend className="px-1 text-sm font-semibold">Preço de custo e de venda</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo={`Preço de custo (${rotuloEmb})`} ajuda={ajudaCusto}>
                {(id) => <Input id={id} inputMode="decimal" placeholder="R$" value={custo} onChange={(e) => mudarCusto(e.target.value)} />}
              </Campo>
              <Campo rotulo="Margem sobre o custo (%)" ajuda={custoBase === null ? "Informe o custo para usar a margem." : "Calcula o preço da unidade."}>
                {(id) => (
                  <Input id={id} inputMode="decimal" placeholder="Ex.: 30" value={margem} disabled={custoBase === null} onChange={(e) => mudarMargem(e.target.value)} />
                )}
              </Campo>
              <Campo rotulo="Venda por unidade" ajuda={ajudaVendaUnidade}>
                {(id) => <Input id={id} inputMode="decimal" placeholder="Ex.: 4,50" value={vendaUnidade} onChange={(e) => mudarVendaUnidade(e.target.value)} />}
              </Campo>
              {variasUnidades && (
                <Campo
                  rotulo={`Venda da embalagem fechada (${descreverEmbalagem(tipo, unidadesNum).toLowerCase()})`}
                  ajuda={sugestaoEmbalagem === null ? "Opcional." : `Em branco: ${moeda(sugestaoEmbalagem)} (unidade × ${unidadesNum}).`}
                >
                  {(id) => (
                    <Input
                      id={id}
                      inputMode="decimal"
                      placeholder={sugestaoEmbalagem === null ? "Opcional" : paraCampo(sugestaoEmbalagem, 2)}
                      value={vendaEmbalagem}
                      onChange={(e) => setVendaEmbalagem(e.target.value)}
                    />
                  )}
                </Campo>
              )}
            </div>
          </fieldset>
          <Campo rotulo="Observações">
            {(id) => <Textarea id={id} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />}
          </Campo>
          {produto && <Interruptor ligado={ativo} aoMudar={setAtivo} rotulo="Produto ativo" />}
          {erro && <Aviso tom="erro">{erro}</Aviso>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <LinkBotao to={voltar} variant="contorno">
              Cancelar
            </LinkBotao>
            <Button type="submit" disabled={enviando}>
              {enviando ? "Salvando…" : "Salvar produto"}
            </Button>
          </div>
        </form>
      </Card>

      <Dialogo
        aberto={novaCategoria !== null}
        titulo="Nova categoria"
        aoFechar={() => setNovaCategoria(null)}
        rodape={
          <>
            <Button variant="contorno" onClick={() => setNovaCategoria(null)}>
              Cancelar
            </Button>
            <Button data-principal onClick={criarCategoria} disabled={envioCategoria.enviando}>
              Criar categoria
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <Campo rotulo="Nome da categoria" obrigatorio>
            {(id) => <Input id={id} value={novaCategoria ?? ""} onChange={(e) => setNovaCategoria(e.target.value)} />}
          </Campo>
          {envioCategoria.erro && <Aviso tom="erro">{envioCategoria.erro}</Aviso>}
        </div>
      </Dialogo>
    </>
  );
}
