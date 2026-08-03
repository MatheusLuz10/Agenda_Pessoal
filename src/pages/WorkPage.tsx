import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BriefcaseBusiness,
  Building2,
  CarFront,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  FileStack,
  FileText,
  Gauge,
  Info,
  Inbox,
  PackageCheck,
  Plus,
  RefreshCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { formatDateBR, nowInBrasilia, todayISO } from "@/lib/date";
import { useWork } from "@/contexts/WorkContext";
import type { EquipmentCondition, EquipmentItem } from "@/types";
import { jsPDF } from "jspdf";

type EquipmentSection = "manutencao" | "epis" | "controle";
type ReportConditionFilter = "todos" | "Bom" | "Defeituoso";

function categoryLabel(category: "manutencao" | "epis"): string {
  return category === "epis" ? "EPIs" : "Manutenção do carro";
}

const sectionConfig: Record<Exclude<EquipmentSection, "controle">, { label: string; icon: typeof CarFront }> = {
  manutencao: {
    label: "Manutenção do carro",
    icon: CarFront,
  },
  epis: {
    label: "Ferramentas (EPIs)",
    icon: ShieldCheck,
  },
};

// Datas relativas a hoje, usadas como padrão para os nomes dos arquivos de
// relatório baixados.
function relativeISO(offsetDays: number): string {
  const date = nowInBrasilia();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function WorkPage() {
  const navigate = useNavigate();
  const {
    equipmentItems: items,
    equipmentReplacements,
    addEquipmentItem,
    updateEquipmentItem,
    deleteEquipmentItem,
    addEquipmentReplacement,
    deleteEquipmentReplacement,
  } = useWork();
  const [activeSection, setActiveSection] = useState<EquipmentSection>("manutencao");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState<"manutencao" | "epis">("manutencao");
  const [formCondition, setFormCondition] = useState<EquipmentCondition>("Bom");
  const [formObservation, setFormObservation] = useState("");
  const [reportConditionFilter, setReportConditionFilter] = useState<ReportConditionFilter>("todos");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllItems, setShowAllItems] = useState(false);
  const [isTextReportOpen, setIsTextReportOpen] = useState(false);
  const [textReportContent, setTextReportContent] = useState("");
  const [textReportCopied, setTextReportCopied] = useState(false);
  const [isItemsListOpen, setIsItemsListOpen] = useState(false);
  const [isReplacementsListOpen, setIsReplacementsListOpen] = useState(false);
  const [isReplaceDialogOpen, setIsReplaceDialogOpen] = useState(false);
  const [replacingItem, setReplacingItem] = useState<EquipmentItem | null>(null);
  const [replaceObservation, setReplaceObservation] = useState("");
  const VISIBLE_ITEMS_LIMIT = 3;

  const defectiveItems = items.filter((item) => item.condition === "Defeituoso");

  function resetForm(category: "manutencao" | "epis" = "manutencao") {
    setFormName("");
    setFormCategory(category);
    setFormCondition("Bom");
    setFormObservation("");
    setEditingId(null);
  }

  function openCreateDialog(category?: "manutencao" | "epis") {
    const nextCategory = category ?? (activeSection === "controle" ? "epis" : activeSection);
    resetForm(nextCategory);
    setIsDialogOpen(true);
  }

  function openEditDialog(item: EquipmentItem) {
    setEditingId(item.id);
    setFormName(item.name);
    setFormCategory(item.category === "epis" ? "epis" : "manutencao");
    setFormCondition(item.condition);
    setFormObservation(item.observation);
    setIsDialogOpen(true);
  }

  function handleSave() {
    if (!formName.trim()) return;

    const payload: Omit<EquipmentItem, "id" | "createdAt"> = {
      name: formName.trim(),
      category: formCategory,
      condition: formCondition,
      observation: formObservation.trim(),
    };

    if (editingId) {
      updateEquipmentItem(editingId, payload);
    } else {
      addEquipmentItem(payload);
    }

    setIsDialogOpen(false);
    resetForm();
  }

  function selectSection(section: EquipmentSection) {
    setActiveSection(section);
    setSearchQuery("");
    setShowAllItems(false);
    setIsItemsListOpen(false);
  }

  function handleDeleteItem(itemId: string) {
    if (!window.confirm("Excluir este item?")) return;
    deleteEquipmentItem(itemId);
  }

  function openReplaceDialog(item: EquipmentItem) {
    setReplacingItem(item);
    setReplaceObservation("");
    setIsReplaceDialogOpen(true);
  }

  // Registra a troca (entra no relatório de defeitos) e já volta a
  // condição do item pra "Bom" — a peça defeituosa saiu de circulação.
  function handleConfirmReplace() {
    if (!replacingItem) return;
    addEquipmentReplacement({
      itemId: replacingItem.id,
      itemName: replacingItem.name,
      category: replacingItem.category,
      observation: replaceObservation.trim(),
      replacedAt: todayISO(),
    });
    updateEquipmentItem(replacingItem.id, {
      name: replacingItem.name,
      category: replacingItem.category,
      condition: "Bom",
      observation: replacingItem.observation,
    });
    setIsReplaceDialogOpen(false);
    setReplacingItem(null);
  }

  function handleDeleteReplacement(replacementId: string) {
    if (!window.confirm("Excluir este registro de troca?")) return;
    deleteEquipmentReplacement(replacementId);
  }

  function handleDownloadCategoryReportPdf(category: "manutencao" | "epis") {
    const categoryItems = items
      .filter((item) => item.category === category)
      .filter(
        (item) => category === "manutencao" || reportConditionFilter === "todos" || item.condition === reportConditionFilter
      );

    const filterLabel =
      reportConditionFilter === "todos" ? "Todos" : reportConditionFilter === "Bom" ? "Bom" : "Defeituoso";

    const doc = new jsPDF();
    const marginX = 14;
    let cursorY = 18;

    doc.setFontSize(16);
    doc.text(`Relatório de ${categoryLabel(category).toLowerCase()}`, marginX, cursorY);
    cursorY += 8;

    doc.setFontSize(10);
    if (category !== "manutencao") {
      doc.text(`Filtro de condição: ${filterLabel}`, marginX, cursorY);
      cursorY += 6;
    }
    doc.text(`Gerado em: ${nowInBrasilia().toLocaleString("pt-BR")}`, marginX, cursorY);
    cursorY += 6;
    doc.text(`Total de itens: ${categoryItems.length}`, marginX, cursorY);
    cursorY += 10;

    doc.setFontSize(11);
    if (categoryItems.length === 0) {
      doc.text("Nenhum item encontrado para este filtro.", marginX, cursorY);
    } else {
      categoryItems.forEach((item) => {
        if (cursorY > 280) {
          doc.addPage();
          cursorY = 18;
        }
        doc.setFont("helvetica", "bold");
        doc.text(category === "manutencao" ? item.name : `${item.name} (${item.condition})`, marginX, cursorY);
        cursorY += 6;
        doc.setFont("helvetica", "normal");
        const observationLines = doc.splitTextToSize(item.observation || "Sem observação.", 180);
        doc.text(observationLines, marginX, cursorY);
        cursorY += observationLines.length * 6 + 4;
      });
    }

    doc.save(`relatorio-${category}-${relativeISO(0)}.pdf`);
  }

  // Mesmo conteúdo do PDF, mas como texto puro — para o técnico copiar e
  // colar direto numa conversa (ex: enviar o relatório pro supervisor no
  // WhatsApp) sem precisar baixar/anexar um arquivo.
  function buildCategoryReportText(category: "manutencao" | "epis"): string {
    const categoryItems = items
      .filter((item) => item.category === category)
      .filter(
        (item) => category === "manutencao" || reportConditionFilter === "todos" || item.condition === reportConditionFilter
      );

    const filterLabel =
      reportConditionFilter === "todos" ? "Todos" : reportConditionFilter === "Bom" ? "Bom" : "Defeituoso";

    const lines: string[] = [`Relatório de ${categoryLabel(category).toLowerCase()}`];
    if (category !== "manutencao") {
      lines.push(`Filtro de condição: ${filterLabel}`);
    }
    lines.push(`Gerado em: ${nowInBrasilia().toLocaleString("pt-BR")}`);
    lines.push(`Total de itens: ${categoryItems.length}`);
    lines.push("");

    if (categoryItems.length === 0) {
      lines.push("Nenhum item encontrado para este filtro.");
    } else {
      categoryItems.forEach((item) => {
        lines.push(category === "manutencao" ? item.name : `${item.name} (${item.condition})`);
        lines.push(item.observation || "Sem observação.");
        lines.push("");
      });
    }

    return lines.join("\n").trim();
  }

  function openTextReport(category: "manutencao" | "epis") {
    setTextReportContent(buildCategoryReportText(category));
    setTextReportCopied(false);
    setIsTextReportOpen(true);
  }

  async function copyTextReport() {
    await navigator.clipboard.writeText(textReportContent);
    setTextReportCopied(true);
    setTimeout(() => setTextReportCopied(false), 2000);
  }

  function handleDownloadDefectsPdf() {
    const doc = new jsPDF();
    const marginX = 14;
    let cursorY = 18;

    doc.setFontSize(16);
    doc.text("Relatório de ferramentas com defeito", marginX, cursorY);
    cursorY += 8;

    doc.setFontSize(10);
    doc.text(`Gerado em: ${nowInBrasilia().toLocaleString("pt-BR")}`, marginX, cursorY);
    cursorY += 6;
    doc.text(`Total de itens: ${defectiveItems.length}`, marginX, cursorY);
    cursorY += 10;

    if (defectiveItems.length === 0) {
      doc.setFontSize(11);
      doc.text("Nenhuma ferramenta com defeito registrada no momento.", marginX, cursorY);
    } else {
      doc.setFontSize(11);
      defectiveItems.forEach((item) => {
        if (cursorY > 280) {
          doc.addPage();
          cursorY = 18;
        }
        doc.setFont("helvetica", "bold");
        doc.text(`${item.name} (${categoryLabel(item.category === "epis" ? "epis" : "manutencao")})`, marginX, cursorY);
        cursorY += 6;
        doc.setFont("helvetica", "normal");
        const observationLines = doc.splitTextToSize(item.observation || "Sem observação adicional.", 180);
        doc.text(observationLines, marginX, cursorY);
        cursorY += observationLines.length * 6 + 4;
      });
    }

    if (equipmentReplacements.length > 0) {
      if (cursorY > 260) {
        doc.addPage();
        cursorY = 18;
      }
      cursorY += 4;
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text("Itens substituídos", marginX, cursorY);
      cursorY += 8;

      doc.setFontSize(11);
      equipmentReplacements.forEach((replacement) => {
        if (cursorY > 280) {
          doc.addPage();
          cursorY = 18;
        }
        doc.setFont("helvetica", "bold");
        doc.text(
          `${replacement.itemName} (${categoryLabel(replacement.category === "epis" ? "epis" : "manutencao")}) — trocado em ${formatDateBR(replacement.replacedAt)}`,
          marginX,
          cursorY
        );
        cursorY += 6;
        doc.setFont("helvetica", "normal");
        const observationLines = doc.splitTextToSize(replacement.observation || "Sem observação adicional.", 180);
        doc.text(observationLines, marginX, cursorY);
        cursorY += observationLines.length * 6 + 4;
      });
    }

    doc.save(`relatorio-defeitos-${relativeISO(0)}.pdf`);
  }

  const sectionTitle = activeSection === "controle" ? "Controle" : sectionConfig[activeSection].label;

  const visibleItems =
    activeSection === "controle" ? defectiveItems : items.filter((item) => item.category === activeSection);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredItems = normalizedQuery
    ? visibleItems.filter(
        (item) =>
          item.name.toLowerCase().includes(normalizedQuery) ||
          item.observation.toLowerCase().includes(normalizedQuery)
      )
    : visibleItems;

  // Lista de manutenção/EPIs fica curta por padrão (não durante uma busca,
  // onde faz sentido ver todos os resultados) — "Ver mais" revela o resto.
  const canCollapseList = activeSection !== "controle" && !normalizedQuery;
  const displayedItems =
    canCollapseList && !showAllItems ? filteredItems.slice(0, VISIBLE_ITEMS_LIMIT) : filteredItems;
  const hiddenItemsCount = canCollapseList ? Math.max(0, filteredItems.length - VISIBLE_ITEMS_LIMIT) : 0;
  // Digitar uma busca já abre a lista sozinha — esconder os resultados
  // que o técnico acabou de procurar seria confuso.
  const shouldShowItemsList = isItemsListOpen || normalizedQuery.length > 0;

  const createActionLabel =
    activeSection === "manutencao" ? "Adicionar informações" : "Adicionar equipamento";

  const formActionLabel =
    formCategory === "manutencao" ? "Adicionar informações" : "Adicionar equipamento";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meu trabalho</h1>
        <p className="text-sm text-muted-foreground">
          Centralize manutenção e ferramentas (EPIs).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[
          { key: "manutencao", label: "Manutenção do carro", count: items.filter((item) => item.category === "manutencao").length },
          { key: "epis", label: "Ferramentas (EPIs)", count: items.filter((item) => item.category === "epis").length },
        ].map((option) => {
          const Icon = option.key === "manutencao" ? CarFront : ShieldCheck;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => selectSection(option.key as EquipmentSection)}
              className={`rounded-xl border p-4 text-left transition-colors ${
                activeSection === option.key
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{option.label}</p>
                  <p className="text-2xl font-semibold">{option.count}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              {activeSection === "controle" ? (
                <AlertTriangle className="size-4" />
              ) : activeSection === "manutencao" ? (
                <CarFront className="size-4" />
              ) : (
                <ShieldCheck className="size-4" />
              )}
              {sectionTitle}
            </CardTitle>
            {activeSection !== "controle" && (
              <Button size="sm" onClick={() => openCreateDialog()} className="gap-1.5">
                <Plus className="size-4" />
                {createActionLabel}
              </Button>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Bloco informativo: só aparece no Controle, onde explica um
                comportamento não óbvio (itens entram sozinhos aqui). Nas
                seções Manutenção/EPIs não há nada de fato necessário a
                explicar, então não tem esse bloco. */}
            {activeSection === "controle" && (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0" />
                <span>
                  Itens marcados como "Defeituoso" aparecem aqui automaticamente — não é preciso adicionar nada
                  nesta tela.
                </span>
              </div>
            )}

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome ou observação..."
                className="pl-9"
              />
            </div>

            {activeSection === "controle" ? (
              <div className="flex flex-col gap-3">
                {defectiveItems.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
                    <Inbox className="size-6" />
                    <p className="text-sm">Nenhum item com defeito foi registrado.</p>
                  </div>
                ) : filteredItems.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    Nenhum item encontrado para "{searchQuery}".
                  </p>
                ) : (
                  filteredItems.map((item) => (
                    <div key={item.id} className="rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{item.name}</p>
                        <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs text-destructive">
                          {item.condition}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.observation}</p>
                      <div className="mt-2 flex justify-end">
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openReplaceDialog(item)}>
                          <RefreshCcw className="size-3.5" />
                          Registrar troca
                        </Button>
                      </div>
                    </div>
                  ))
                )}

                {equipmentReplacements.length > 0 && (
                  <div className="flex flex-col gap-2 border-t border-border pt-3">
                    <button
                      type="button"
                      onClick={() => setIsReplacementsListOpen((prev) => !prev)}
                      className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-left text-sm font-medium"
                      aria-expanded={isReplacementsListOpen}
                    >
                      Itens substituídos
                      <span className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                        {equipmentReplacements.length}
                        {isReplacementsListOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                      </span>
                    </button>
                    {isReplacementsListOpen && (
                      <div className="flex flex-col gap-2">
                        {equipmentReplacements.map((replacement) => (
                          <div
                            key={replacement.id}
                            className="flex items-start justify-between gap-3 rounded-xl border border-border p-3"
                          >
                            <div className="flex flex-col gap-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium">{replacement.itemName}</span>
                                <span className="text-xs text-muted-foreground">
                                  trocado em {formatDateBR(replacement.replacedAt)}
                                </span>
                              </div>
                              {replacement.observation && (
                                <p className="text-sm text-muted-foreground">{replacement.observation}</p>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteReplacement(replacement.id)}
                              aria-label="Excluir registro de troca"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center gap-2 border-t border-border pt-3">
                  <span className="text-xs font-medium text-muted-foreground">Relatório:</span>
                  <Button variant="outline" size="sm" className="gap-2" onClick={handleDownloadDefectsPdf}>
                    <Download className="size-4" />
                    Baixar PDF
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <button
                  type="button"
                  onClick={() => setIsItemsListOpen((open) => !open)}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/40"
                >
                  <span>Itens ({visibleItems.length})</span>
                  {shouldShowItemsList ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                </button>

                {shouldShowItemsList && (
                <div className="flex flex-col gap-3">
                  {visibleItems.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-6 text-center text-muted-foreground">
                      <Inbox className="size-6" />
                      <p className="text-sm">Nenhum item cadastrado nesta categoria ainda.</p>
                      <Button size="sm" variant="outline" onClick={() => openCreateDialog()} className="gap-1.5">
                        <Plus className="size-4" />
                        {createActionLabel}
                      </Button>
                    </div>
                  ) : filteredItems.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                      Nenhum item encontrado para "{searchQuery}".
                    </p>
                  ) : (
                    <>
                      {displayedItems.map((item) => (
                        <div key={item.id} className="rounded-xl border border-border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex flex-col gap-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-medium">{item.name}</p>
                                {activeSection !== "manutencao" && (
                                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{item.condition}</span>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">{item.observation || "Sem observação."}</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEditDialog(item)}>
                                Editar
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8 text-muted-foreground hover:text-destructive"
                                onClick={() => handleDeleteItem(item.id)}
                                aria-label="Excluir item"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {hiddenItemsCount > 0 && !showAllItems && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 self-start text-muted-foreground"
                          onClick={() => setShowAllItems(true)}
                        >
                          <ChevronDown className="size-4" />
                          Ver mais {hiddenItemsCount}
                        </Button>
                      )}
                      {canCollapseList && showAllItems && filteredItems.length > VISIBLE_ITEMS_LIMIT && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5 self-start text-muted-foreground"
                          onClick={() => setShowAllItems(false)}
                        >
                          <ChevronUp className="size-4" />
                          Ver menos
                        </Button>
                      )}
                    </>
                  )}
                </div>
                )}

                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <span className="text-xs font-medium text-muted-foreground">Relatório:</span>
                  {activeSection === "epis" && (
                    <Select
                      value={reportConditionFilter}
                      onValueChange={(value) => setReportConditionFilter(value as ReportConditionFilter)}
                    >
                      <SelectTrigger className="h-8 w-[120px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        <SelectItem value="Bom">Bom</SelectItem>
                        <SelectItem value="Defeituoso">Defeituoso</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openTextReport(activeSection)}
                    className="gap-1.5"
                  >
                    <Copy className="size-4" />
                    Gerar relatório
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDownloadCategoryReportPdf(activeSection)}
                    className="gap-1.5"
                  >
                    <FileText className="size-4" />
                    Baixar PDF
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BriefcaseBusiness className="size-4" />
              Ações rápidas
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button
              variant="outline"
              className="justify-start gap-2"
              onClick={() => selectSection("controle")}
            >
              <AlertTriangle className="size-4" />
              Ver controle de defeitos
            </Button>
            <Button
              variant="outline"
              className="justify-start gap-2"
              onClick={() => window.open("https://otimizza.vercel.app/", "_blank", "noopener,noreferrer")}
            >
              <Building2 className="size-4" />
              Gestão de prédio e CTO
            </Button>
            <Button
              variant="outline"
              className="justify-start gap-2"
              onClick={() => window.open("https://fast.com/pt/", "_blank", "noopener,noreferrer")}
            >
              <Gauge className="size-4" />
              Teste de velocidade
            </Button>
            <Button
              variant="outline"
              className="justify-start gap-2"
              onClick={() =>
                window.open(
                  "https://unic.comfica.com.br/pages/geral/analise_preliminar_risco/",
                  "_blank",
                  "noopener,noreferrer"
                )
              }
            >
              <ShieldAlert className="size-4" />
              Criar APR
            </Button>
            <Button
              variant="outline"
              className="justify-start gap-2"
              onClick={() => window.open("https://forms.office.com/r/Sa9raVnQSd", "_blank", "noopener,noreferrer")}
            >
              <PackageCheck className="size-4" />
              Aprovisionamento / Associação
            </Button>
            <Button
              variant="outline"
              className="justify-start gap-2"
              onClick={() => navigate("/meu-trabalho/ttk")}
            >
              <Wrench className="size-4" />
              Abertura de TTK
            </Button>
            <Button
              variant="outline"
              className="justify-start gap-2"
              onClick={() => navigate("/meu-trabalho/relatorios")}
            >
              <FileStack className="size-4" />
              Relatórios
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar equipamento" : formActionLabel}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="equipment-name">Nome</Label>
              <Input
                id="equipment-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={formCategory === "manutencao" ? "Ex: Troca de óleo" : "Ex: Alicate de pressão"}
              />
            </div>

            <div className={formCategory === "manutencao" ? "flex flex-col gap-1.5" : "grid grid-cols-2 gap-3"}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="equipment-category">Categoria</Label>
                <div
                  id="equipment-category"
                  className="flex h-9 items-center rounded-md border border-input bg-muted/40 px-3 text-sm text-muted-foreground"
                >
                  {categoryLabel(formCategory)}
                </div>
              </div>

              {formCategory !== "manutencao" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="equipment-condition">Condição</Label>
                  <Select value={formCondition} onValueChange={(value) => setFormCondition(value as EquipmentCondition)}>
                    <SelectTrigger id="equipment-condition">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Bom">Bom</SelectItem>
                      <SelectItem value="Médio">Médio</SelectItem>
                      <SelectItem value="Defeituoso">Defeituoso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="equipment-observation">Observação</Label>
              <Textarea
                id="equipment-observation"
                value={formObservation}
                onChange={(e) => setFormObservation(e.target.value)}
                placeholder="Detalhes da condição, manutenção ou uso."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!formName.trim()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isTextReportOpen} onOpenChange={setIsTextReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Relatório em texto</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Textarea value={textReportContent} readOnly rows={14} className="font-mono text-xs" />
            <Button variant="outline" className="w-fit gap-2" onClick={copyTextReport}>
              {textReportCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {textReportCopied ? "Copiado!" : "Copiar texto"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isReplaceDialogOpen}
        onOpenChange={(open) => {
          setIsReplaceDialogOpen(open);
          if (!open) setReplacingItem(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar troca</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              Confirma a troca de <strong>{replacingItem?.name}</strong>? A condição volta para "Bom" e a troca
              passa a aparecer no relatório de defeitos.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="replace-observation">Observação (opcional)</Label>
              <Textarea
                id="replace-observation"
                value={replaceObservation}
                onChange={(e) => setReplaceObservation(e.target.value)}
                placeholder="Ex: número de série do novo item"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsReplaceDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirmReplace}>Confirmar troca</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
