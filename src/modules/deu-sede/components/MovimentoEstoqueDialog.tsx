import { useState } from "react";
import { Button } from "@/modules/deu-sede/components/ui/button";
import { Dialogo } from "@/modules/deu-sede/components/ui/dialogo";
import { Aviso } from "@/modules/deu-sede/components/ui/aviso";
import { Campo, Input, Select } from "@/modules/deu-sede/components/ui/input";
import { Segmentado } from "@/modules/deu-sede/components/ui/filtros";
import { executar } from "@/modules/deu-sede/data/cliente";
import { useEnvio } from "@/modules/deu-sede/data/hooks";
import type { ItemEstoque } from "@/modules/deu-sede/data/tipos";
import { descreverEmbalagem, descreverQuantidade, lerDecimal, rotuloEmbalagem } from "@/modules/deu-sede/domain/formatos";

const MOTIVOS = ["Venda fora do PDV", "Consumo interno", "Perda / avaria", "Vencimento", "Devolução ao fornecedor"];

// Entrada manual (quantidade e custo opcional), saída manual (com motivo)
// ou ajuste pela contagem física do estoque.
export function MovimentoEstoqueDialog({ item, aoFechar }: { item: ItemEstoque; aoFechar: () => void }) {
  const [tipo, setTipo] = useState<"entrada" | "saida" | "ajuste">("entrada");
  const [custo, setCusto] = useState("");
  const [obs, setObs] = useState("");
  const [qtd, setQtd] = useState("");
  const [unidade, setUnidade] = useState<"embalagem" | "unidade">(item.unidades_por_embalagem > 1 ? "embalagem" : "unidade");
  const [motivo, setMotivo] = useState(MOTIVOS[0]);
  const [outro, setOutro] = useState("");
  const [contEmb, setContEmb] = useState("");
  const [contUn, setContUn] = useState("");
  const { enviando, erro, setErro, enviar } = useEnvio();
  const porEmb = item.unidades_por_embalagem;
  const contagem = (lerDecimal(contEmb) ?? 0) * porEmb + (lerDecimal(contUn) ?? 0);

  async function salvar() {
    if (tipo === "entrada") {
      const q = lerDecimal(qtd);
      if (q === null || Number.isNaN(q) || q <= 0) return setErro("Informe a quantidade que entrou.");
      const c = lerDecimal(custo);
      if (c !== null && (Number.isNaN(c) || c < 0)) return setErro("Custo inválido.");
      const ok = await enviar(() =>
        executar("registrar_movimento_estoque", {
          produto_id: item.produto_id,
          tipo,
          quantidade: q,
          unidade,
          custo: c ?? undefined,
          motivo: obs.trim() || undefined,
        }),
      );
      if (ok) aoFechar();
    } else if (tipo === "saida") {
      const q = lerDecimal(qtd);
      if (q === null || Number.isNaN(q) || q <= 0) return setErro("Informe a quantidade que saiu.");
      const m = motivo === "Outro" ? outro.trim() : motivo;
      if (m.length < 3) return setErro("Informe o motivo.");
      const ok = await enviar(() => executar("registrar_movimento_estoque", { produto_id: item.produto_id, tipo, quantidade: q, unidade, motivo: m }));
      if (ok) aoFechar();
    } else {
      if (Number.isNaN(contagem) || contagem < 0 || (!contEmb && !contUn)) return setErro("Informe a quantidade contada.");
      const ok = await enviar(() =>
        executar("registrar_movimento_estoque", { produto_id: item.produto_id, tipo, contagem, unidade: "unidade", motivo: "Contagem de estoque" }),
      );
      if (ok) aoFechar();
    }
  }

  return (
    <Dialogo
      aberto
      titulo={item.produto_nome}
      aoFechar={aoFechar}
      rodape={
        <>
          <Button variant="contorno" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button data-principal onClick={salvar} disabled={enviando}>
            {tipo === "entrada" ? "Adicionar ao estoque" : tipo === "saida" ? "Registrar saída" : "Ajustar estoque"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4 text-sm">
        <p className="text-texto">
          Saldo atual: <strong>{descreverQuantidade(item.saldo_unidades, porEmb, item.tipo_embalagem)}</strong>
          {porEmb > 1 && <span className="text-texto-suave"> ({Number(item.saldo_unidades)} un)</span>}
        </p>
        <Segmentado
          rotulo="Tipo"
          valor={tipo}
          aoMudar={(v) => {
            setTipo(v);
            setErro(null);
          }}
          opcoes={[
            { valor: "entrada", rotulo: "Entrada" },
            { valor: "saida", rotulo: "Saída" },
            { valor: "ajuste", rotulo: "Ajuste por contagem" },
          ]}
        />
        {tipo === "entrada" ? (
          <>
            <p className="text-texto-suave">Para produto que chegou sem pedido nem nota. Com o custo, o último custo do produto é atualizado.</p>
            <div className="grid grid-cols-2 gap-2">
              <Campo rotulo="Quantidade">{(id) => <Input id={id} inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} autoFocus />}</Campo>
              <Campo rotulo="Em">
                {(id) => (
                  <Select id={id} value={unidade} onChange={(e) => setUnidade(e.target.value as "embalagem" | "unidade")}>
                    {porEmb > 1 && <option value="embalagem">{descreverEmbalagem(item.tipo_embalagem, porEmb)}</option>}
                    <option value="unidade">Unidades</option>
                  </Select>
                )}
              </Campo>
            </div>
            <Campo rotulo={`Custo ${unidade === "embalagem" && porEmb > 1 ? `por ${rotuloEmbalagem(item.tipo_embalagem).toLowerCase()}` : "por unidade"} (opcional)`}>
              {(id) => <Input id={id} inputMode="decimal" placeholder="R$" value={custo} onChange={(e) => setCusto(e.target.value)} />}
            </Campo>
            <Campo rotulo="Observação (opcional)">{(id) => <Input id={id} value={obs} placeholder="Ex.: compra no atacarejo" onChange={(e) => setObs(e.target.value)} />}</Campo>
          </>
        ) : tipo === "saida" ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Campo rotulo="Quantidade">{(id) => <Input id={id} inputMode="decimal" value={qtd} onChange={(e) => setQtd(e.target.value)} />}</Campo>
              <Campo rotulo="Em">
                {(id) => (
                  <Select id={id} value={unidade} onChange={(e) => setUnidade(e.target.value as "embalagem" | "unidade")}>
                    {porEmb > 1 && <option value="embalagem">{descreverEmbalagem(item.tipo_embalagem, porEmb)}</option>}
                    <option value="unidade">Unidades</option>
                  </Select>
                )}
              </Campo>
            </div>
            <Campo rotulo="Motivo">
              {(id) => (
                <Select id={id} value={motivo} onChange={(e) => setMotivo(e.target.value)}>
                  {[...MOTIVOS, "Outro"].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </Select>
              )}
            </Campo>
            {motivo === "Outro" && <Campo rotulo="Qual?">{(id) => <Input id={id} value={outro} onChange={(e) => setOutro(e.target.value)} />}</Campo>}
          </>
        ) : (
          <>
            <p className="text-texto-suave">Conte o que há fisicamente no estoque. O sistema registra a diferença como ajuste.</p>
            <div className="grid grid-cols-2 gap-2">
              {porEmb > 1 && (
                <Campo rotulo={`${rotuloEmbalagem(item.tipo_embalagem)}s fechados(as)`}>
                  {(id) => <Input id={id} inputMode="decimal" value={contEmb} onChange={(e) => setContEmb(e.target.value)} />}
                </Campo>
              )}
              <Campo rotulo={porEmb > 1 ? "Unidades soltas" : "Unidades"}>
                {(id) => <Input id={id} inputMode="decimal" value={contUn} onChange={(e) => setContUn(e.target.value)} />}
              </Campo>
            </div>
            {(contEmb || contUn) && !Number.isNaN(contagem) && (
              <p className="text-texto">
                Contado: <strong>{contagem} un</strong> · diferença:{" "}
                <strong className={contagem - Number(item.saldo_unidades) < 0 ? "text-perigo" : "text-sucesso"}>
                  {contagem - Number(item.saldo_unidades) > 0 ? "+" : ""}
                  {contagem - Number(item.saldo_unidades)} un
                </strong>
              </p>
            )}
          </>
        )}
        {erro && <Aviso tom="erro">{erro}</Aviso>}
      </div>
    </Dialogo>
  );
}
