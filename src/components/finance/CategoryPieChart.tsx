import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { CHART_COLORS, formatBRL, type CategoryTotal } from "@/lib/finance";

interface CategoryPieChartProps {
  data: CategoryTotal[];
}

// Gráfico de pizza "Gastos por Categoria". Cada fatia é uma categoria de
// saída; o tooltip mostra valor formatado em reais ao passar o mouse.
export function CategoryPieChart({ data }: CategoryPieChartProps) {
  if (data.length === 0) {
    return (
      <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Nenhuma saída registrada ainda.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie
          data={data}
          dataKey="total"
          nameKey="category"
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={90}
          paddingAngle={2}
          label={({ name, percent }) => `${name} ${Math.round((percent ?? 0) * 100)}%`}
        >
          {data.map((entry, index) => (
            <Cell key={entry.category} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(value) => formatBRL(Number(value))} />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
