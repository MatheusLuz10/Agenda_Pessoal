import { useId, useState } from "react";
import { Button } from "@/modules/deu-sede/components/ui/button";
import { Dialogo } from "@/modules/deu-sede/components/ui/dialogo";
import { Campo, Input } from "@/modules/deu-sede/components/ui/input";
import { Aviso } from "@/modules/deu-sede/components/ui/aviso";
import { executar } from "@/modules/deu-sede/data/cliente";
import type { Produto } from "@/modules/deu-sede/data/tipos";
import { arredondar, descreverEmbalagem, lerDecimal, moeda, moedaUnitaria, paraCampo } from "@/modules/deu-sede/domain/formatos";

const MARGENS = [20, 30, 40, 50];

// Margem inteira: o preço vai a centavos, então 25% pode voltar como 25,07%.
const margemDe = (venda: number | null, base: number | null) =>
  venda === null || Number.isNaN(venda) || base === null || base <= 0 ? "" : paraCampo(Math.round((venda / base - 1) * 100));

/**
 * Preço de venda direto da lista de Produtos (onde aparece "sem preço"),
 * sem abrir o cadastro inteiro. Produto sem custo conhecido pode receber o
 * preço de custo aqui também.
 */
export function PrecoVendaDialogo({
  produto,
  custoUnitario,
  aoFechar,
  aoSalvar,
}: {
  produto: Produto | null;
  /** custo por unidade já conhecido (fornecedor, última entrada ou cadastro) */
  custoUnitario: number | null;
  aoFechar: () => void;
  aoSalvar?: (p: Produto) => void;
}) {
  if (!produto) return null;
  // key: cada produto abre com os campos limpos
  return <Formulario key={produto.id} produto={produto} custoUnitario={custoUnitario} aoFechar={aoFechar} aoSalvar={aoSalvar} />;
}

