import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  Award,
  Ban,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  DollarSign,
  History,
  Info,
  Lightbulb,
  ListChecks,
  Pencil,
  Plus,
  Settings,
  TrendingUp,
  Trash2,
  Upload,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchFinancialOverrides, saveFinancialOverrides } from "@/data/operationApi";
import { useOperation } from "@/contexts/OperationContext";
import { formatDateBR, todayISO } from "@/lib/date";
import { extractPunchFromImage } from "@/lib/ocr";
import {
  CATEGORY_LABEL,
  computeCategory,
  computeCycleSummary,
  computeFinancialSummary,
  computeOvertimeSummary,
  computePrizeAmount,
  computeProductionSummary,
  computePunchDay,
  formatMinutesAsHM,
  getCurrentCycleRange,
  getPreviousCycleRange,
  isWithinRange,
} from "@/lib/operation";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import type {
  ActivityType,
  FinancialOverrides,
  OperationActivity,
  OperationSettings,
  PunchRecord,
} from "@/types";

const EMPTY_OVERRIDES: FinancialOverrides = {
  baseSalary: null,
  hazardPay: null,
  overtime50Amount: null,
  overtime100Amount: null,
  dsrAmount: null,
  prizeAmount: null,
};

function formatNumber(value: number, decimals = 1): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Monta o estado do formulário de ajustes do Card 7 a partir dos overrides
// salvos: cada campo começa marcado como "manual" só quando já existe um
// ajuste; o valor mostrado é o ajuste (se houver) ou o calculado, pra dar
// um ponto de partida sensato quando o técnico decide editar.
function buildFinancialForm(
  overrides: FinancialOverrides,
  computed: ReturnType<typeof computeFinancialSummary>
): Record<keyof FinancialOverrides, { manual: boolean; value: string }> {
  function field(overrideValue: number | null, computedValue: number) {
    return { manual: overrideValue !== null, value: String(overrideValue ?? computedValue) };
  }
  return {
    baseSalary: field(overrides.baseSalary, computed.baseSalary),
    hazardPay: field(overrides.hazardPay, computed.hazardPay),
    overtime50Amount: field(overrides.overtime50Amount, computed.overtime50Amount),
    overtime100Amount: field(overrides.overtime100Amount, computed.overtime100Amount),
    dsrAmount: field(overrides.dsrAmount, computed.dsrAmount),
    prizeAmount: field(overrides.prizeAmount, computed.prizeAmount),
  };
}

