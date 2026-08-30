import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Check,
  ClipboardList,
  ClipboardPaste,
  Copy,
  Eraser,
  FileStack,
  Plus,
  RotateCcw,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import {
  DEFAULT_FIELD_FLAGS,
  EMPTY_EXTRACTED_DATA,
  OS_FIELD_GROUPS,
  OS_FIELD_LABELS,
  buildReportText,
  clearDraft,
  loadDraft,
  loadQuickTags,
  parseOsText,
  saveDraft,
  saveQuickTags,
  type ExtractedOsData,
  type OsFieldKey,
  type ReportQuickTag,
} from "@/lib/reportPatterns";

function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "item"}-${Date.now()}`;
}

// Tela "/meu-trabalho/relatorios/padroes" — módulo independente dentro de
// Relatórios: cola o texto de uma OS, extrai todos os campos, permite
// corrigir tudo e escolher com o seletor de "Informações identificadas" o
// que entra no relatório, escolher um motivo e copiar o relatório pronto.
// Não usa nenhum estado ou API do relatório de Batimento
// (ReportsPage.tsx) nem de outras telas.
export function ReportPatternsPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user?.id ?? session?.user?.email ?? "local";

  const [copiedField, setCopiedField] = useState<OsFieldKey | null>(null);

  // A OS colada e os dados extraídos ficam salvos (rascunho por técnico)
  // até "Novo relatório" descartar de propósito — assim o técnico não
  // precisa colar a mesma OS de novo se trocar de tela ou recarregar.
  const [initialDraft] = useState(() => loadDraft(userId));

  const [osText, setOsText] = useState(initialDraft?.osText ?? "");
  // Mescla com EMPTY_EXTRACTED_DATA: um rascunho salvo antes de um campo
  // novo existir (ex: PON/RPON) não teria essa chave, e os campos abaixo
  // chamam .trim() no valor sem checar undefined — sem isso, a tela toda
  // quebra em branco pra quem já tinha um rascunho de uma versão antiga.
  const [data, setData] = useState<ExtractedOsData>({ ...EMPTY_EXTRACTED_DATA, ...initialDraft?.data });
  const [processed, setProcessed] = useState(initialDraft?.processed ?? false);

  // Todo campo é sempre extraído; "Informações identificadas" é o único
  // lugar que decide o que entra no relatório — por padrão tudo marcado.
  const [includedFields, setIncludedFields] = useState<Record<OsFieldKey, boolean>>(
    () => Object.fromEntries(Object.keys(DEFAULT_FIELD_FLAGS).map((key) => [key, true])) as Record<OsFieldKey, boolean>
  );

  // Motivo: um botão selecionável por vez (ex: "LOCAL FECHADO"), que vira
  // a tag "##TEXTO##" no topo do relatório gerado.
  const [motives, setMotives] = useState<ReportQuickTag[]>(() => loadQuickTags(userId));
  const [selectedMotiveId, setSelectedMotiveId] = useState<string>(initialDraft?.selectedMotiveId ?? "");
  const [isMotiveDialogOpen, setIsMotiveDialogOpen] = useState(false);
  const [motiveFormLabel, setMotiveFormLabel] = useState("");

  const [observation, setObservation] = useState(initialDraft?.observation ?? "");
  const [reportText, setReportText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    saveDraft(userId, { osText, data, processed, selectedMotiveId, observation });
  }, [userId, osText, data, processed, selectedMotiveId, observation]);

  function handleProcessOs() {
    setData(parseOsText(osText, DEFAULT_FIELD_FLAGS));
    setProcessed(true);
    setIncludedFields(
      Object.fromEntries(Object.keys(DEFAULT_FIELD_FLAGS).map((key) => [key, true])) as Record<OsFieldKey, boolean>
    );
  }

  function handleClearOsText() {
    setOsText("");
  }

  async function handlePasteOsText() {
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText) setOsText(clipboardText);
    } catch {
      // Sem permissão de clipboard (ou navegador sem suporte) — o técnico
      // ainda pode colar manualmente (Ctrl+V / segurar e colar) no campo.
    }
  }

  function patchData(key: OsFieldKey, value: string) {
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function toggleIncluded(key: OsFieldKey) {
    setIncludedFields((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function setAllIncluded(value: boolean) {
    setIncludedFields(
      Object.fromEntries(Object.keys(includedFields).map((key) => [key, value])) as Record<OsFieldKey, boolean>
    );
  }

  async function copyFieldValue(key: OsFieldKey, value: string) {
    if (!value.trim()) return;
    await navigator.clipboard.writeText(value.trim());
    setCopiedField(key);
    setTimeout(() => setCopiedField((current) => (current === key ? null : current)), 2000);
  }

  // Só um motivo ativo por vez: clicar no já selecionado desmarca.
  function selectMotive(id: string) {
    setSelectedMotiveId((prev) => (prev === id ? "" : id));
  }

  function openNewMotiveDialog() {
    setMotiveFormLabel("");
    setIsMotiveDialogOpen(true);
  }

  function handleSaveMotive() {
    const newMotive: ReportQuickTag = {
      id: slugify(motiveFormLabel),
      label: motiveFormLabel.trim().toUpperCase(),
    };
    const next = [...motives, newMotive];
    setMotives(next);
    saveQuickTags(userId, next);
    setIsMotiveDialogOpen(false);
    setSelectedMotiveId(newMotive.id);
  }

  // Igual ao fluxo já existente de "Batimento de caixa" (ReportsPage.tsx):
  // o relatório só é montado quando o técnico clica em "Gerar relatório",
  // não fica recalculando uma prévia ao vivo a cada tecla.
  function handleGenerateReport() {
    const selectedMotive = motives.find((motive) => motive.id === selectedMotiveId);
    const activeQuickTags = selectedMotive ? [selectedMotive.label] : [];
    // O seletor de "Informações identificadas" é o único que decide o que
    // entra no relatório.
    setReportText(buildReportText({ data, flags: includedFields, observation, activeQuickTags }));
    setCopied(false);
  }

  async function copyReport() {
    if (!reportText) return;
    await navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleNewReport() {
    setOsText("");
    setData(EMPTY_EXTRACTED_DATA);
    setProcessed(false);
    setSelectedMotiveId("");
    setObservation("");
    setReportText(null);
    setCopied(false);
    clearDraft(userId);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/meu-trabalho/relatorios")}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-xl">
          <ClipboardList className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Relatórios Padrões</h1>
          <p className="text-sm text-muted-foreground">Transforme uma OS em um relatório técnico padronizado.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Abertura de TTK</CardTitle>
          <CardDescription>Gere o carimbo de abertura de TTK a partir do tipo de ocorrência.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="gap-2" onClick={() => navigate("/meu-trabalho/ttk")}>
            <Wrench className="size-4" />
            Abrir Abertura de TTK
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cole o texto completo da OS</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Textarea
            value={osText}
            onChange={(e) => setOsText(e.target.value)}
            rows={10}
            className="font-mono text-xs"
            placeholder="Cole aqui o texto completo da OS..."
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={handlePasteOsText}>
              <ClipboardPaste className="size-4" />
              Colar texto copiado
            </Button>
            <Button variant="outline" className="gap-2" onClick={handleClearOsText} disabled={!osText}>
              <Eraser className="size-4" />
              Limpar texto
            </Button>
          </div>
          <Button className="w-fit gap-2" onClick={handleProcessOs} disabled={!osText.trim()}>
            <ClipboardList className="size-4" />
            Processar OS
          </Button>
        </CardContent>
      </Card>

      {processed && (
        <Card>
          <CardHeader>
            <CardTitle>Informações identificadas</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button variant="outline" size="sm" onClick={() => setAllIncluded(true)}>
                Selecionar todos
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAllIncluded(false)}>
                Desmarcar todos
              </Button>
            </div>
            {OS_FIELD_GROUPS.flatMap((group) => group.fields).map((field) => (
                <div key={field.key} className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2 text-sm font-medium leading-none select-none">
                    <Checkbox
                      checked={includedFields[field.key] ?? true}
                      onCheckedChange={() => toggleIncluded(field.key)}
                    />
                    {OS_FIELD_LABELS[field.key]}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id={`os-field-${field.key}`}
                      aria-label={OS_FIELD_LABELS[field.key]}
                      className="flex-1"
                      value={data[field.key]}
                      onChange={(e) => patchData(field.key, e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => copyFieldValue(field.key, data[field.key])}
                      disabled={!data[field.key].trim()}
                    >
                      {copiedField === field.key ? <Check className="size-4" /> : <Copy className="size-4" />}
                    </Button>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Motivo do relatório</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {motives.map((motive) => (
              <Button
                key={motive.id}
                type="button"
                size="sm"
                variant={selectedMotiveId === motive.id ? "default" : "outline"}
                className="h-auto whitespace-normal text-left"
                onClick={() => selectMotive(motive.id)}
              >
                {motive.label}
              </Button>
            ))}
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Novo motivo"
              onClick={openNewMotiveDialog}
            >
              <Plus className="size-4" />
            </Button>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="report-observation">Descrição</Label>
            <Textarea
              id="report-observation"
              value={observation}
              onChange={(e) => setObservation(e.target.value)}
              placeholder="Descreva manualmente o que foi realizado..."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <div className="flex flex-wrap gap-2">
            <Button className="w-fit gap-2" onClick={handleGenerateReport}>
              <FileStack className="size-4" />
              Gerar relatório
            </Button>
            <Button variant="outline" className="w-fit gap-2" onClick={handleNewReport}>
              <RotateCcw className="size-4" />
              Novo relatório
            </Button>
          </div>

          {reportText && (
            <>
              <Textarea value={reportText} readOnly rows={16} className="font-mono text-xs" />
              <Button variant="outline" className="w-fit gap-2" onClick={copyReport}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copiado!" : "Copiar texto"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={isMotiveDialogOpen} onOpenChange={setIsMotiveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo motivo</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-motive-label">Texto do motivo</Label>
              <Input
                id="new-motive-label"
                value={motiveFormLabel}
                onChange={(e) => setMotiveFormLabel(e.target.value)}
                placeholder="Ex: SEM ENERGIA NO LOCAL"
              />
              <p className="text-xs text-muted-foreground">
                Aparece no topo do relatório como ##{motiveFormLabel.trim().toUpperCase() || "TEXTO"}##.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMotiveDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveMotive} disabled={!motiveFormLabel.trim()}>
              Salvar motivo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
