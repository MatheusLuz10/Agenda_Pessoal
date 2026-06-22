import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL } from "@/lib/finance";

interface ComparisonChartProps {
  entradas: number;
  saidas: number;
  saldo: number;
}

// Gráfico comparativo simples "Entradas x Saídas": três barras únicas
// mostrando os totais do período filtrado, lado a lado com o saldo.
export function ComparisonChart({ entradas, saidas, saldo }: ComparisonChartProps) {
  const data = [
    { name: "Entradas", value: entradas, color: "var(--success)" },
    { name: "Saídas", value: saidas, color: "var(--destructive)" },
    { name: "Saldo", value: saldo, color: "var(--primary)" },
  ];

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 16 }}>
        <XAxis type="number" fontSize={12} />
        <YAxis type="category" dataKey="name" fontSize={13} width={70} />
        <Tooltip formatter={(value) => formatBRL(Number(value))} />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