function Formulario({
  produto,
  custoUnitario,
  aoFechar,
  aoSalvar,
}: {
  produto: Produto;
  custoUnitario: number | null;
  aoFechar: () => void;
  aoSalvar?: (p: Produto) => void;
}) {
  const unidades = produto.unidades_por_embalagem;
  const variasUnidades = unidades > 1;
  const rotuloEmb = descreverEmbalagem(produto.tipo_embalagem, unidades).toLowerCase();
  // preço de custo da embalagem (só quando não há custo conhecido)
  const [custo, setCusto] = useState("");
  const [margem, setMargem] = useState("");
  const [vendaUnidade, setVendaUnidade] = useState(paraCampo(produto.preco_venda, 2));
  const [vendaEmbalagem, setVendaEmbalagem] = useState(paraCampo(produto.preco_venda_embalagem, 2));
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const formId = useId();

  const custoDigitadoUn = (texto: string) => {
    const c = lerDecimal(texto);
    return c !== null && !Number.isNaN(c) && c > 0 ? c / unidades : null;
  };
  const base = custoUnitario ?? custoDigitadoUn(custo);

  function mudarMargem(texto: string) {
    setMargem(texto);
    const m = lerDecimal(texto);
    if (m !== null && !Number.isNaN(m) && base !== null) setVendaUnidade(paraCampo(arredondar(base * (1 + m / 100)), 2));
  }

  function mudarVendaUnidade(texto: string) {
    setVendaUnidade(texto);
    setMargem(margemDe(lerDecimal(texto), base));
  }

  function mudarCusto(texto: string) {
    setCusto(texto);
    setMargem(margemDe(lerDecimal(vendaUnidade), custoUnitario ?? custoDigitadoUn(texto)));
  }

  const vendaUnLida = lerDecimal(vendaUnidade);
  const sugestaoEmbalagem = vendaUnLida !== null && !Number.isNaN(vendaUnLida) && vendaUnLida > 0 && variasUnidades ? arredondar(vendaUnLida * unidades) : null;

  async function salvar() {
    const vendaUn = lerDecimal(vendaUnidade);
    const vendaEmb = lerDecimal(vendaEmbalagem);
    const custoNum = lerDecimal(custo);
    if (vendaUn === null) return setErro("Informe o preço de venda por unidade.");
    if (Number.isNaN(vendaUn) || vendaUn <= 0) return setErro("Preço de venda por unidade inválido.");
    if (vendaEmb !== null && (Number.isNaN(vendaEmb) || vendaEmb <= 0)) return setErro("Preço de venda da embalagem inválido.");
    if (custoNum !== null && (Number.isNaN(custoNum) || custoNum < 0)) return setErro("Preço de custo inválido.");
    setErro(null);
    setEnviando(true);
    try {
      const salvo = await executar<Produto>("salvar_produto", {
        // o banco grava o que vier: manda o produto inteiro para não apagar nada
        ...produto,
        preco_venda: arredondar(vendaUn),
        preco_venda_embalagem: vendaEmb === null || !variasUnidades ? null : arredondar(vendaEmb),
        custo_referencia: custoNum === null ? (produto.custo_referencia ?? null) : arredondar(custoNum / unidades, 4),
      });
      aoSalvar?.(salvo);
      aoFechar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  const fechar = () => {
    if (!enviando) aoFechar();
  };

  return (
    <Dialogo
      aberto
      titulo="Preço de venda"
      aoFechar={fechar}
      rodape={
        <>
          <Button variant="contorno" onClick={fechar} disabled={enviando}>
            Voltar
          </Button>
          <Button data-principal type="submit" form={formId} disabled={enviando}>
            {enviando ? "Salvando…" : "Salvar preço"}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void salvar();
        }}
      >
        <div>
          <p className="font-semibold break-words text-verde">{produto.nome}</p>
          <p className="text-sm text-texto-suave">
            {descreverEmbalagem(produto.tipo_embalagem, unidades)}
            {custoUnitario !== null && (
              <>
                {" "}· custo <strong className="text-verde">{moedaUnitaria(custoUnitario)}</strong>/un
                {variasUnidades && ` (${moeda(arredondar(custoUnitario * unidades))} a ${rotuloEmb})`}
              </>
            )}
          </p>
        </div>

        {custoUnitario === null && (
          <Campo
            rotulo={`Preço de custo (${rotuloEmb})`}
            ajuda={
              custoDigitadoUn(custo) !== null && variasUnidades
                ? `Por unidade: ${moedaUnitaria(custoDigitadoUn(custo))}.`
                : "Este produto ainda não tem custo. Opcional: com ele, a margem calcula o preço."
            }
          >
            {(id) => <Input id={id} inputMode="decimal" placeholder="R$" value={custo} onChange={(e) => mudarCusto(e.target.value)} />}
          </Campo>
        )}

        {base !== null && (
          <div className="flex flex-col gap-2">
            <Campo rotulo="Margem sobre o custo (%)">
              {(id) => <Input id={id} inputMode="decimal" placeholder="Ex.: 30" value={margem} onChange={(e) => mudarMargem(e.target.value)} />}
            </Campo>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Margens rápidas">
              {MARGENS.map((m) => (
                <Button key={m} type="button" size="sm" variant={margem === String(m) ? "primario" : "contorno"} onClick={() => mudarMargem(String(m))}>
                  {m}%
                </Button>
              ))}
            </div>
          </div>
        )}

        <Campo rotulo="Venda por unidade" obrigatorio ajuda="Preço que aparece no PDV.">
          {(id) => (
            <Input id={id} inputMode="decimal" placeholder="Ex.: 4,50" value={vendaUnidade} onChange={(e) => mudarVendaUnidade(e.target.value)} />
          )}
        </Campo>

        {variasUnidades && (
          <Campo
            rotulo={`Venda da embalagem fechada (${rotuloEmb})`}
            ajuda={sugestaoEmbalagem === null ? "Opcional." : `Em branco: ${moeda(sugestaoEmbalagem)} (unidade × ${unidades}).`}
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

        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </form>
    </Dialogo>
  );
}
