import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MONTH_NAMES_PT,
  WEEKDAY_NAMES_PT,
  getDaysInMonth,
  makeISODate,
  todayISO,
} from "@/lib/date";

interface MonthGridProps {
  year: number;
  month: number; // 0-indexed
  onMonthChange: (year: number, month: number) => void;
  markedDates?: Record<string, { count: number; hasOverdue?: boolean }>;
  // Marcadores financeiros (independentes dos de tarefa): "entrada" pinta
  // verde, "saida" pinta vermelho, "ambos" quando o dia tem os dois tipos.
  financeMarkedDates?: Record<string, "entrada" | "saida" | "ambos">;
  selectedDate?: string | null;
  onSelectDate?: (iso: string) => void;
  compact?: boolean;
}

// Grade de calendário mensal reutilizável. É "controlada": quem usa este
// componente (CalendarViewPage) guarda o ano/mês/dia selecionado em seu
// próprio estado e passa para baixo via props — o MonthGrid não guarda
// nada sozinho, só dispara os callbacks onMonthChange/onSelectDate.
export function MonthGrid({
  year,
  month,
  onMonthChange,
  markedDates = {},
  financeMarkedDates = {},
  selectedDate,
  onSelectDate,
  compact = false,
}: MonthGridProps) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstWeekday = new Date(year, month, 1).getDay();
  const today = todayISO();

  // Monta a lista de células da grade: começa com `null`s para alinhar
  // o dia 1 no dia da semana correto, depois os números reais do mês.
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // Navega para o mês anterior, voltando um ano quando sai de Janeiro.
  function goPrev() {
    if (month === 0) onMonthChange(year - 1, 11);
    else onMonthChange(year, month - 1);
  }

  // Navega para o próximo mês, avançando um ano quando passa de Dezembro.
  function goNext() {
    if (month === 11) onMonthChange(year + 1, 0);
    else onMonthChange(year, month + 1);
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between rounded-xl bg-gradient-to-r from-primary/10 via-primary/5 to-muted px-3 py-2">
        <span className="text-sm font-semibold text-foreground">
          {MONTH_NAMES_PT[month]} {year}
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={goPrev}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={goNext}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAY_NAMES_PT.map((d) => (
          <div key={d} className="pb-1 text-[11px] font-semibold text-muted-foreground">
            {d}
          </div>
        ))}

        {cells.map((day, idx) => {
          // Célula vazia (antes do dia 1) só preenche o espaço na grade.
          if (day === null) return <div key={`empty-${idx}`} />;

          const iso = makeISODate(year, month, day);
          const marker = markedDates[iso]; // há tarefas pendentes neste dia?
          const financeMarker = financeMarkedDates[iso]; // há lançamento financeiro neste dia?
          const isToday = iso === today;
          const isSelected = iso === selectedDate;

          return (
            <button
              key={iso}
              onClick={() => onSelectDate?.(iso)}
              className={cn(
                "relative mx-auto flex items-center justify-center rounded-xl border text-sm transition-all duration-200",
                compact ? "size-8" : "size-10",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : isToday
                  ? "border-amarelo bg-amarelo/15 font-semibold text-verde"
                  : "border-border/50 bg-card text-foreground hover:border-primary/40 hover:bg-accent"
              )}
            >
              {day}
              {marker && (
                // Bolinha indicadora: vermelha se há tarefa vencida nesse
                // dia, azul (cor primária) caso contrário.
                <span
                  className={cn(
                    "absolute bottom-0.5 size-1.5 rounded-full",
                    marker.hasOverdue ? "bg-destructive" : "bg-primary",
                    isSelected && "bg-primary-foreground"
                  )}
                />
              )}
              {financeMarker && (
                // Bolinha no canto superior: verde (entrada), vermelha
                // (saída) ou metade de cada quando o dia tem os dois.
                <span
                  className={cn(
                    "absolute top-0.5 right-0.5 size-1.5 rounded-full",
                    financeMarker === "entrada" && "bg-success",
                    financeMarker === "saida" && "bg-destructive",
                    financeMarker === "ambos" && "bg-warning"
                  )}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