export function OperationsPage() {
  const {
    activities,
    punches,
    settings,
    addActivity,
    updateActivity,
    deleteActivity,
    updateSettings,
    savePunch,
    deletePunch,
  } = useOperation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formType, setFormType] = useState<ActivityType>("BA");
  const [formDate, setFormDate] = useState(todayISO());
  const [formQuantity, setFormQuantity] = useState("1");
  // Quantas BA/BD foram adicionadas desde que o diálogo foi aberto — sinaliza
  // o progresso pra quem está lançando várias de uma vez, sem fechar.
  const [sessionAdded, setSessionAdded] = useState({ BA: 0, BD: 0 });

  const [isAdjustDialogOpen, setIsAdjustDialogOpen] = useState(false);
  const [adjustEffectiveness, setAdjustEffectiveness] = useState(String(settings.effectivenessPercent));

  function openAdjustDialog() {
    setAdjustEffectiveness(String(settings.effectivenessPercent));
    setIsAdjustDialogOpen(true);
  }

  function handleSaveAdjustments() {
    const patch: Partial<OperationSettings> = {
      effectivenessPercent: Number(adjustEffectiveness) || 0,
    };
    updateSettings({ ...settings, ...patch });
    setIsAdjustDialogOpen(false);
  }

  // A empresa fecha 3 ciclos fixos por mês (1-10, 11-20, 21-fim) — ver
  // getCurrentCycleRange em lib/operation.ts. Não depende mais de nenhuma
  // configuração do usuário.
  const cycle = useMemo(() => getCurrentCycleRange(), []);
  const previousCycle = useMemo(() => getPreviousCycleRange(cycle.start), [cycle.start]);

  const cycleActivities = useMemo(
    () => activities.filter((a) => isWithinRange(a.date, cycle.start, cycle.end)),
    [activities, cycle]
  );

  const cycleSummary = useMemo(
    () => computeCycleSummary(cycleActivities, cycle.start, cycle.end),
    [cycleActivities, cycle]
  );
  const production = useMemo(
    () => computeProductionSummary(cycleActivities, cycleSummary.weightedDays),
    [cycleActivities, cycleSummary.weightedDays]
  );
  const category = useMemo(
    () => computeCategory(production, settings.effectivenessPercent),
    [production, settings.effectivenessPercent]
  );
  const prizeAmount = useMemo(() => computePrizeAmount(category), [category]);

  // Lista completa (não só do ciclo atual) — dá pra editar/excluir BA/BD
  // de qualquer ciclo, não só o corrente.
  const sortedAllActivities = useMemo(
    () => [...activities].sort((a, b) => b.date.localeCompare(a.date)),
    [activities]
  );
  const [isActivitiesListOpen, setIsActivitiesListOpen] = useState(false);

  // Mesmo pipeline de cálculo do ciclo atual, aplicado à janela do ciclo
  // anterior — usado no card de comparação. "Zerar e memorizar" já
  // acontece sozinho: as atividades ficam presas à data em que foram
  // lançadas, então o ciclo anterior nunca muda mais depois de fechado.
  const previousCycleActivities = useMemo(
    () => activities.filter((a) => isWithinRange(a.date, previousCycle.start, previousCycle.end)),
    [activities, previousCycle]
  );
  const previousCycleSummary = useMemo(
    () => computeCycleSummary(previousCycleActivities, previousCycle.start, previousCycle.end),
    [previousCycleActivities, previousCycle]
  );
  const previousProduction = useMemo(
    () => computeProductionSummary(previousCycleActivities, previousCycleSummary.weightedDays),
    [previousCycleActivities, previousCycleSummary.weightedDays]
  );
  const previousCategory = useMemo(
    () => computeCategory(previousProduction, settings.effectivenessPercent),
    [previousProduction, settings.effectivenessPercent]
  );
  const previousPrizeAmount = useMemo(() => computePrizeAmount(previousCategory), [previousCategory]);

  function resetForm() {
    setEditingId(null);
    setFormType("BA");
    setFormDate(todayISO());
    setFormQuantity("1");
    setSessionAdded({ BA: 0, BD: 0 });
  }

  function openCreateDialog() {
    resetForm();
    setIsDialogOpen(true);
  }

  function openEditDialog(activity: OperationActivity) {
    setEditingId(activity.id);
    setFormType(activity.type);
    setFormDate(activity.date);
    setFormQuantity(String(activity.quantity));
    setIsDialogOpen(true);
  }

  function handleSave() {
    const quantity = Number(formQuantity);
    if (!quantity || quantity <= 0) return;

    if (editingId) {
      // Editar é uma ação pontual: salva e fecha.
      updateActivity(editingId, { type: formType, date: formDate, quantity });
      setIsDialogOpen(false);
      resetForm();
    } else {
      // Lançar fica aberto — o técnico costuma lançar várias BA/BD de
      // uma vez só no fim do dia. Mantém tipo e data, só reseta a
      // quantidade pro próximo lançamento; só fecha quando ele mandar.
      addActivity({ type: formType, date: formDate, quantity });
      setSessionAdded((prev) => ({ ...prev, [formType]: prev[formType] + quantity }));
      setFormQuantity("1");
    }
  }

  function handleDelete(activityId: string) {
    if (!window.confirm("Excluir esta atividade?")) return;
    deleteActivity(activityId);
  }

  const indicators = useMemo(
    () =>
      buildIndicators({
        production,
        category,
        weightedDays: cycleSummary.weightedDays,
        prizeAmount,
        effectivenessPercent: settings.effectivenessPercent,
      }),
    [production, category, cycleSummary.weightedDays, prizeAmount, settings.effectivenessPercent]
  );

  // --- Card 5: Ponto e horas extras ---
  const [isPunchDialogOpen, setIsPunchDialogOpen] = useState(false);
  const [editingPunchId, setEditingPunchId] = useState<string | null>(null);
  const [punchDate, setPunchDate] = useState(todayISO());
  const [clockIn, setClockIn] = useState("");
  const [lunchStart, setLunchStart] = useState("");
  const [lunchEnd, setLunchEnd] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const cyclePunches = useMemo(
    () => punches.filter((p) => isWithinRange(p.date, cycle.start, cycle.end)),
    [punches, cycle]
  );

  const overtimeSummary = useMemo(
    () => computeOvertimeSummary(cyclePunches, settings, cycle.start, cycle.end),
    [cyclePunches, settings, cycle]
  );

  function resetPunchForm() {
    setEditingPunchId(null);
    setPunchDate(todayISO());
    setClockIn("08:00"); // jornada padrão — sempre editável se o dia foi diferente
    setLunchStart("");
    setLunchEnd("");
    setClockOut("");
    setOcrError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openPunchDialog() {
    resetPunchForm();
    setIsPunchDialogOpen(true);
  }

  function openEditPunchDialog(punch: PunchRecord) {
    setEditingPunchId(punch.id);
    setPunchDate(punch.date);
    setClockIn(punch.clockIn);
    setLunchStart(punch.lunchStart);
    setLunchEnd(punch.lunchEnd);
    setClockOut(punch.clockOut);
    setOcrError(null);
    setIsPunchDialogOpen(true);
  }

  async function handlePunchImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcrLoading(true);
    setOcrError(null);
    try {
      const punch = await extractPunchFromImage(file);
      if (punch.times.length === 0) {
        setOcrError("Não encontramos horários nessa imagem. Preencha os campos manualmente.");
      } else {
        // Entrada fica fixa em 08:00 (jornada padrão); os 3 últimos
        // horários lidos preenchem início/fim do almoço e saída, nessa
        // ordem. Sempre revise antes de salvar — a leitura pode errar um
        // dígito ou faltar algum registro do dia.
        if (punch.clockIn) setClockIn(punch.clockIn);
        if (punch.lunchStart) setLunchStart(punch.lunchStart);
        if (punch.lunchEnd) setLunchEnd(punch.lunchEnd);
        if (punch.clockOut) setClockOut(punch.clockOut);
        if (!punch.lunchStart || !punch.lunchEnd || !punch.clockOut) {
          setOcrError(
            `Encontramos ${punch.times.length} horário(s) nessa imagem. Confira e complete os campos que faltarem.`
          );
        }
      }
    } catch (error) {
      console.error("Falha ao ler imagem do ponto por OCR:", error);
      const detail = error instanceof Error ? error.message : String(error);
      setOcrError(`Não foi possível ler essa imagem (${detail}). Preencha os campos manualmente.`);
    } finally {
      setOcrLoading(false);
    }
  }

  function handleSavePunch() {
    if (!clockIn || !lunchStart || !lunchEnd || !clockOut) return;

    savePunch({ date: punchDate, clockIn, lunchStart, lunchEnd, clockOut });
    setIsPunchDialogOpen(false);
    resetPunchForm();
  }

  function handleDeletePunch(punchId: string) {
    if (!window.confirm("Excluir este registro de ponto?")) return;
    deletePunch(punchId);
  }

  // --- Card 7: Resumo financeiro ---
  const financialSummary = useMemo(
    () => computeFinancialSummary(settings, overtimeSummary, prizeAmount),
    [settings, overtimeSummary, prizeAmount]
  );

  const [overrides, setOverrides] = useState<FinancialOverrides>(EMPTY_OVERRIDES);

  // Os ajustes manuais são por ciclo (identificados pela data de início).
  // Troca de ciclo (ou primeiro carregamento) recarrega o que já foi
  // salvo pra esse ciclo específico. Sem Supabase não há onde persistir
  // por ciclo, então o estado (iniciado vazio) simplesmente não recarrega.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let isMounted = true;
    fetchFinancialOverrides(cycle.start)
      .then((saved) => {
        if (isMounted) setOverrides(saved ?? EMPTY_OVERRIDES);
      })
      .catch((error) => console.error("Falha ao carregar ajustes do resumo financeiro:", error));
    return () => {
      isMounted = false;
    };
  }, [cycle.start]);

  // Efetivo = ajuste manual quando existir, senão o valor calculado.
  const effectiveFinancial = {
    baseSalary: overrides.baseSalary ?? financialSummary.baseSalary,
    hazardPay: overrides.hazardPay ?? financialSummary.hazardPay,
    overtime50Amount: overrides.overtime50Amount ?? financialSummary.overtime50Amount,
    overtime100Amount: overrides.overtime100Amount ?? financialSummary.overtime100Amount,
    dsrAmount: overrides.dsrAmount ?? financialSummary.dsrAmount,
    prizeAmount: overrides.prizeAmount ?? financialSummary.prizeAmount,
  };
  const effectiveTotalGross =
    effectiveFinancial.baseSalary +
    effectiveFinancial.hazardPay +
    effectiveFinancial.overtime50Amount +
    effectiveFinancial.overtime100Amount +
    effectiveFinancial.dsrAmount +
    effectiveFinancial.prizeAmount;

  const [isFinancialDialogOpen, setIsFinancialDialogOpen] = useState(false);
  const [financialForm, setFinancialForm] = useState<Record<keyof FinancialOverrides, { manual: boolean; value: string }>>(
    () => buildFinancialForm(EMPTY_OVERRIDES, financialSummary)
  );

  function openFinancialDialog() {
    setFinancialForm(buildFinancialForm(overrides, financialSummary));
    setIsFinancialDialogOpen(true);
  }

  function handleSaveFinancialOverrides() {
    const next: FinancialOverrides = {
      baseSalary: financialForm.baseSalary.manual ? Number(financialForm.baseSalary.value) || 0 : null,
      hazardPay: financialForm.hazardPay.manual ? Number(financialForm.hazardPay.value) || 0 : null,
      overtime50Amount: financialForm.overtime50Amount.manual ? Number(financialForm.overtime50Amount.value) || 0 : null,
      overtime100Amount: financialForm.overtime100Amount.manual
        ? Number(financialForm.overtime100Amount.value) || 0
        : null,
      dsrAmount: financialForm.dsrAmount.manual ? Number(financialForm.dsrAmount.value) || 0 : null,
      prizeAmount: financialForm.prizeAmount.manual ? Number(financialForm.prizeAmount.value) || 0 : null,
    };

    setOverrides(next);
    setIsFinancialDialogOpen(false);

    if (isSupabaseConfigured) {
      saveFinancialOverrides(cycle.start, next).catch((error) =>
        console.error("Falha ao salvar ajustes do resumo financeiro:", error)
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operação</h1>
          <p className="text-sm text-muted-foreground">
            Produtividade, categoria e estimativa de remuneração do ciclo atual.
          </p>
        </div>
        <Button size="sm" onClick={openCreateDialog} className="gap-1.5">
          <Plus className="size-4" />
          Lançar atividade
        </Button>
      </div>

      {/* Todas as atividades (de qualquer ciclo): fica recolhida, só com a
          contagem — clique expande pra ver/editar/excluir qualquer uma,
          não só as do ciclo atual. */}
      <Card>
        <button
          type="button"
          onClick={() => setIsActivitiesListOpen((prev) => !prev)}
          className="flex w-full items-center justify-between gap-3 p-4 text-left"
          aria-expanded={isActivitiesListOpen}
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <Info className="size-4 text-muted-foreground" />
            Todas as atividades
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {sortedAllActivities.length}
            </span>
          </span>
          {isActivitiesListOpen ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </button>
        {isActivitiesListOpen && (
          <CardContent className="flex max-h-96 flex-col gap-2 overflow-y-auto pt-0">
            {sortedAllActivities.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Nenhuma atividade lançada ainda.
              </p>
            ) : (
              sortedAllActivities.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        activity.type === "BA" ? "bg-primary/10 text-primary" : "bg-warning/15 text-warning"
                      }`}
                    >
                      {activity.type}
                    </span>
                    <span className="text-sm">{formatDateBR(activity.date)}</span>
                    <span className="text-sm text-muted-foreground">Qtd: {activity.quantity}</span>
                    {isWithinRange(activity.date, cycle.start, cycle.end) && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        ciclo atual
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditDialog(activity)}>
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(activity.id)}
                      aria-label="Excluir atividade"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Card 1 – Resumo do Ciclo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="size-4" />
              Resumo do ciclo
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <StatRow label="Ciclo atual" value={`${formatDateBR(cycle.start)} – ${formatDateBR(cycle.end)}`} />
            <StatRow label="Dias trabalhados" value={String(cycleSummary.daysWorked)} />
            <StatRow label="Dias ponderados" value={formatNumber(cycleSummary.weightedDays, 2)} />
            <p className="text-xs text-muted-foreground">
              3 ciclos por mês (1-10, 11-20, 21-fim). Peso por dia: seg-sex = 1,0 · sábado = 0,85 · domingo = 0,15.
            </p>
          </CardContent>
        </Card>

        {/* Card 2 – Produção */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wrench className="size-4" />
              Produção
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <StatRow label="BA (Instalações)" value={String(production.ba)} />
            <StatRow label="BD (Reparos)" value={String(production.bd)} />
            <StatRow label="Total de atividades" value={String(production.total)} />
            <StatRow label="% BA" value={`${formatNumber(production.baPercent)}%`} />
            <StatRow label="% BD" value={`${formatNumber(production.bdPercent)}%`} />
            <StatRow label="Média diária" value={formatNumber(production.average, 2)} />
          </CardContent>
        </Card>

        {/* Card 3 – Categoria */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <ListChecks className="size-4" />
              Categoria
            </CardTitle>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 text-muted-foreground hover:text-foreground"
              onClick={openAdjustDialog}
              aria-label="Ajustar efetividade"
            >
              <Settings className="size-4" />
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
              <Award className="size-5 text-primary" />
              <div>
                <p className="text-xs text-muted-foreground">Categoria identificada</p>
                <p className="text-lg font-semibold">{CATEGORY_LABEL[category]}</p>
              </div>
            </div>
            <div className="flex flex-col gap-1 text-xs text-muted-foreground">
              <p>Instalador: BA ≥ 69% e média ≥ 3/dia.</p>
              <p>Reparador: BD ≥ 70%, média ≥ 4/dia e efetividade &gt; 80%.</p>
              <p>Mix: BA &lt; 69%, BD &lt; 70% e média ≥ 3,5/dia.</p>
            </div>
          </CardContent>
        </Card>

        {/* Card 4 – Prêmio Estimado */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="size-4" />
              Prêmio estimado
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <StatRow label="Categoria atual" value={CATEGORY_LABEL[category]} />
            <StatRow label="Média diária" value={formatNumber(production.average, 2)} />
            <StatRow label="% BA" value={`${formatNumber(production.baPercent)}%`} />
            <StatRow label="% BD" value={`${formatNumber(production.bdPercent)}%`} />
            <div className="mt-1 rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Valor estimado do prêmio</p>
              <p className={`text-2xl font-semibold ${prizeAmount === 0 ? "text-muted-foreground" : "text-success"}`}>
                {formatCurrency(prizeAmount)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Comparação com o ciclo anterior */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-4" />
            Comparação com o ciclo anterior
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 gap-y-1">
            <span />
            <span className="text-right text-xs font-medium text-muted-foreground">
              Atual
              <br />
              {formatDateBR(cycle.start)}–{formatDateBR(cycle.end)}
            </span>
            <span className="text-right text-xs font-medium text-muted-foreground">
              Anterior
              <br />
              {formatDateBR(previousCycle.start)}–{formatDateBR(previousCycle.end)}
            </span>

            <CompareRow label="BA" current={String(production.ba)} previous={String(previousProduction.ba)} />
            <CompareRow label="BD" current={String(production.bd)} previous={String(previousProduction.bd)} />
            <CompareRow
              label="Total"
              current={String(production.total)}
              previous={String(previousProduction.total)}
            />
            <CompareRow
              label="Média diária"
              current={formatNumber(production.average, 2)}
              previous={formatNumber(previousProduction.average, 2)}
              trend={production.average - previousProduction.average}
            />
            <CompareRow
              label="Categoria"
              current={CATEGORY_LABEL[category]}
              previous={CATEGORY_LABEL[previousCategory]}
            />
            <CompareRow
              label="Prêmio"
              current={formatCurrency(prizeAmount)}
              previous={formatCurrency(previousPrizeAmount)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Card 5 – Ponto e Horas Extras */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Clock className="size-4" />
            Ponto e horas extras
          </CardTitle>
          <Button size="sm" variant="outline" onClick={openPunchDialog} className="gap-1.5">
            <Upload className="size-4" />
            Importar ponto
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Horas Extras 50%</p>
              <p className="mt-1 text-lg font-semibold">{formatMinutesAsHM(overtimeSummary.overtime50Minutes)}</p>
              <p className="text-sm text-muted-foreground">{formatCurrency(overtimeSummary.overtime50Amount)}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">Horas Extras 100%</p>
              <p className="mt-1 text-lg font-semibold">{formatMinutesAsHM(overtimeSummary.overtime100Minutes)}</p>
              <p className="text-sm text-muted-foreground">{formatCurrency(overtimeSummary.overtime100Amount)}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">DSR Hora Extra</p>
              <p className="mt-1 text-lg font-semibold">{formatCurrency(overtimeSummary.dsrAmount)}</p>
            </div>
          </div>
          <StatRow label="Total estimado de horas extras" value={formatCurrency(overtimeSummary.totalAmount)} />

          <div className="flex flex-col gap-2">
            {cyclePunches.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Nenhum ponto lançado neste ciclo ainda.
              </p>
            ) : (
              [...cyclePunches]
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((punch) => {
                  const day = computePunchDay(punch);
                  return (
                    <div key={punch.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sm font-medium">{formatDateBR(punch.date)}</span>
                        <span className="text-sm text-muted-foreground">
                          {punch.clockIn} - {punch.lunchStart} / {punch.lunchEnd} - {punch.clockOut}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Trabalhado: {formatMinutesAsHM(day.workedMinutes)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEditPunchDialog(punch)}>
                          Editar
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeletePunch(punch.id)}
                          aria-label="Excluir ponto"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Card 6 – Indicadores Inteligentes */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="size-4" />
            Indicadores inteligentes
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {indicators.map((indicator, index) => (
            <div key={index} className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
              <IndicatorIcon level={indicator.level} />
              <span>{indicator.text}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Card 7 – Resumo Financeiro */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="size-4" />
            Resumo financeiro
          </CardTitle>
          <Button
            size="icon"
            variant="ghost"
            className="size-8 text-muted-foreground hover:text-foreground"
            onClick={openFinancialDialog}
            aria-label="Editar resumo financeiro"
          >
            <Pencil className="size-4" />
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <StatRow label="Salário base" value={formatCurrency(effectiveFinancial.baseSalary)} edited={overrides.baseSalary !== null} />
          <StatRow label="Periculosidade" value={formatCurrency(effectiveFinancial.hazardPay)} edited={overrides.hazardPay !== null} />
          <StatRow
            label="Horas Extras 50%"
            value={formatCurrency(effectiveFinancial.overtime50Amount)}
            edited={overrides.overtime50Amount !== null}
          />
          <StatRow
            label="Horas Extras 100%"
            value={formatCurrency(effectiveFinancial.overtime100Amount)}
            edited={overrides.overtime100Amount !== null}
          />
          <StatRow label="DSR Hora Extra" value={formatCurrency(effectiveFinancial.dsrAmount)} edited={overrides.dsrAmount !== null} />
          <StatRow label="Prêmio produção" value={formatCurrency(effectiveFinancial.prizeAmount)} edited={overrides.prizeAmount !== null} />
          <div className="my-1 border-t border-border" />
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">Estimativa total bruta</span>
            <span className="text-xl font-semibold text-success">{formatCurrency(effectiveTotalGross)}</span>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar atividade" : "Lançar atividade"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="activity-type">Tipo</Label>
              <Select value={formType} onValueChange={(value) => setFormType(value as ActivityType)}>
                <SelectTrigger id="activity-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BA">BA (Instalação)</SelectItem>
                  <SelectItem value="BD">BD (Reparo)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="activity-date">Data</Label>
                <Input id="activity-date" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="activity-quantity">Quantidade</Label>
                <Input
                  id="activity-quantity"
                  type="number"
                  min={1}
                  value={formQuantity}
                  onChange={(e) => setFormQuantity(e.target.value)}
                />
              </div>
            </div>

            {!editingId && (
              <>
                <p className="text-xs text-muted-foreground">
                  Cada clique em "Adicionar" lança uma atividade e deixa essa janela aberta — dá pra lançar tudo do
                  dia de uma vez. Feche quando terminar.
                </p>
                {(sessionAdded.BA > 0 || sessionAdded.BD > 0) && (
                  <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
                    <CheckCircle2 className="size-4 shrink-0" />
                    <span>
                      Adicionado agora: {sessionAdded.BA > 0 && `${sessionAdded.BA} BA`}
                      {sessionAdded.BA > 0 && sessionAdded.BD > 0 && " · "}
                      {sessionAdded.BD > 0 && `${sessionAdded.BD} BD`}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {editingId ? "Cancelar" : "Fechar"}
            </Button>
            <Button onClick={handleSave} disabled={!Number(formQuantity)}>
              {editingId ? "Salvar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAdjustDialogOpen} onOpenChange={setIsAdjustDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajustar efetividade</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adjust-effectiveness">Efetividade (%)</Label>
              <Input
                id="adjust-effectiveness"
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={adjustEffectiveness}
                onChange={(e) => setAdjustEffectiveness(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Informada manualmente — usada na regra da categoria Reparador (efetividade &gt; 80%).
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAdjustDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveAdjustments}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isPunchDialogOpen}
        onOpenChange={(open) => {
          setIsPunchDialogOpen(open);
          if (!open) resetPunchForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPunchId ? "Editar ponto" : "Importar ponto"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {!editingPunchId && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="punch-image">Print do app de ponto (opcional)</Label>
                <Input id="punch-image" type="file" accept="image/*" ref={fileInputRef} onChange={handlePunchImageChange} />
                <p className="text-xs text-muted-foreground">
                  Lemos a imagem por OCR (gratuito, roda no navegador) e preenchemos os horários abaixo — confira
                  antes de salvar, o reconhecimento pode errar.
                </p>
                {ocrLoading && <p className="text-xs text-primary">Lendo imagem...</p>}
                {ocrError && <p className="text-xs text-warning">{ocrError}</p>}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="punch-date">Data</Label>
              <Input
                id="punch-date"
                type="date"
                value={punchDate}
                onChange={(e) => setPunchDate(e.target.value)}
                disabled={!!editingPunchId}
              />
              {editingPunchId && (
                <p className="text-xs text-muted-foreground">
                  Pra mover este ponto pra outro dia, exclua e lance de novo na data certa.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="punch-clock-in">Entrada</Label>
                <Input id="punch-clock-in" type="time" value={clockIn} onChange={(e) => setClockIn(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="punch-lunch-start">Início do almoço</Label>
                <Input
                  id="punch-lunch-start"
                  type="time"
                  value={lunchStart}
                  onChange={(e) => setLunchStart(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="punch-lunch-end">Fim do almoço</Label>
                <Input id="punch-lunch-end" type="time" value={lunchEnd} onChange={(e) => setLunchEnd(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="punch-clock-out">Saída</Label>
                <Input id="punch-clock-out" type="time" value={clockOut} onChange={(e) => setClockOut(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPunchDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSavePunch} disabled={!clockIn || !lunchStart || !lunchEnd || !clockOut}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isFinancialDialogOpen} onOpenChange={setIsFinancialDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar resumo financeiro</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              Marque a caixinha de um valor pra digitar manualmente. Sem marcar, ele continua calculado
              automaticamente e atualiza sozinho quando você lança atividades ou pontos.
            </p>
            <FinancialOverrideField
              id="fin-base-salary"
              label="Salário base"
              field={financialForm.baseSalary}
              computedValue={financialSummary.baseSalary}
              onChange={(next) => setFinancialForm((prev) => ({ ...prev, baseSalary: next }))}
            />
            <FinancialOverrideField
              id="fin-hazard-pay"
              label="Periculosidade"
              field={financialForm.hazardPay}
              computedValue={financialSummary.hazardPay}
              onChange={(next) => setFinancialForm((prev) => ({ ...prev, hazardPay: next }))}
            />
            <FinancialOverrideField
              id="fin-overtime-50"
              label="Horas Extras 50%"
              field={financialForm.overtime50Amount}
              computedValue={financialSummary.overtime50Amount}
              onChange={(next) => setFinancialForm((prev) => ({ ...prev, overtime50Amount: next }))}
            />
            <FinancialOverrideField
              id="fin-overtime-100"
              label="Horas Extras 100%"
              field={financialForm.overtime100Amount}
              computedValue={financialSummary.overtime100Amount}
              onChange={(next) => setFinancialForm((prev) => ({ ...prev, overtime100Amount: next }))}
            />
            <FinancialOverrideField
              id="fin-dsr"
              label="DSR Hora Extra"
              field={financialForm.dsrAmount}
              computedValue={financialSummary.dsrAmount}
              onChange={(next) => setFinancialForm((prev) => ({ ...prev, dsrAmount: next }))}
            />
            <FinancialOverrideField
              id="fin-prize"
              label="Prêmio produção"
              field={financialForm.prizeAmount}
              computedValue={financialSummary.prizeAmount}
              onChange={(next) => setFinancialForm((prev) => ({ ...prev, prizeAmount: next }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsFinancialDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveFinancialOverrides}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatRow({ label, value, edited }: { label: string; value: string; edited?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">
        {label}
        {edited && (
          <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary align-middle">
            editado
          </span>
        )}
      </span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

// Uma linha do card "Comparação com o ciclo anterior": rótulo + valor do
// ciclo atual + valor do ciclo anterior lado a lado. `trend` é opcional —
// quando informado, mostra uma seta indicando se o número atual está
// acima (▲) ou abaixo (▼) do anterior.
function CompareRow({
  label,
  current,
  previous,
  trend,
}: {
  label: string;
  current: string;
  previous: string;
  trend?: number;
}) {
  return (
    <>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-semibold">
        {current}
        {trend !== undefined && Math.abs(trend) > 0.001 && (
          <span className={trend > 0 ? "ml-1 text-success" : "ml-1 text-destructive"}>
            {trend > 0 ? "▲" : "▼"}
          </span>
        )}
      </span>
      <span className="text-right text-sm text-muted-foreground">{previous}</span>
    </>
  );
}

// Uma linha do diálogo "Editar resumo financeiro": checkbox liga/desliga o
// modo manual daquele valor; o input só fica editável quando ligado. Sem
// marcar, mostra o valor calculado automaticamente como referência.
function FinancialOverrideField({
  id,
  label,
  field,
  computedValue,
  onChange,
}: {
  id: string;
  label: string;
  field: { manual: boolean; value: string };
  computedValue: number;
  onChange: (next: { manual: boolean; value: string }) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        className="mt-7"
        checked={field.manual}
        onCheckedChange={(checked) => onChange({ manual: Boolean(checked), value: field.value })}
        aria-label={`Editar ${label} manualmente`}
      />
      <div className="flex flex-1 flex-col gap-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input
          id={id}
          type="number"
          step="0.01"
          disabled={!field.manual}
          value={field.value}
          onChange={(e) => onChange({ manual: field.manual, value: e.target.value })}
        />
        <p className="text-xs text-muted-foreground">
          {field.manual
            ? "Valor manual — não muda sozinho até você desmarcar."
            : `Automático: ${computedValue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`}
        </p>
      </div>
    </div>
  );
}

type IndicatorLevel = "success" | "warning" | "danger";

function IndicatorIcon({ level }: { level: IndicatorLevel }) {
  if (level === "success") return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />;
  if (level === "warning") return <Info className="mt-0.5 size-4 shrink-0 text-warning" />;
  return <Ban className="mt-0.5 size-4 shrink-0 text-destructive" />;
}

// Gera as mensagens automáticas do Card 6, a partir do estado atual de
// produção/categoria/prêmio. Quando nenhuma categoria foi atingida, aponta
// especificamente qual critério falta em cada categoria candidata (BA/BD%,
// média mínima própria de cada uma, efetividade), em vez de uma mensagem
// genérica única.
function buildIndicators({
  production,
  category,
  weightedDays,
  prizeAmount,
  effectivenessPercent,
}: {
  production: ReturnType<typeof computeProductionSummary>;
  category: ReturnType<typeof computeCategory>;
  weightedDays: number;
  prizeAmount: number;
  effectivenessPercent: number;
}): { level: IndicatorLevel; text: string }[] {
  const messages: { level: IndicatorLevel; text: string }[] = [];
  const avg = formatNumber(production.average, 1);

  if (category !== "sem_categoria") {
    messages.push({ level: "success", text: "Você já atingiu os requisitos para receber o prêmio." });
    messages.push({
      level: "success",
      text: `Mantendo esse ritmo, sua estimativa de prêmio será de ${formatCurrency(prizeAmount)}.`,
    });
    return messages;
  }

  if (production.total === 0) {
    messages.push({
      level: "warning",
      text: "Lance suas atividades (BA/BD) para começar a acompanhar categoria e prêmio deste ciclo.",
    });
    return messages;
  }

  // Instalador: BA >= 69% e média >= 3/dia.
  if (production.baPercent >= 69) {
    if (production.average < 3) {
      messages.push({
        level: "warning",
        text: `Sua média atual é ${avg} atividades por dia. Você precisa atingir 3,0 para se qualificar como Instalador.`,
      });
    }
  } else {
    // Quantas BA faltam para chegar a 69% do total, mantendo o total atual.
    const baNeeded = Math.max(0, Math.ceil((0.69 * production.total - production.ba) / 0.31));
    if (baNeeded > 0 && baNeeded <= 30) {
      messages.push({ level: "success", text: `Faltam ${baNeeded} BA para atingir a categoria Instalador.` });
    }
  }

  // Reparador: BD >= 70%, média >= 4/dia e efetividade > 80%.
  if (production.bdPercent >= 70) {
    if (production.average < 4) {
      messages.push({
        level: "warning",
        text: `Sua média atual é ${avg} atividades por dia. Você precisa atingir 4,0 para se qualificar como Reparador.`,
      });
    } else if (effectivenessPercent <= 80) {
      messages.push({
        level: "warning",
        text: `Sua efetividade está em ${formatNumber(effectivenessPercent, 1)}%. Você precisa de mais de 80% para se qualificar como Reparador.`,
      });
    }
  }

  // Mix: só é uma opção real quando nem Instalador nem Reparador estão no
  // alcance pelo percentual (BA < 69% e BD < 70%).
  if (production.baPercent < 69 && production.bdPercent < 70 && production.average < 3.5) {
    const activitiesNeeded = Math.max(0, Math.ceil((3.5 - production.average) * weightedDays));
    messages.push({
      level: "warning",
      text: `Sua média atual é ${avg} atividades por dia. Faça mais ${activitiesNeeded || 1} atividade(s) para atingir a meta de 3,5 (categoria Mix).`,
    });
  }

  if (messages.length === 0) {
    messages.push({
      level: "danger",
      text: "Nenhuma categoria atingida ainda — sem categoria, não há premiação neste ciclo.",
    });
  }

  return messages;
}
