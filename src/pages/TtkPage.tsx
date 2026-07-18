import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Copy, FileText, LocateFixed, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { nowInBrasilia } from "@/lib/date";
import { jsPDF } from "jspdf";

// Os 4 tipos de ocorrência que o técnico pode abrir. O carimbo (texto do
// relatório) é o mesmo formulário para todos — só o campo MOTIVO muda de
// acordo com o tipo escolhido (confirmado com o usuário).
const TTK_TYPES = ["Caixa sem potência", "Porta de caixa sem potência", "Caixa atenuada", "Vandalismo"] as const;

type TtkType = (typeof TTK_TYPES)[number];

interface TtkFormState {
  nomeTecnico: string;
  telefoneTecnico: string;
  tecnologia: string;
  estado: string;
  cidade: string;
  motivo: string;
  splitter: string;
  caixaCto: string;
  armario: string;
  enderecoOcorrencia: string;
  ttk: string;
  atendente: string;
  instanciaDesignador: string;
  designadorAcesso: string;
  enderecoCto: string;
  latitudeCto: string;
  longitudeCto: string;
  enderecoCliente: string;
  latitudeCliente: string;
  longitudeCliente: string;
}

const EMPTY_FORM: TtkFormState = {
  nomeTecnico: "",
  telefoneTecnico: "",
  tecnologia: "GPON",
  estado: "PA",
  cidade: "Belém",
  motivo: "",
  splitter: "",
  caixaCto: "",
  armario: "",
  enderecoOcorrencia: "",
  ttk: "",
  atendente: "",
  instanciaDesignador: "",
  designadorAcesso: "",
  enderecoCto: "",
  latitudeCto: "",
  longitudeCto: "",
  enderecoCliente: "",
  latitudeCliente: "",
  longitudeCliente: "",
};

// Nome e telefone do técnico são salvos localmente para não precisar
// redigitar em todo carimbo novo.
const TECHNICIAN_STORAGE_KEY = "ttk-technician-info";

function loadSavedTechnician(): Pick<TtkFormState, "nomeTecnico" | "telefoneTecnico"> {
  try {
    const raw = localStorage.getItem(TECHNICIAN_STORAGE_KEY);
    if (!raw) return { nomeTecnico: "", telefoneTecnico: "" };
    const parsed = JSON.parse(raw);
    return { nomeTecnico: parsed.nomeTecnico ?? "", telefoneTecnico: parsed.telefoneTecnico ?? "" };
  } catch {
    return { nomeTecnico: "", telefoneTecnico: "" };
  }
}

