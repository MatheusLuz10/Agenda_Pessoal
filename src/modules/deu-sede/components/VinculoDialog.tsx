import { useState } from "react";
import { Button } from "@/modules/deu-sede/components/ui/button";
import { Dialogo } from "@/modules/deu-sede/components/ui/dialogo";
import { Campo, Input, Interruptor, Select } from "@/modules/deu-sede/components/ui/input";
import { Aviso } from "@/modules/deu-sede/components/ui/aviso";
import { Segmentado } from "@/modules/deu-sede/components/ui/filtros";
import { executar } from "@/modules/deu-sede/data/cliente";
import { useCadastros, useEnvio } from "@/modules/deu-sede/data/hooks";
import type { Embalagem, FornecedorProduto, Produto } from "@/modules/deu-sede/data/tipos";
import { EMBALAGENS, lerDecimal, moedaUnitaria, paraCampo } from "@/modules/deu-sede/domain/formatos";

// Produto que um fornecedor vende + preço atual. Abre a partir do
// produto (escolhe o fornecedor) ou do fornecedor (escolhe o produto ou
// cadastra um produto novo na hora).
// Mudar o preço atual cria uma linha nova no histórico; pedidos e
// notas antigas não mudam.
export function VinculoDialog({
  aberto,
  aoFechar,
  produtoId,
  fornecedorId,
  vinculo,
}: {
  aberto: boolean;
  aoFechar: () => void;
  produtoId?: string;
  fornecedorId?: string;
  vinculo?: FornecedorProduto | null;
}) {
  if (!aberto) return null;
  return (
    <Formulario
      key={vinculo?.id ?? "novo"}
      aoFechar={aoFechar}
      produtoId={vinculo?.produto_id ?? produtoId}
      fornecedorId={vinculo?.fornecedor_id ?? fornecedorId}
      vinculo={vinculo ?? null}
    />
  );
}

