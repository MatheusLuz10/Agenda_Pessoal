import { Campo, Input } from "@/modules/deu-sede/components/ui/input";
import { Segmentado } from "@/modules/deu-sede/components/ui/filtros";
import type { FormaConta } from "@/modules/deu-sede/data/tipos";
import { dividirParcelas, erroEscolha, type EscolhaPagamento } from "@/modules/deu-sede/domain/financeiro";
import { arredondar, dataBR, moeda } from "@/modules/deu-sede/domain/formatos";

// À vista (sai do caixa hoje) ou parcelado (nº de parcelas e 1º vencimento),
// com a prévia do que vai acontecer. Usado na conta avulsa e no pedido.
export function EscolhaPagamentoCampos({
  valor,
  aoMudar,
  total,
  saldoCaixa,
}: {
  valor: EscolhaPagamento;
  aoMudar: (e: EscolhaPagamento) => void;
  total: number;
  /** saldo atual do caixa, para avisar se vai ficar negativo (opcional) */
  saldoCaixa?: number | null;
}) {
  const n = Number(valor.parcelas);
  const parcelas = valor.forma === "parcelado" && Number.isInteger(n) && n >= 1 ? dividirParcelas(total, n) : [];
  const erro = erroEscolha(valor, total);
  const saldoDepois = saldoCaixa === null || saldoCaixa === undefined ? null : arredondar(saldoCaixa - total);

  return (
    <div className="flex flex-col gap-3">
      <Segmentado<FormaConta>
        rotulo="Forma de pagamento"
        opcoes={[
          { valor: "a_vista", rotulo: "À vista" },
          { valor: "parcelado", rotulo: "Parcelado / a prazo" },
        ]}
        valor={valor.forma}
        aoMudar={(forma) => aoMudar({ ...valor, forma })}
      />
      {valor.forma === "a_vista" ? (
        <p className="text-sm text-texto">
          Sai do caixa hoje: <strong className="tabular-nums">{moeda(total)}</strong>.
          {saldoDepois !== null && (
            <span className={saldoDepois < 0 ? "font-semibold text-perigo" : "text-texto-suave"}>
              {" "}
              Saldo do caixa depois: {moeda(saldoDepois)}
              {saldoDepois < 0 && " (fica negativo)"}.
            </span>
          )}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Nº de parcelas">
              {(id) => <Input id={id} inputMode="numeric" value={valor.parcelas} onChange={(e) => aoMudar({ ...valor, parcelas: e.target.value.replace(/\D/g, "") })} />}
            </Campo>
            <Campo rotulo="1º vencimento">
              {(id) => <Input id={id} type="date" value={valor.primeiro} onChange={(e) => aoMudar({ ...valor, primeiro: e.target.value })} />}
            </Campo>
          </div>
          {erro ? (
            <p className="text-sm font-medium text-perigo">{erro}</p>
          ) : (
            parcelas.length > 0 && (
              <p className="text-sm text-texto">
                {parcelas.length} × <strong className="tabular-nums">{moeda(parcelas[0])}</strong>
                {parcelas.length > 1 && parcelas[parcelas.length - 1] !== parcelas[0] && ` (a última ${moeda(parcelas[parcelas.length - 1])})`}, a 1ª em{" "}
                {dataBR(valor.primeiro)}
                {parcelas.length > 1 && " e as outras todo mês"}. Cada parcela sai do caixa quando for paga.
              </p>
            )
          )}
        </>
      )}
    </div>
  );
}