function relativeISO(): string {
  const date = nowInBrasilia();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildReportText(form: TtkFormState): string {
  return `SUSPEITA DE MASSIVA

NOME DO TÉCNICO: ${form.nomeTecnico}
TELEFONE DO TÉCNICO: ${form.telefoneTecnico}
TECNOLOGIA: ${form.tecnologia}
ESTADO: ${form.estado}
CIDADE: ${form.cidade}

MOTIVO: ${form.motivo}

SPLITTER 1º NÍVEL: ${form.splitter}
CAIXA (CTO): ${form.caixaCto}
ARMÁRIO: ${form.armario}

ENDEREÇO DA OCORRÊNCIA: ${form.enderecoOcorrencia}

TTK: ${form.ttk}
ATENDENTE: ${form.atendente}

INSTÂNCIA/DESIGNADOR RECLAMADO: ${form.instanciaDesignador}
DESIGNADOR DE ACESSO FIBRASIL 069: ${form.designadorAcesso}

ENDEREÇO DA CTO: ${form.enderecoCto}
Latitude: ${form.latitudeCto}
Longitude: ${form.longitudeCto}

ENDEREÇO DO CLIENTE: ${form.enderecoCliente}
Latitude: ${form.latitudeCliente}
Longitude: ${form.longitudeCliente}`;
}

// Tela "/meu-trabalho/ttk" — gera o texto/carimbo de abertura de TTK a
// partir de um dos 4 tipos de ocorrência. Não é persistido no Supabase:
// é um formulário de preenchimento rápido, só o nome/telefone do técnico
// ficam salvos localmente (ver TECHNICIAN_STORAGE_KEY).
export function TtkPage() {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<TtkType | null>(null);
  const [form, setForm] = useState<TtkFormState>(() => ({ ...EMPTY_FORM, ...loadSavedTechnician() }));
  const [copied, setCopied] = useState(false);
  const [locationError, setLocationError] = useState<Record<"cto" | "cliente", string | null>>({
    cto: null,
    cliente: null,
  });
  const [locating, setLocating] = useState<Record<"cto" | "cliente", boolean>>({ cto: false, cliente: false });

  function patchForm(patch: Partial<TtkFormState>) {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if ("nomeTecnico" in patch || "telefoneTecnico" in patch) {
        localStorage.setItem(
          TECHNICIAN_STORAGE_KEY,
          JSON.stringify({ nomeTecnico: next.nomeTecnico, telefoneTecnico: next.telefoneTecnico })
        );
      }
      return next;
    });
  }

  function selectType(type: TtkType) {
    setSelectedType(type);
    patchForm({ motivo: type });
  }

  // Converte coordenadas em endereço legível via Nominatim (OpenStreetMap,
  // gratuito e sem chave de API). Retorna null se a busca falhar — nesse
  // caso as coordenadas já capturadas continuam válidas, só o endereço
  // fica em branco para preenchimento manual.
  async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`,
        { headers: { Accept: "application/json" } }
      );
      if (!response.ok) return null;
      const data = await response.json();
      return typeof data.display_name === "string" ? data.display_name : null;
    } catch {
      return null;
    }
  }

  function requestCurrentLocation(target: "cto" | "cliente") {
    if (!navigator.geolocation) {
      setLocationError((prev) => ({ ...prev, [target]: "Geolocalização não suportada neste dispositivo." }));
      return;
    }
    setLocating((prev) => ({ ...prev, [target]: true }));
    setLocationError((prev) => ({ ...prev, [target]: null }));
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        const lat = latitude.toFixed(6);
        const lng = longitude.toFixed(6);
        const address = await reverseGeocode(latitude, longitude);

        if (target === "cto") {
          patchForm({ latitudeCto: lat, longitudeCto: lng, ...(address ? { enderecoCto: address } : {}) });
        } else {
          patchForm({
            latitudeCliente: lat,
            longitudeCliente: lng,
            ...(address ? { enderecoCliente: address } : {}),
          });
        }

        setLocationError((prev) => ({
          ...prev,
          [target]: address
            ? null
            : "Coordenadas capturadas, mas não foi possível identificar o endereço automaticamente.",
        }));
        setLocating((prev) => ({ ...prev, [target]: false }));
      },
      () => {
        setLocationError((prev) => ({
          ...prev,
          [target]: "Não foi possível obter a localização. Verifique a permissão do navegador.",
        }));
        setLocating((prev) => ({ ...prev, [target]: false }));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const reportText = useMemo(() => buildReportText(form), [form]);

  async function copyReport() {
    await navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadReportPdf() {
    const doc = new jsPDF();
    const marginX = 14;
    const lineHeight = 6;
    let cursorY = 18;

    doc.setFontSize(16);
    doc.text(`Abertura de TTK — ${selectedType ?? "Sem tipo"}`, marginX, cursorY);
    cursorY += 8;

    doc.setFontSize(10);
    doc.text(`Gerado em: ${nowInBrasilia().toLocaleString("pt-BR")}`, marginX, cursorY);
    cursorY += 10;

    doc.setFontSize(11);
    const lines = doc.splitTextToSize(reportText, 180);
    for (const line of lines) {
      if (cursorY > 280) {
        doc.addPage();
        cursorY = 18;
      }
      doc.text(line, marginX, cursorY);
      cursorY += lineHeight;
    }

    doc.save(`ttk-${(selectedType ?? "relatorio").toLowerCase().replace(/\s+/g, "-")}-${relativeISO()}.pdf`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/meu-trabalho")}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-xl">
          <Wrench className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Abertura de TTK</h1>
          <p className="text-sm text-muted-foreground">Escolha o tipo de ocorrência e preencha o carimbo.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tipo de ocorrência</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {TTK_TYPES.map((type) => (
            <Button
              key={type}
              variant={selectedType === type ? "default" : "outline"}
              onClick={() => selectType(type)}
            >
              {type}
            </Button>
          ))}
        </CardContent>
      </Card>

      {selectedType && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Dados do carimbo</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome do técnico" value={form.nomeTecnico} onChange={(v) => patchForm({ nomeTecnico: v })} />
              <Field
                label="Telefone do técnico"
                value={form.telefoneTecnico}
                onChange={(v) => patchForm({ telefoneTecnico: v })}
              />
              <Field label="Tecnologia" value={form.tecnologia} onChange={(v) => patchForm({ tecnologia: v })} />
              <Field label="Estado" value={form.estado} onChange={(v) => patchForm({ estado: v })} />
              <Field label="Cidade" value={form.cidade} onChange={(v) => patchForm({ cidade: v })} />
              <Field label="Motivo" value={form.motivo} onChange={(v) => patchForm({ motivo: v })} />
              <Field label="Splitter 1º nível" value={form.splitter} onChange={(v) => patchForm({ splitter: v })} />
              <Field label="Caixa (CTO)" value={form.caixaCto} onChange={(v) => patchForm({ caixaCto: v })} />
              <Field label="Armário" value={form.armario} onChange={(v) => patchForm({ armario: v })} />
              <Field
                label="Endereço da ocorrência"
                value={form.enderecoOcorrencia}
                onChange={(v) => patchForm({ enderecoOcorrencia: v })}
              />
              <Field label="TTK" value={form.ttk} onChange={(v) => patchForm({ ttk: v })} />
              <Field label="Atendente" value={form.atendente} onChange={(v) => patchForm({ atendente: v })} />
              <Field
                label="Instância/Designador reclamado"
                value={form.instanciaDesignador}
                onChange={(v) => patchForm({ instanciaDesignador: v })}
              />
              <Field
                label="Designador de acesso Fibrasil 069"
                value={form.designadorAcesso}
                onChange={(v) => patchForm({ designadorAcesso: v })}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Endereço da CTO</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field
                  label="Endereço da CTO"
                  value={form.enderecoCto}
                  onChange={(v) => patchForm({ enderecoCto: v })}
                />
              </div>
              <Field label="Latitude" value={form.latitudeCto} onChange={(v) => patchForm({ latitudeCto: v })} />
              <Field label="Longitude" value={form.longitudeCto} onChange={(v) => patchForm({ longitudeCto: v })} />
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit gap-2"
                  onClick={() => requestCurrentLocation("cto")}
                  disabled={locating.cto}
                >
                  <LocateFixed className="size-4" />
                  {locating.cto ? "Buscando endereço..." : "Usar minha localização"}
                </Button>
                {locationError.cto && <p className="text-xs text-destructive">{locationError.cto}</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Endereço do cliente</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field
                  label="Endereço do cliente"
                  value={form.enderecoCliente}
                  onChange={(v) => patchForm({ enderecoCliente: v })}
                />
              </div>
              <Field
                label="Latitude"
                value={form.latitudeCliente}
                onChange={(v) => patchForm({ latitudeCliente: v })}
              />
              <Field
                label="Longitude"
                value={form.longitudeCliente}
                onChange={(v) => patchForm({ longitudeCliente: v })}
              />
              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit gap-2"
                  onClick={() => requestCurrentLocation("cliente")}
                  disabled={locating.cliente}
                >
                  <LocateFixed className="size-4" />
                  {locating.cliente ? "Buscando endereço..." : "Usar minha localização"}
                </Button>
                {locationError.cliente && <p className="text-xs text-destructive">{locationError.cliente}</p>}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Prévia do relatório</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <Textarea value={reportText} readOnly rows={20} className="font-mono text-xs" />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" className="gap-2" onClick={copyReport}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copiado!" : "Copiar texto"}
                </Button>
                <Button className="gap-2" onClick={downloadReportPdf}>
                  <FileText className="size-4" />
                  Gerar relatório (PDF)
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = `ttk-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
