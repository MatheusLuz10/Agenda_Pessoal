import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Award,
  Ban,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  History,
  Info,
  Lightbulb,
  ListChecks,
  Minus,
  Plus,
  Settings,
  TrendingUp,
  Trash2,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useOperation } from "@/contexts/OperationContext";
import { addDays, formatDateBR, todayISO } from "@/lib/date";
import {
  CATEGORY_LABEL,
  computeCategory,
  computeCycleSummary,
  computePrizeAmount,
  computeProductionSummary,
  getCurrentCycleRange,
  getCycleForDate,
  getPreviousCycleRange,
  isWithinRange,
} from "@/lib/operation";
import type { ActivityType, OperationActivity, OperationSettings } from "@/types";

function formatNumber(value: number, decimals = 1): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function OperationsPage() {
  const {
    activities,
    settings,
    addActivity,
    updateActivity,
    deleteActivity,
    updateSettings,
  } = useOperation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formType, setFormType] = useState<ActivityType>("BA");
  const [formDate, setFormDate] = useState(todayISO());
  const [formQuantity, setFormQuantity] = useState("1");
  const [formDescription, setFormDescription] = useState("");
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
  // de qualquer ciclo, não só o corrente. Agrupada por CICLO (janela de
  // 10 dias, ver getCycleForDate), não por mês: o ciclo aberto (o mesmo
  // que os cards de resumo usam) fica solto na lista; todo ciclo já
  // encerrado entra na categoria "Ciclos encerrados", cada um com seu
  // próprio bloco recolhível — assim não vira uma lista infinita.
  const { currentCycleActivities, closedCycleGroups } = useMemo(() => {
    const sorted = [...activities].sort((a, b) => b.date.localeCompare(a.date));
    const current: OperationActivity[] = [];
    const closedByCycle = new Map<string, { start: string; end: string; items: OperationActivity[] }>();

    for (const activity of sorted) {
      const activityCycle = getCycleForDate(new Date(`${activity.date}T00:00:00`));
      if (activityCycle.start === cycle.start) {
        current.push(activity);
      } else {
        const group = closedByCycle.get(activityCycle.start) ?? { ...activityCycle, items: [] };
        group.items.push(activity);
        closedByCycle.set(activityCycle.start, group);
      }
    }

    const groups = [...closedByCycle.values()].sort((a, b) => b.start.localeCompare(a.start));
    return { currentCycleActivities: current, closedCycleGroups: groups };
  }, [activities, cycle]);

  const [isActivitiesListOpen, setIsActivitiesListOpen] = useState(false);
  const [isClosedCyclesOpen, setIsClosedCyclesOpen] = useState(false);
  const [openCycleGroups, setOpenCycleGroups] = useState<Set<string>>(new Set());

  function toggleCycleGroup(key: string) {
    setOpenCycleGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Cada card da tela fica recolhido por padrão — clique no título expande.
  const [isCycleCardOpen, setIsCycleCardOpen] = useState(false);
  const [isProductionCardOpen, setIsProductionCardOpen] = useState(false);
  const [isCategoryCardOpen, setIsCategoryCardOpen] = useState(false);
  const [isPrizeCardOpen, setIsPrizeCardOpen] = useState(false);
  const [isComparisonCardOpen, setIsComparisonCardOpen] = useState(false);
  const [isIndicatorsCardOpen, setIsIndicatorsCardOpen] = useState(false);

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
    setFormDescription("");
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
    setFormDescription(activity.description ?? "");
    setIsDialogOpen(true);
  }

  function handleSave() {
    const quantity = Number(formQuantity);
    if (!quantity || quantity <= 0) return;
    const description = formDescription.trim() || undefined;

    if (editingId) {
      // Editar é uma ação pontual: salva e fecha.
      updateActivity(editingId, { type: formType, date: formDate, quantity, description });
      setIsDialogOpen(false);
      resetForm();
    } else {
      // Lançar fica aberto — o técnico costuma lançar várias BA/BD de
      // uma vez só no fim do dia. Mantém tipo e data, só reseta
      // quantidade/descrição pro próximo lançamento; só fecha quando ele
      // mandar.
      addActivity({ type: formType, date: formDate, quantity, description });
      setSessionAdded((prev) => ({ ...prev, [formType]: prev[formType] + quantity }));
      // A data dos botões rápidos (+1 BA/+1 BD) acompanha a última data
      // lançada, seja pelo diálogo ou por eles mesmos — assim quem lança
      // um dia atrasado aqui continua no mesmo dia ao usar o atalho.
      setQuickDate(formDate);
      setFormQuantity("1");
      setFormDescription("");
    }
  }

  function handleDelete(activityId: string) {
    if (!window.confirm("Excluir esta atividade?")) return;
    deleteActivity(activityId);
  }

  // Atalho pro caso comum: 1 atividade na data escolhida, sem abrir o
  // diálogo. `quickDate` começa em hoje, mas depois passa a acompanhar a
  // última data lançada (por ele mesmo ou pelo diálogo "Lançar
  // atividade", ver handleSave) — continua editável a qualquer momento
  // pelo campo de data, pra quem quiser lançar num dia diferente.
  // `quickFeedback` só dá uma confirmação visual rápida (some sozinho) —
  // não precisa persistir em lugar nenhum.
  const [quickDate, setQuickDate] = useState(todayISO());
  const [quickFeedback, setQuickFeedback] = useState<{ type: ActivityType; date: string; key: number } | null>(null);

  useEffect(() => {
    if (!quickFeedback) return;
    const timeout = setTimeout(() => setQuickFeedback(null), 2000);
    return () => clearTimeout(timeout);
  }, [quickFeedback]);

  function quickAddActivity(type: ActivityType) {
    addActivity({ type, date: quickDate, quantity: 1 });
    setQuickFeedback({ type, date: quickDate, key: Date.now() });
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Operação</h1>
          <p className="text-sm text-muted-foreground">
            Produtividade, categoria e estimativa de remuneração do ciclo atual.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            onClick={() => setQuickDate((prev) => addDays(prev, -1))}
            aria-label="Dia anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Input
            type="date"
            value={quickDate}
            onChange={(e) => setQuickDate(e.target.value)}
            className="w-auto"
            aria-label="Data para lançamento rápido"
          />
          <Button
            size="icon"
            variant="outline"
            onClick={() => setQuickDate((prev) => addDays(prev, 1))}
            aria-label="Próximo dia"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => quickAddActivity("BA")} className="gap-1.5">
            <Plus className="size-4" />
            BA
          </Button>
          <Button size="sm" variant="outline" onClick={() => quickAddActivity("BD")} className="gap-1.5">
            <Plus className="size-4" />
            BD
          </Button>
          <Button size="sm" onClick={openCreateDialog} className="gap-1.5">
            <Plus className="size-4" />
            Lançar atividade
          </Button>
        </div>
      </div>

      {quickFeedback && (
        <div
          key={quickFeedback.key}
          className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm text-success"
        >
          <CheckCircle2 className="size-4 shrink-0" />
          <span>+1 {quickFeedback.type} lançado em {formatDateBR(quickFeedback.date)}.</span>
        </div>
      )}

      {/* Todas as atividades (de qualquer ciclo): fica recolhida, só com a
          contagem — clique expande pra ver/editar/excluir qualquer uma, não
          só as do ciclo atual. Enquanto o ciclo (janela de 10 dias) está
          aberto, cada atividade aparece solta na lista; todo ciclo já
          encerrado entra na categoria "Ciclos encerrados", agrupado por
          ciclo (não por mês — um mês tem 3 ciclos). */}
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
              {activities.length}
            </span>
          </span>
          {isActivitiesListOpen ? (
            <ChevronUp className="size-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="size-4 text-muted-foreground" />
          )}
        </button>
        {isActivitiesListOpen && (
          <CardContent className="flex max-h-96 flex-col gap-3 overflow-y-auto pt-0">
            {activities.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                Nenhuma atividade lançada ainda.
              </p>
            ) : (
              <>
                {currentCycleActivities.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nenhuma atividade lançada neste ciclo ainda.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {currentCycleActivities.map((activity) => (
                      <ActivityRow
                        key={activity.id}
                        activity={activity}
                        cycle={cycle}
                        onEdit={() => openEditDialog(activity)}
                        onDelete={() => handleDelete(activity.id)}
                      />
                    ))}
                  </div>
                )}

                {closedCycleGroups.length > 0 && (
                  <div className="mt-1 flex flex-col gap-2 border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => setIsClosedCyclesOpen((prev) => !prev)}
                      className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-left text-sm font-medium"
                      aria-expanded={isClosedCyclesOpen}
                    >
                      Ciclos encerrados
                      <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                        {closedCycleGroups.reduce((sum, group) => sum + group.items.length, 0)}
                        {isClosedCyclesOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                      </span>
                    </button>
                    {isClosedCyclesOpen && (
                      <div className="flex flex-col gap-2 pl-1">
                        {closedCycleGroups.map((group) => {
                          const isOpen = openCycleGroups.has(group.start);
                          return (
                            <div key={group.start} className="flex flex-col gap-2">
                              <button
                                type="button"
                                onClick={() => toggleCycleGroup(group.start)}
                                className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-left text-sm font-medium"
                                aria-expanded={isOpen}
                              >
                                {formatDateBR(group.start)} – {formatDateBR(group.end)}
                                <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                                  {group.items.length}
                                  {isOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                                </span>
                              </button>
                              {isOpen && (
                                <div className="flex flex-col gap-2 pl-1">
                                  {group.items.map((activity) => (
                                    <ActivityRow
                                      key={activity.id}
                                      activity={activity}
                                      cycle={cycle}
                                      onEdit={() => openEditDialog(activity)}
                                      onDelete={() => handleDelete(activity.id)}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        )}
      </Card>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {/* Card 1 – Resumo do Ciclo */}
        <CollapsibleCard
          icon={Calendar}
          title="Resumo do ciclo"
          open={isCycleCardOpen}
          onToggle={() => setIsCycleCardOpen((prev) => !prev)}
        >
          <div className="flex flex-col gap-3">
            <StatRow label="Ciclo atual" value={`${formatDateBR(cycle.start)} – ${formatDateBR(cycle.end)}`} />
            <StatRow label="Dias trabalhados" value={String(cycleSummary.daysWorked)} />
            <StatRow label="Dias ponderados" value={formatNumber(cycleSummary.weightedDays, 2)} />
            <p className="text-xs text-muted-foreground">
              3 ciclos por mês (1-10, 11-20, 21-fim). Peso por dia: seg-sex = 1,0 · sábado = 0,85 · domingo = 0,15.
            </p>
          </div>
        </CollapsibleCard>

        {/* Card 2 – Produção */}
        <CollapsibleCard
          icon={Wrench}
          title="Produção"
          open={isProductionCardOpen}
          onToggle={() => setIsProductionCardOpen((prev) => !prev)}
        >
          <div className="flex flex-col gap-3">
            <StatRow label="BA (Instalações)" value={String(production.ba)} />
            <StatRow label="BD (Reparos)" value={String(production.bd)} />
            <StatRow label="Total de atividades" value={String(production.total)} />
            <StatRow label="% BA" value={`${formatNumber(production.baPercent)}%`} />
            <StatRow label="% BD" value={`${formatNumber(production.bdPercent)}%`} />
            <StatRow label="Média diária" value={formatNumber(production.average, 2)} />
          </div>
        </CollapsibleCard>

        {/* Card 3 – Categoria */}
        <CollapsibleCard
          icon={ListChecks}
          title="Categoria"
          open={isCategoryCardOpen}
          onToggle={() => setIsCategoryCardOpen((prev) => !prev)}
          headerAction={
            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={openAdjustDialog}
              aria-label="Ajustar efetividade"
            >
              <Settings className="size-4" />
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
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
          </div>
        </CollapsibleCard>

        {/* Card 4 – Prêmio Estimado */}
        <CollapsibleCard
          icon={TrendingUp}
          title="Prêmio estimado"
          open={isPrizeCardOpen}
          onToggle={() => setIsPrizeCardOpen((prev) => !prev)}
        >
          <div className="flex flex-col gap-3">
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
          </div>
        </CollapsibleCard>
      </div>

      {/* Comparação com o ciclo anterior */}
      <CollapsibleCard
        icon={History}
        title="Comparação com o ciclo anterior"
        open={isComparisonCardOpen}
        onToggle={() => setIsComparisonCardOpen((prev) => !prev)}
      >
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
      </CollapsibleCard>

      {/* Card 6 – Indicadores Inteligentes */}
      <CollapsibleCard
        icon={Lightbulb}
        title="Indicadores inteligentes"
        open={isIndicatorsCardOpen}
        onToggle={() => setIsIndicatorsCardOpen((prev) => !prev)}
      >
        <div className="flex flex-col gap-2">
          {indicators.map((indicator, index) => (
            <div key={index} className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm">
              <IndicatorIcon level={indicator.level} />
              <span>{indicator.text}</span>
            </div>
          ))}
        </div>
      </CollapsibleCard>

      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar atividade" : "Lançar atividade"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Tipo</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={formType === "BA" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setFormType("BA")}
                >
                  BA (Instalação)
                </Button>
                <Button
                  type="button"
                  variant={formType === "BD" ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setFormType("BD")}
                >
                  BD (Reparo)
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="activity-date">Data</Label>
                <Input id="activity-date" type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="activity-quantity">Quantidade</Label>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setFormQuantity(String(Math.max(1, Number(formQuantity || "1") - 1)))}
                    aria-label="Diminuir quantidade"
                  >
                    <Minus className="size-4" />
                  </Button>
                  <Input
                    id="activity-quantity"
                    type="number"
                    min={1}
                    className="text-center"
                    value={formQuantity}
                    onChange={(e) => setFormQuantity(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                    onClick={() => setFormQuantity(String(Number(formQuantity || "0") + 1))}
                    aria-label="Aumentar quantidade"
                  >
                    <Plus className="size-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="activity-description">Descrição</Label>
              <Textarea
                id="activity-description"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Ex: cliente, endereço ou detalhes do atendimento"
              />
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

    </div>
  );
}

// Uma linha da lista "Todas as atividades" (usada tanto para as do mês
// corrente quanto dentro de um grupo de mês fechado).
function ActivityRow({
  activity,
  cycle,
  onEdit,
  onDelete,
}: {
  activity: OperationActivity;
  cycle: { start: string; end: string };
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
      <div className="flex flex-col gap-1">
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
        {activity.description && <p className="text-sm text-muted-foreground">{activity.description}</p>}
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onEdit}>
          Editar
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          aria-label="Excluir atividade"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

// Card recolhível: fica só com o título visível por padrão, clique
// expande o conteúdo. `headerAction`, quando informado (ex: botão de
// ajuste no cabeçalho), continua acessível mesmo com o card fechado.
function CollapsibleCard({
  icon: Icon,
  title,
  headerAction,
  open,
  onToggle,
  children,
}: {
  icon: LucideIcon;
  title: string;
  headerAction?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 p-5">
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center gap-2 text-left font-semibold leading-none"
          aria-expanded={open}
        >
          <Icon className="size-4 shrink-0" />
          {title}
          {open ? (
            <ChevronUp className="ml-auto size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" />
          )}
        </button>
        {headerAction}
      </div>
      {open && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
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
