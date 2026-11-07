import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Select } from "@/modules/deu-sede/components/ui/input";
import { Tabela } from "@/modules/deu-sede/components/ui/secao";
import type { HistoricoPreco } from "@/modules/deu-sede/data/tipos";
import { dataBR, moedaUnitaria } from "@/modules/deu-sede/domain/formatos";

// Evolução do preço por unidade de UM fornecedor por vez (uma série só:
// sem legenda, cor de dado da marca). A tabela traz os mesmos números.
const COR = "var(--color-dado)";

export function GraficoPrecos({ historico }: { historico: HistoricoPreco[] }) {
  const fornecedores = useMemo(() => {
    const contagem = new Map<string, { id: string; nome: string; n: number }>();
    for (const h of historico) {
      const c = contagem.get(h.fornecedor_id) ?? { id: h.fornecedor_id, nome: h.fornecedor_nome, n: 0 };
      c.n++;
      contagem.set(h.fornecedor_id, c);
    }
    return [...contagem.values()].sort((a, b) => b.n - a.n);
  }, [historico]);
  const [escolhido, setEscolhido] = useState<string>("");
  const fornecedorId = escolhido || fornecedores[0]?.id || "";
  const [verTabela, setVerTabela] = useState(false);

  const pontos = historico
    .filter((h) => h.fornecedor_id === fornecedorId)
    .slice()
    .reverse()
    .map((h) => ({ data: dataBR(h.data_referencia), valor: Number(h.preco_unitario) }));

  if (fornecedores.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium text-verde">
          Evolução do preço por unidade
          <Select value={fornecedorId} onChange={(e) => setEscolhido(e.target.value)} className="sm:w-72">
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Select>
        </label>
        <button type="button" className="h-10 text-sm font-medium text-marrom underline" onClick={() => setVerTabela((v) => !v)}>
          {verTabela ? "Ver gráfico" : "Ver em tabela"}
        </button>
      </div>
      {verTabela ? (
        <Tabela>
          <thead>
            <tr>
              <th>Data</th>
              <th className="num">Preço por unidade</th>
            </tr>
          </thead>
          <tbody>
            {pontos.map((p, i) => (
              <tr key={i}>
                <td>{p.data}</td>
                <td className="num">{moedaUnitaria(p.valor)}</td>
              </tr>
            ))}
          </tbody>
        </Tabela>
      ) : pontos.length < 2 ? (
        <p className="rounded-xl bg-offwhite px-3 py-4 text-sm text-texto-suave">
          Só há um preço registrado deste fornecedor ({pontos[0] ? moedaUnitaria(pontos[0].valor) : "—"}). O gráfico aparece a
          partir do segundo registro.
        </p>
      ) : (
        <div className="h-56 w-full" role="img" aria-label="Gráfico da evolução do preço por unidade">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pontos} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke="var(--color-linha)" strokeDasharray="0" vertical={false} />
              <XAxis dataKey="data" tick={{ fill: "var(--color-texto-suave)", fontSize: 12 }} tickLine={false} axisLine={{ stroke: "var(--color-linha)" }} />
              <YAxis
                width={64}
                tick={{ fill: "var(--color-texto-suave)", fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => moedaUnitaria(v)}
                domain={["auto", "auto"]}
              />
              <Tooltip
                formatter={(v) => [moedaUnitaria(Number(v)), "Preço por unidade"]}
                contentStyle={{ borderRadius: 12, borderColor: "var(--color-linha)", fontSize: 13 }}
              />
              <Line
                type="monotone"
                dataKey="valor"
                stroke={COR}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={{ r: 4, fill: COR, stroke: "var(--color-superficie)", strokeWidth: 2 }}
                activeDot={{ r: 6, fill: COR, stroke: "var(--color-superficie)", strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
