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
import type { Categoria, Embalagem, Produto, UnidadeMedida } from "@/modules/deu-sede/data/tipos";
import { EMBALAGENS, lerDecimal, paraCampo, UNIDADES_MEDIDA } from "@/modules/deu-sede/domain/formatos";

export function ProdutoFormPage() {
  const { id } = useParams();
  const { dados, erro, produtos } = useCadastros();
  if (erro) return <Aviso tom="erro">{erro}</Aviso>;
  if (!dados) return <Carregando />;
  const produto = id ? produtos.get(id) : undefined;
  if (id && !produto) return <Aviso tom="erro">Produto não encontrado.</Aviso>;
  return <Formulario key={id ?? "novo"} produto={produto ?? null} categorias={dados.categorias} />;
}

function Formulario({ produto, categorias }: { produto: Produto | null; categorias: Categoria[] }) {
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
    const salvo = await enviar(() =>
      executar<Produto>("salvar_produto", {
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
      }),
    );
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
            <Campo rotulo="Código ou identificação" ajuda="Opcional. Ex.: código de barras ou código interno.">
              {(id) => <Input id={id} value={codigo} onChange={(e) => setCodigo(e.target.value)} />}
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
