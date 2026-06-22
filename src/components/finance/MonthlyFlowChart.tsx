import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatBRL, type MonthlyFlow } from "@/lib/finance";

interface MonthlyFlowChartProps {
  data: MonthlyFlow[];
}

// Gráfico de barras "Fluxo Mensal": uma barra verde (entradas) e uma
// vermelha (saídas) por mês do ano, lado a lado.
export function MonthlyFlowChart({ data }: MonthlyFlowChartProps) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" fontSize={12} />
        <YAxis fontSize={12} width={40} />
        <Tooltip formatter={(value) => formatBRL(Number(value))} />
        <Legend />
        <Bar dataKey="entradas" name="Entradas" fill="var(--success)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="saidas" name="Saídas" fill="var(--destructive)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
