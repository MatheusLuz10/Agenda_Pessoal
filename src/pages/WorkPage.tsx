import { useState } from "react";
import {
  AlertTriangle,
  BriefcaseBusiness,
  CarFront,
  ClipboardList,
  Download,
  FileText,
  Plus,
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
import { nowInBrasilia } from "@/lib/date";

type EquipmentSection = "manutencao" | "epis" | "conectores" | "os" | "controle";
type EquipmentCondition = "Bom" | "Médio" | "Defeituoso";
type ServiceOrderStatus = "pendente" | "em_andamento" | "concluida";

interface EquipmentItem {
  id: string;
  name: string;
  category: Exclude<EquipmentSection, "os" | "controle">;
  condition: EquipmentCondition;
  observation: string;
}

type EquipmentCategory = EquipmentItem["category"];

// Uma OS (Ordem de Serviço): o atendimento feito num cliente/local em
// uma data específica. Diferente dos equipamentos, cada OS tem uma data
// própria — é o que permite calcular "OSs da semana" de verdade, em vez
// de um número fixo.
interface ServiceOrder {
  id: string;
  client: string;
  description: string;
  date: string; // ISO date string (yyyy-MM-dd)
  status: ServiceOrderStatus;
  observation: string;
}

const SERVICE_ORDER_STATUS_LABEL: Record<ServiceOrderStatus, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
};

// Início (segunda) e fim (domingo) da semana atual, mesma lógica usada
// em HomePage para "Próximos Avisos".
function getCurrentWeekRange(): { start: string; end: string } {
  const today = nowInBrasilia();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(today);
  start.setDate(start.getDate() + diff);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const toISO = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { start: toISO(start), end: toISO(end) };
}

const sectionConfig: Record<
  Exclude<EquipmentSection, "controle">,
  { label: string; icon: typeof CarFront; helper: string }
> = {
  manutencao: {
    label: "Manutenção do carro",
    icon: CarFront,
    helper: "Itens usados na manutenção preventiva e corretiva do veículo.",
  },
  epis: {
    label: "Ferramentas (EPIs)",
    icon: ShieldCheck,
    helper: "Equipamentos de proteção e itens essenciais para segurança.",
  },
  conectores: {
    label: "Conectores e fusão",
    icon: Wrench,
    helper: "Ferramentas específicas para conexões, solda e fusão.",
  },
  os: {
    label: "OSs da semana",
    icon: ClipboardList,
    helper: "Resumo rápido da quantidade de ordens de serviço realizadas.",
  },
};

const initialEquipment: EquipmentItem[] = [
  {
    id: "eq-1",
    name: "Multímetro digital",
    category: "epis",
    condition: "Bom",
    observation: "Calibrado na semana passada.",
  },
  {
    id: "eq-2",
    name: "Estação de fusão",
    category: "conectores",
    condition: "Médio",
    observation: "Precisa revisão no cabo de alimentação.",
  },
  {
    id: "eq-3",
    name: "Óleo do motor",
    category: "manutencao",
    condition: "Bom",
    observation: "Reposição feita no último atendimento.",
  },
  {
    id: "eq-4",
    name: "Luva de isolamento",
    category: "epis",
    condition: "Defeituoso",
    observation: "Par de luvas com rasgo na palma.",
  },
];

