import { useState } from "react";
import { Button } from "@/modules/deu-sede/components/ui/button";
import { Dialogo } from "@/modules/deu-sede/components/ui/dialogo";
import { Campo, Input, Interruptor, Select } from "@/modules/deu-sede/components/ui/input";
import { Aviso } from "@/modules/deu-sede/components/ui/aviso";
import { executar } from "@/modules/deu-sede/data/cliente";
import { useCadastros, useEnvio } from "@/modules/deu-sede/data/hooks";
import type { Embalagem, FornecedorProduto } from "@/modules/deu-sede/data/tipos";
import { EMBALAGENS, lerDecimal, moedaUnitaria, paraCampo } from "@/modules/deu-sede/domain/formatos";

// Produto que um fornecedor vende + preço atual. Abre a partir do
// produto (escolhe o fornecedor) ou do fornecedor (escolhe o produto).
// Mudar o preço atual cria uma linha nova no histórico; cotações e
// pedidos antigos não mudam.
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
  const { enviando, erro, setErro, enviar } = useEnvio();

  const editando = !!vinculo;
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
    if (!produtoId || !fornecedorId) return setErro("Escolha o produto e o fornecedor.");
    if (!Number.isInteger(unidadesNum) || unidadesNum <= 0) return setErro("Unidades por embalagem deve ser um número inteiro maior que zero.");
    if (precoNum !== null && (Number.isNaN(precoNum) || precoNum < 0)) return setErro("Preço inválido.");
    const ok = await enviar(() =>
      executar("salvar_fornecedor_produto", {
        id: vinculo?.id,
        produto_id: produtoId,
        fornecedor_id: fornecedorId,
        tipo_embalagem: tipo,
        unidades_por_embalagem: unidadesNum,
        preco_atual: precoNum,
        codigo_no_fornecedor: codigo,
        ativo,
      }),
    );
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
          rotulo="Preço atual da embalagem (R$)"
          ajuda={unitario ? `Por unidade: ${moedaUnitaria(unitario)}` : "Opcional. Cotações recebidas também atualizam este preço."}
        >
          {(id) => <Input id={id} inputMode="decimal" placeholder="0,00" value={preco} onChange={(e) => setPreco(e.target.value)} />}
        </Campo>
        <Campo rotulo="Código no fornecedor">
          {(id) => <Input id={id} value={codigo} onChange={(e) => setCodigo(e.target.value)} />}
        </Campo>
        {editando && <Interruptor ligado={ativo} aoMudar={setAtivo} rotulo="Fornecedor ainda vende este produto" />}
        {editando && (
          <p className="text-xs text-texto-suave">Mudar o preço cria uma linha nova no histórico. Cotações e pedidos já feitos não mudam.</p>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Dialogo>
  );
}