function Formulario({
  aoFechar,
  produtoId: produtoInicial,
  fornecedorId: fornecedorInicial,
  vinculo,
}: {
  aoFechar: () => void;
  produtoId?: string;
  fornecedorId?: string;
  vinculo: FornecedorProduto | null;
}) {
  const { dados, produtos } = useCadastros();
  const [produtoId, setProdutoId] = useState(produtoInicial ?? "");
  const [fornecedorId, setFornecedorId] = useState(fornecedorInicial ?? "");
  const produto = produtos.get(produtoId);
  const [tipo, setTipo] = useState<Embalagem>(vinculo?.tipo_embalagem ?? produto?.tipo_embalagem ?? "caixa");
  const [unidades, setUnidades] = useState(String(vinculo?.unidades_por_embalagem ?? produto?.unidades_por_embalagem ?? 1));
  const [preco, setPreco] = useState(paraCampo(vinculo?.preco_atual, 2));
  const [codigo, setCodigo] = useState(vinculo?.codigo_no_fornecedor ?? "");
  const [ativo, setAtivo] = useState(vinculo?.ativo ?? true);
  // aberto pelo fornecedor: dá para cadastrar o produto ali mesmo
  const [novoProduto, setNovoProduto] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [categoriaNova, setCategoriaNova] = useState("");
  const [vendaNovo, setVendaNovo] = useState("");
  const { enviando, erro, setErro, enviar } = useEnvio();

  const editando = !!vinculo;
  const podeCriarProduto = !editando && !produtoInicial;
  const precoNum = lerDecimal(preco);
  const unidadesNum = Number(unidades);
  const unitario = precoNum && unidadesNum > 0 ? precoNum / unidadesNum : null;

  function escolherProduto(id: string) {
    setProdutoId(id);
    const p = produtos.get(id);
    if (p && !editando) {
      setTipo(p.tipo_embalagem);
      setUnidades(String(p.unidades_por_embalagem));
    }
  }

  async function salvar() {
    if (!fornecedorId) return setErro("Escolha o fornecedor.");
    if (novoProduto) {
      if (nomeNovo.trim().length < 2) return setErro("Informe o nome do produto novo.");
      if (!categoriaNova) return setErro("Escolha a categoria do produto novo.");
      const v = lerDecimal(vendaNovo);
      if (v !== null && (Number.isNaN(v) || v < 0)) return setErro("Preço de venda inválido.");
    } else if (!produtoId) return setErro("Escolha o produto.");
    if (!Number.isInteger(unidadesNum) || unidadesNum <= 0) return setErro("Unidades por embalagem deve ser um número inteiro maior que zero.");
    if (precoNum !== null && (Number.isNaN(precoNum) || precoNum < 0)) return setErro("Preço inválido.");
    const ok = await enviar(async () => {
      let pid = produtoId;
      if (novoProduto) {
        // código automático; a embalagem do fornecedor vira a embalagem padrão
        const novo = await executar<Produto>("salvar_produto", {
          nome: nomeNovo.trim(),
          categoria_id: categoriaNova,
          tipo_embalagem: tipo,
          unidades_por_embalagem: unidadesNum,
          // o preço da embalagem do fornecedor vira o preço de custo do produto
          custo_referencia: precoNum === null ? null : Math.round((precoNum / unidadesNum) * 10000) / 10000,
          preco_venda: lerDecimal(vendaNovo),
        });
        pid = novo.id;
        setNovoProduto(false);
        setProdutoId(pid);
      }
      return executar("salvar_fornecedor_produto", {
        id: vinculo?.id,
        produto_id: pid,
        fornecedor_id: fornecedorId,
        tipo_embalagem: tipo,
        unidades_por_embalagem: unidadesNum,
        preco_atual: precoNum,
        codigo_no_fornecedor: codigo,
        ativo,
      });
    });
    if (ok) aoFechar();
  }

  const fornecedoresAtivos = (dados?.fornecedores ?? []).filter((f) => f.ativo || f.id === fornecedorId);
  const produtosAtivos = (dados?.produtos ?? []).filter((p) => p.ativo || p.id === produtoId);

  return (
    <Dialogo
      aberto
      titulo={editando ? "Atualizar preço atual" : "Produto vendido pelo fornecedor"}
      aoFechar={() => !enviando && aoFechar()}
      rodape={
        <>
          <Button variant="contorno" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button data-principal onClick={salvar} disabled={enviando}>
            {enviando ? "Salvando…" : "Salvar"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Campo rotulo="Fornecedor" obrigatorio>
          {(id) => (
            <Select id={id} value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} disabled={editando || !!fornecedorInicial}>
              <option value="">Escolha…</option>
              {fornecedoresAtivos.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </Select>
          )}
        </Campo>
        {podeCriarProduto && (
          <Segmentado<"existente" | "novo">
            rotulo="Produto"
            valor={novoProduto ? "novo" : "existente"}
            aoMudar={(v) => {
              setNovoProduto(v === "novo");
              setErro(null);
            }}
            opcoes={[
              { valor: "existente", rotulo: "Produto já cadastrado" },
              { valor: "novo", rotulo: "Novo produto" },
            ]}
          />
        )}
        {novoProduto ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome do produto novo" obrigatorio ajuda="Ex.: Cerveja Brahma Chopp Lata 350 ml">
              {(id) => <Input id={id} value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} autoFocus />}
            </Campo>
            <Campo rotulo="Categoria" obrigatorio>
              {(id) => (
                <Select id={id} value={categoriaNova} onChange={(e) => setCategoriaNova(e.target.value)}>
                  <option value="">Escolha…</option>
                  {(dados?.categorias ?? [])
                    .filter((c) => c.ativo)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                </Select>
              )}
            </Campo>
            <Campo rotulo="Preço de venda por unidade" ajuda="Opcional. É o preço do PDV.">
              {(id) => <Input id={id} inputMode="decimal" placeholder="R$" value={vendaNovo} onChange={(e) => setVendaNovo(e.target.value)} />}
            </Campo>
          </div>
        ) : (
          <Campo rotulo="Produto" obrigatorio>
            {(id) => (
              <Select id={id} value={produtoId} onChange={(e) => escolherProduto(e.target.value)} disabled={editando || !!produtoInicial}>
                <option value="">Escolha…</option>
                {produtosAtivos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </Select>
            )}
          </Campo>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Embalagem do fornecedor">
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
          <Campo rotulo="Unidades por embalagem" obrigatorio>
            {(id) => <Input id={id} inputMode="numeric" value={unidades} onChange={(e) => setUnidades(e.target.value)} />}
          </Campo>
        </div>
        <Campo
          rotulo={novoProduto ? "Preço de custo da embalagem (R$)" : "Preço atual da embalagem (R$)"}
          ajuda={unitario ? `Por unidade: ${moedaUnitaria(unitario)}` : "Opcional. Notas de entrada também atualizam este preço."}
        >
          {(id) => <Input id={id} inputMode="decimal" placeholder="0,00" value={preco} onChange={(e) => setPreco(e.target.value)} />}
        </Campo>
        <Campo rotulo="Código no fornecedor">
          {(id) => <Input id={id} value={codigo} onChange={(e) => setCodigo(e.target.value)} />}
        </Campo>
        {editando && <Interruptor ligado={ativo} aoMudar={setAtivo} rotulo="Fornecedor ainda vende este produto" />}
        {editando && (
          <p className="text-xs text-texto-suave">Mudar o preço cria uma linha nova no histórico. Pedidos já feitos não mudam.</p>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Dialogo>
  );
}