// Datas relativas a hoje, para os dados de exemplo sempre caírem numa
// mistura de "esta semana" e "fora da semana" independente de quando o
// app for aberto.
function relativeISO(offsetDays: number): string {
  const date = nowInBrasilia();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const initialServiceOrders: ServiceOrder[] = [
  {
    id: "os-1",
    client: "Condomínio Vista Verde",
    description: "Instalação de fibra óptica",
    date: relativeISO(0),
    status: "concluida",
    observation: "",
  },
  {
    id: "os-2",
    client: "Maria Fernandes",
    description: "Troca de roteador",
    date: relativeISO(-1),
    status: "concluida",
    observation: "Cliente relatou queda de sinal intermitente.",
  },
  {
    id: "os-3",
    client: "Padaria Pão Quente",
    description: "Reparo de conector rompido",
    date: relativeISO(-2),
    status: "em_andamento",
    observation: "Aguardando peça de reposição.",
  },
  {
    id: "os-4",
    client: "João Pedro",
    description: "Manutenção preventiva de rede interna",
    date: relativeISO(1),
    status: "pendente",
    observation: "",
  },
  {
    id: "os-5",
    client: "Auto Peças Veloz",
    description: "Instalação de ponto de rede adicional",
    date: relativeISO(-10),
    status: "concluida",
    observation: "OS de referência, fora da semana atual.",
  },
];

export function WorkPage() {
  const [activeSection, setActiveSection] = useState<EquipmentSection>("manutencao");
  const [items, setItems] = useState<EquipmentItem[]>(initialEquipment);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState<EquipmentItem["category"]>("manutencao");
  const [formCondition, setFormCondition] = useState<EquipmentCondition>("Bom");
  const [formObservation, setFormObservation] = useState("");
  const [reportText, setReportText] = useState("");

  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>(initialServiceOrders);
  const [isOsDialogOpen, setIsOsDialogOpen] = useState(false);
  const [editingOsId, setEditingOsId] = useState<string | null>(null);
  const [osClient, setOsClient] = useState("");
  const [osDescription, setOsDescription] = useState("");
  const [osDate, setOsDate] = useState(relativeISO(0));
  const [osStatus, setOsStatus] = useState<ServiceOrderStatus>("pendente");
  const [osObservation, setOsObservation] = useState("");

  const defectiveItems = items.filter((item) => item.condition === "Defeituoso");
  const { start: weekStart, end: weekEnd } = getCurrentWeekRange();
  const serviceOrdersThisWeek = serviceOrders
    .filter((os) => os.date >= weekStart && os.date <= weekEnd)
    .sort((a, b) => a.date.localeCompare(b.date));
  const osThisWeek = serviceOrdersThisWeek.length;

  function resetOsForm() {
    setOsClient("");
    setOsDescription("");
    setOsDate(relativeISO(0));
    setOsStatus("pendente");
    setOsObservation("");
    setEditingOsId(null);
  }

  function openCreateOsDialog() {
    resetOsForm();
    setIsOsDialogOpen(true);
  }

  function openEditOsDialog(os: ServiceOrder) {
    setEditingOsId(os.id);
    setOsClient(os.client);
    setOsDescription(os.description);
    setOsDate(os.date);
    setOsStatus(os.status);
    setOsObservation(os.observation);
    setIsOsDialogOpen(true);
  }

  function handleSaveOs() {
    if (!osClient.trim() || !osDescription.trim()) return;

    const payload: ServiceOrder = {
      id: editingOsId ?? `os-${Date.now()}`,
      client: osClient.trim(),
      description: osDescription.trim(),
      date: osDate,
      status: osStatus,
      observation: osObservation.trim(),
    };

    setServiceOrders((current) => {
      if (editingOsId) {
        return current.map((os) => (os.id === editingOsId ? payload : os));
      }
      return [payload, ...current];
    });

    setIsOsDialogOpen(false);
    resetOsForm();
  }

  function handleDeleteOs(osId: string) {
    if (!window.confirm("Excluir esta ordem de serviço?")) return;
    setServiceOrders((current) => current.filter((os) => os.id !== osId));
  }

  function resetForm(category: EquipmentCategory = "manutencao") {
    setFormName("");
    setFormCategory(category);
    setFormCondition("Bom");
    setFormObservation("");
    setEditingId(null);
  }

  function openCreateDialog(category?: EquipmentCategory) {
    const nextCategory =
      category ??
      (activeSection === "manutencao" || activeSection === "epis" || activeSection === "conectores"
        ? activeSection
        : "epis");
    resetForm(nextCategory);
    setIsDialogOpen(true);
  }

  function openEditDialog(item: EquipmentItem) {
    setEditingId(item.id);
    setFormName(item.name);
    setFormCategory(item.category);
    setFormCondition(item.condition);
    setFormObservation(item.observation);
    setIsDialogOpen(true);
  }

  function handleSave() {
    if (!formName.trim()) return;

    const payload: EquipmentItem = {
      id: editingId ?? `eq-${Date.now()}`,
      name: formName.trim(),
      category: formCategory,
      condition: formCondition,
      observation: formObservation.trim(),
    };

    setItems((current) => {
      if (editingId) {
        return current.map((item) => (item.id === editingId ? payload : item));
      }
      return [payload, ...current];
    });

    setIsDialogOpen(false);
    resetForm();
  }

  function handleDeleteItem(itemId: string) {
    if (!window.confirm("Excluir este item?")) return;
    setItems((current) => current.filter((item) => item.id !== itemId));
  }

  function handleDownloadMaintenanceReport() {
    const maintenanceItems = items.filter((item) => item.category === "manutencao");
    const lines =
      maintenanceItems.length === 0
        ? ["Nenhum item de manutenção cadastrado."]
        : maintenanceItems.map((item) => `- ${item.name} (${item.condition}): ${item.observation || "Sem observação."}`);

    const content = [
      "Relatório de manutenção do carro",
      `Gerado em: ${nowInBrasilia().toLocaleString("pt-BR")}`,
      `Total de itens: ${maintenanceItems.length}`,
      "",
      ...lines,
    ].join("\n");

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `relatorio-manutencao-${relativeISO(0)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleGenerateReport() {
    if (defectiveItems.length === 0) {
      setReportText("Nenhuma ferramenta com defeito registrada no momento.");
      return;
    }

    const lines = defectiveItems.map(
      (item) => `- ${item.name} (${item.category === "conectores" ? "Conectores e fusão" : item.category === "epis" ? "EPIs" : "Manutenção do carro"}): ${item.observation || "Sem observação adicional."}`
    );

    setReportText(
      [
        "Relatório de ferramentas com defeito",
        `Total: ${defectiveItems.length}`,
        "",
        ...lines,
      ].join("\n")
    );
  }

  const sectionTitle =
    activeSection === "controle"
      ? "Controle"
      : activeSection === "os"
        ? "OSs da semana"
        : sectionConfig[activeSection].label;

  const visibleItems =
    activeSection === "controle"
      ? defectiveItems
      : activeSection === "os"
        ? []
        : items.filter((item) => item.category === activeSection);

  const createActionLabel =
    activeSection === "manutencao" ? "Adicionar informações" : "Adicionar equipamento";

  const formActionLabel =
    formCategory === "manutencao" ? "Adicionar informações" : "Adicionar equipamento";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meu trabalho</h1>
        <p className="text-sm text-muted-foreground">
          Centralize manutenção, ferramentas, materiais e acompanhamento das OSs.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { key: "manutencao", label: "Manutenção do carro", count: items.filter((item) => item.category === "manutencao").length },
          { key: "epis", label: "Ferramentas (EPIs)", count: items.filter((item) => item.category === "epis").length },
          { key: "conectores", label: "Conectores e fusão", count: items.filter((item) => item.category === "conectores").length },
          { key: "os", label: "OSs na semana", count: osThisWeek },
        ].map((option) => {
          const Icon = option.key === "manutencao" ? CarFront : option.key === "epis" ? ShieldCheck : option.key === "conectores" ? Wrench : ClipboardList;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => setActiveSection(option.key as EquipmentSection)}
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
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {activeSection === "controle" ? (
                <AlertTriangle className="size-4" />
              ) : activeSection === "os" ? (
                <ClipboardList className="size-4" />
              ) : activeSection === "manutencao" ? (
                <CarFront className="size-4" />
              ) : activeSection === "epis" ? (
                <ShieldCheck className="size-4" />
              ) : (
                <Wrench className="size-4" />
              )}
              {sectionTitle}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {activeSection === "os" ? (
              <div className="flex flex-col gap-3">
                <div className="rounded-xl bg-muted/40 p-4">
                  <p className="text-sm text-muted-foreground">Total de OSs nesta semana</p>
                  <p className="mt-2 text-4xl font-semibold">{osThisWeek}</p>
                </div>
                <div className="flex justify-end">
                  <Button onClick={openCreateOsDialog} className="gap-2">
                    <Plus className="size-4" />
                    Nova OS
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  {serviceOrdersThisWeek.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                      Nenhuma OS registrada nesta semana.
                    </p>
                  ) : (
                    serviceOrdersThisWeek.map((os) => (
                      <div key={os.id} className="rounded-xl border border-border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">{os.client}</p>
                            <p className="text-sm text-muted-foreground">{os.description}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEditOsDialog(os)}>
                              Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteOs(os.id)}
                              aria-label="Excluir OS"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-muted px-2 py-1 text-xs">
                            {new Date(`${os.date}T00:00:00`).toLocaleDateString("pt-BR")}
                          </span>
                          <span
                            className={`rounded-full px-2 py-1 text-xs ${
                              os.status === "concluida"
                                ? "bg-success/10 text-success"
                                : os.status === "em_andamento"
                                  ? "bg-warning/15 text-warning"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {SERVICE_ORDER_STATUS_LABEL[os.status]}
                          </span>
                        </div>
                        {os.observation && (
                          <p className="mt-2 text-sm text-muted-foreground">{os.observation}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : activeSection === "controle" ? (
              <div className="flex flex-col gap-3">
                {defectiveItems.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                    Nenhum item com defeito foi registrado.
                  </p>
                ) : (
                  defectiveItems.map((item) => (
                    <div key={item.id} className="rounded-xl border border-border p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium">{item.name}</p>
                        <span className="rounded-full bg-destructive/10 px-2 py-1 text-xs text-destructive">
                          {item.condition}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{item.observation}</p>
                    </div>
                  ))
                )}
                <Button className="gap-2" onClick={handleGenerateReport}>
                  <FileText className="size-4" />
                  Gerar relatório
                </Button>
                {reportText && (
                  <div className="rounded-xl bg-muted/40 p-3 text-sm whitespace-pre-wrap">
                    {reportText}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
                  {sectionConfig[activeSection].helper}
                </div>
                <div className="flex justify-end gap-2">
                  {activeSection === "manutencao" && (
                    <Button variant="outline" onClick={handleDownloadMaintenanceReport} className="gap-2">
                      <Download className="size-4" />
                      Baixar relatório
                    </Button>
                  )}
                  <Button onClick={() => openCreateDialog()} className="gap-2">
                    <Plus className="size-4" />
                    {createActionLabel}
                  </Button>
                </div>
                <div className="flex flex-col gap-2">
                  {visibleItems.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                      Nenhum item cadastrado nesta categoria.
                    </p>
                  ) : (
                    visibleItems.map((item) => (
                      <div key={item.id} className="rounded-xl border border-border p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">{item.name}</p>
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
                        <div className="mt-2 flex items-center gap-2">
                          <span className="rounded-full bg-muted px-2 py-1 text-xs">{item.condition}</span>
                        </div>
                      </div>
                    ))
                  )}
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
              onClick={() => setActiveSection("controle")}
            >
              <AlertTriangle className="size-4" />
              Ver controle de defeitos
            </Button>
            <Button
              variant="outline"
              className="justify-start gap-2"
              onClick={() => setActiveSection("os")}
            >
              <ClipboardList className="size-4" />
              Ver OSs da semana
            </Button>
            <Button variant="outline" className="justify-start gap-2" onClick={() => openCreateDialog("epis")}>
              <Plus className="size-4" />
              Adicionar equipamento
            </Button>
            <Button
              variant="outline"
              className="justify-start gap-2"
              onClick={() => {
                setActiveSection("os");
                openCreateOsDialog();
              }}
            >
              <Plus className="size-4" />
              Nova OS
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
                placeholder="Ex: Alicate de pressão"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="equipment-category">Categoria</Label>
                <Select value={formCategory} onValueChange={(value) => setFormCategory(value as EquipmentItem["category"])}>
                  <SelectTrigger id="equipment-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manutencao">Manutenção do carro</SelectItem>
                    <SelectItem value="epis">Ferramentas (EPIs)</SelectItem>
                    <SelectItem value="conectores">Conectores e fusão</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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

      <Dialog
        open={isOsDialogOpen}
        onOpenChange={(open) => {
          setIsOsDialogOpen(open);
          if (!open) resetOsForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingOsId ? "Editar OS" : "Nova OS"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="os-client">Cliente/local</Label>
              <Input
                id="os-client"
                value={osClient}
                onChange={(e) => setOsClient(e.target.value)}
                placeholder="Ex: Maria Fernandes"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="os-description">Descrição do serviço</Label>
              <Input
                id="os-description"
                value={osDescription}
                onChange={(e) => setOsDescription(e.target.value)}
                placeholder="Ex: Instalação de fibra óptica"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="os-date">Data</Label>
                <Input
                  id="os-date"
                  type="date"
                  value={osDate}
                  onChange={(e) => setOsDate(e.target.value)}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="os-status">Status</Label>
                <Select value={osStatus} onValueChange={(value) => setOsStatus(value as ServiceOrderStatus)}>
                  <SelectTrigger id="os-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="em_andamento">Em andamento</SelectItem>
                    <SelectItem value="concluida">Concluída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="os-observation">Observação</Label>
              <Textarea
                id="os-observation"
                value={osObservation}
                onChange={(e) => setOsObservation(e.target.value)}
                placeholder="Detalhes do atendimento, peças usadas, pendências..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveOs} disabled={!osClient.trim() || !osDescription.trim()}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
