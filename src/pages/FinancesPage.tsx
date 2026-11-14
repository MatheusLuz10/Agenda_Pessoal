import { useMemo, useState, type ReactNode } from "react";
import { Plus, Wallet, TrendingUp, TrendingDown, CalendarClock, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AddTransactionDialog } from "@/components/finance/AddTransactionDialog";
import { AddGoalDialog } from "@/components/finance/AddGoalDialog";
import { GoalCard } from "@/components/finance/GoalCard";
import { TransactionListItem } from "@/components/finance/TransactionListItem";
import { CategoryPieChart } from "@/components/finance/CategoryPieChart";
import { MonthlyFlowChart } from "@/components/finance/MonthlyFlowChart";
import { ComparisonChart } from "@/components/finance/ComparisonChart";
import { useFinance } from "@/contexts/FinanceContext";
import type { Transaction } from "@/types";
import { addDays, nowInBrasilia, todayISO } from "@/lib/date";
import {
  calcBalance,
  filterByMonth,
  formatBRL,
  getCategoryTotals,
  getMonthlyFlow,
  sumEntradas,
  sumSaidas,
} from "@/lib/finance";

type ReportFilter = "hoje" | "semana" | "mes" | "ano" | "personalizado";

// Tela "/financas" — controle financeiro pessoal ("Conta"): dashboard com
// cards e gráficos, relatórios filtráveis por período e metas de
// economia, organizados em abas dentro de uma única página.
export function FinancesPage() {
  const { transactions, goals } = useFinance();
  const today = nowInBrasilia();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();

  const thisMonthTransactions = useMemo(
    () => filterByMonth(transactions, currentYear, currentMonth),
    [transactions, currentYear, currentMonth]
  );

  const balance = useMemo(() => calcBalance(transactions), [transactions]);
  const entradasMes = useMemo(() => sumEntradas(thisMonthTransactions), [thisMonthTransactions]);
  const saidasMes = useMemo(() => sumSaidas(thisMonthTransactions), [thisMonthTransactions]);
  // "Total pago": das saídas deste mês, só as que já venceram (data <= hoje).
  const totalPagoMes = useMemo(
    () =>
      sumSaidas(thisMonthTransactions.filter((t) => t.date <= todayISO())),
    [thisMonthTransactions]
  );

  const categoryTotals = useMemo(() => getCategoryTotals(transactions), [transactions]);
  const monthlyFlow = useMemo(() => getMonthlyFlow(transactions, currentYear), [transactions, currentYear]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Finanças</h1>
          <p className="text-sm text-muted-foreground">
            Controle de entradas, saídas, relatórios e metas.
          </p>
        </div>
        <AddTransactionDialog
          trigger={
            <Button size="sm" className="gap-1.5">
              <Plus className="size-4" />
              Nova Conta
            </Button>
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          icon={<Wallet className="size-5" />}
          iconClassName="bg-primary/10 text-primary"
          label="Saldo Atual"
          value={formatBRL(balance)}
        />
        <SummaryCard
          icon={<TrendingUp className="size-5" />}
          iconClassName="bg-success/10 text-success"
          label="Entradas do Mês"
          value={formatBRL(entradasMes)}
        />
        <SummaryCard
          icon={<TrendingDown className="size-5" />}
          iconClassName="bg-destructive/10 text-destructive"
          label="Saídas do Mês"
          value={formatBRL(saidasMes)}
        />
        <SummaryCard
          icon={<CalendarClock className="size-5" />}
          iconClassName="bg-warning/15 text-warning"
          label="Total Pago no Mês"
          value={formatBRL(totalPagoMes)}
        />
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList>
          <TabsTrigger value="dashboard">📊 Dashboard</TabsTrigger>
          <TabsTrigger value="relatorios">📄 Relatórios</TabsTrigger>
          <TabsTrigger value="metas">🎯 Metas</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Gastos por Categoria</CardTitle>
              </CardHeader>
              <CardContent>
                <CategoryPieChart data={categoryTotals} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Entradas x Saídas (mês atual)</CardTitle>
              </CardHeader>
              <CardContent>
                <ComparisonChart entradas={entradasMes} saidas={saidasMes} saldo={entradasMes - saidasMes} />
              </CardContent>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>Fluxo Mensal</CardTitle>
              </CardHeader>
              <CardContent>
                <MonthlyFlowChart data={monthlyFlow} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="relatorios">
          <ReportsTab transactions={transactions} />
        </TabsContent>

        <TabsContent value="metas">
          <div className="flex flex-col gap-4">
            <div className="flex justify-end">
              <AddGoalDialog
                trigger={
                  <Button size="sm" variant="outline" className="gap-1.5">
                    <Target className="size-4" />
                    Nova Meta
                  </Button>
                }
              />
            </div>
            {goals.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhuma meta criada ainda.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {goals.map((goal) => (
                  <GoalCard key={goal.id} goal={goal} />
                ))}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({
  icon,
  iconClassName,
  label,
  value,
}: {
  icon: ReactNode;
  iconClassName: string;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-5">
        <div className={`flex size-11 items-center justify-center rounded-xl ${iconClassName}`}>
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// Aba "Relatórios": filtra os lançamentos por período (hoje, semana, mês,
// ano ou um intervalo de datas escolhido manualmente) e mostra receitas,
// despesas e um resumo com os totais do período selecionado.
function ReportsTab({ transactions }: { transactions: Transaction[] }) {
  const [filter, setFilter] = useState<ReportFilter>("mes");
  const [listSearch, setListSearch] = useState("");
  const [customStart, setCustomStart] = useState(todayISO());
  const [customEnd, setCustomEnd] = useState(todayISO());

  const filtered = useMemo(() => {
    const today = todayISO();
    let start = today;
    let end = today;

    if (filter === "semana") {
      start = addDays(today, -6);
    } else if (filter === "mes") {
      start = `${today.slice(0, 7)}-01`;
    } else if (filter === "ano") {
      start = `${today.slice(0, 4)}-01-01`;
      end = `${today.slice(0, 4)}-12-31`;
    } else if (filter === "personalizado") {
      start = customStart;
      end = customEnd;
    }

    return transactions.filter((t) => t.date >= start && t.date <= end);
  }, [transactions, filter, customStart, customEnd]);

  const receitas = filtered.filter((t) => t.type === "entrada");
  const despesas = filtered.filter((t) => t.type === "saida");
  const receitasFiltradas = receitas.filter((t) => `${t.description} ${t.category} ${t.observation ?? ""} ${t.date}`.toLocaleLowerCase("pt-BR").includes(listSearch.trim().toLocaleLowerCase("pt-BR")));
  const despesasFiltradas = despesas.filter((t) => `${t.description} ${t.category} ${t.observation ?? ""} ${t.date}`.toLocaleLowerCase("pt-BR").includes(listSearch.trim().toLocaleLowerCase("pt-BR")));
  const totalEntradas = sumEntradas(filtered);
  const totalSaidas = sumSaidas(filtered);

  const FILTERS: { value: ReportFilter; label: string }[] = [
    { value: "hoje", label: "Hoje" },
    { value: "semana", label: "Semana" },
    { value: "mes", label: "Mês" },
    { value: "ano", label: "Ano" },
    { value: "personalizado", label: "Período" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            type="button"
            size="sm"
            variant={filter === f.value ? "default" : "outline"}
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
        {filter === "personalizado" && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="h-8 w-36"
            />
            <span className="text-sm text-muted-foreground">até</span>
            <Input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="h-8 w-36"
            />
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumo</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6 text-sm">
          <span>
            Total de entradas: <strong className="text-success">{formatBRL(totalEntradas)}</strong>
          </span>
          <span>
            Total de saídas: <strong className="text-destructive">{formatBRL(totalSaidas)}</strong>
          </span>
          <span>
            Saldo final: <strong>{formatBRL(totalEntradas - totalSaidas)}</strong>
          </span>
        </CardContent>
      </Card>

      <Input value={listSearch} onChange={(e) => setListSearch(e.target.value)} placeholder="Pesquisar lançamentos por descrição, categoria ou data" aria-label="Pesquisar lançamentos financeiros" />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Receitas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {receitasFiltradas.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma receita no período.</p>
            ) : (
              receitasFiltradas.map((t) => <TransactionListItem key={t.id} transaction={t} />)
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Despesas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {despesasFiltradas.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma despesa no período.</p>
            ) : (
              despesasFiltradas.map((t) => <TransactionListItem key={t.id} transaction={t} />)
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
