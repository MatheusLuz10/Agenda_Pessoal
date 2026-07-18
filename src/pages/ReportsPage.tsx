import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Copy, FileStack } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveBatimentoReport } from "@/data/batimentoApi";
import { isSupabaseConfigured } from "@/lib/supabaseClient";

// Tipos de relatório disponíveis em "/meu-trabalho/relatorios". A lista
// existe para caber novos tipos depois, sem mudar a navegação.
const REPORT_TYPES = [{ key: "batimento", label: "Batimento de caixa - Fibrasil" }] as const;

type ReportTypeKey = (typeof REPORT_TYPES)[number]["key"];

const SPLITTER_PORTS = [1, 2, 3, 4, 5, 6, 7, 8];

// Tela "/meu-trabalho/relatorios" — ponto único para os relatórios de
// texto rápido (copiar e colar) usados no dia a dia, além do PDF já
// existente em Meu trabalho.
export function ReportsPage() {
  const navigate = useNavigate();
  const [selectedType, setSelectedType] = useState<ReportTypeKey | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/meu-trabalho")}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex size-10 items-center justify-center rounded-xl bg-accent text-xl">
          <FileStack className="size-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground">Escolha o tipo de relatório para gerar.</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tipo de relatório</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {REPORT_TYPES.map((type) => (
            <Button
              key={type.key}
              variant={selectedType === type.key ? "default" : "outline"}
              onClick={() => setSelectedType(type.key)}
            >
              {type.label}
            </Button>
          ))}
        </CardContent>
      </Card>

      {selectedType === "batimento" && <BatimentoReportForm />}
    </div>
  );
}

function BatimentoReportForm() {
  const [atendente, setAtendente] = useState("");
  const [protocolo, setProtocolo] = useState("");
  const [caixaBatida, setCaixaBatida] = useState("");
  const [portasLivres, setPortasLivres] = useState<number[]>([]);
  const [portaUtilizada, setPortaUtilizada] = useState("");
  const [obs, setObs] = useState("");
  const [reportText, setReportText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function togglePort(port: number) {
    setPortasLivres((prev) => {
      const next = prev.includes(port) ? prev.filter((p) => p !== port) : [...prev, port].sort((a, b) => a - b);
      if (portaUtilizada && !next.includes(Number(portaUtilizada))) {
        setPortaUtilizada("");
      }
      return next;
    });
  }

  function buildReportText(): string {
    const lines = [
      "##BATIMENTO DE CAIXA - FIBRASIL##",
      "",
      `ATENDENTE: ${atendente}`,
      `PROTOCOLO: ${protocolo}`,
      `CAIXA BATIDA: ${caixaBatida}`,
      `PORTAS LIVRES: ${portasLivres.length > 0 ? portasLivres.join(", ") : "LOTADA"}`,
      `PORTA UTILIZADA: ${portaUtilizada}`,
    ];
    if (obs.trim()) {
      lines.push(`OBS: ${obs.trim()}`);
    }
    return lines.join("\n");
  }

  async function handleGenerateReport() {
    const text = buildReportText();
    setReportText(text);
    setCopied(false);

    if (isSupabaseConfigured) {
      try {
        await saveBatimentoReport({
          atendente,
          protocolo,
          caixaBatida,
          portasLivres: portasLivres.join(","),
          portaUtilizada: portaUtilizada || null,
          obs: obs.trim() || null,
        });
      } catch {
        // Histórico é só um extra — falhar aqui não deve impedir o
        // técnico de copiar o relatório que acabou de gerar.
      }
    }
  }

  async function copyReport() {
    if (!reportText) return;
    await navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Batimento de caixa</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="batimento-atendente">Atendente</Label>
            <Input id="batimento-atendente" value={atendente} onChange={(e) => setAtendente(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="batimento-protocolo">Protocolo</Label>
            <Input id="batimento-protocolo" value={protocolo} onChange={(e) => setProtocolo(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="batimento-caixa">Caixa batida</Label>
            <Input id="batimento-caixa" value={caixaBatida} onChange={(e) => setCaixaBatida(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Portas livres</Label>
            <div className="flex flex-wrap gap-2">
              {SPLITTER_PORTS.map((port) => (
                <button
                  key={port}
                  type="button"
                  onClick={() => togglePort(port)}
                  className={`flex size-9 items-center justify-center rounded-full border text-sm font-medium transition-colors ${
                    portasLivres.includes(port)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-muted/40"
                  }`}
                >
                  {port}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {portasLivres.length > 0
                ? `Portas livres: ${portasLivres.join(", ")}`
                : "Nenhuma porta livre selecionada (caixa lotada)."}
            </p>
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label>Porta utilizada</Label>
            {portasLivres.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma porta livre para escolher.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {portasLivres.map((port) => (
                  <button
                    key={port}
                    type="button"
                    onClick={() => setPortaUtilizada(String(port) === portaUtilizada ? "" : String(port))}
                    className={`flex size-9 items-center justify-center rounded-full border text-sm font-medium transition-colors ${
                      portaUtilizada === String(port)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    {port}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="batimento-obs">OBS (opcional)</Label>
            <Textarea id="batimento-obs" value={obs} onChange={(e) => setObs(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <Button className="w-fit gap-2" onClick={handleGenerateReport}>
            <FileStack className="size-4" />
            Gerar relatório
          </Button>

          {reportText && (
            <>
              <Textarea value={reportText} readOnly rows={10} className="font-mono text-xs" />
              <Button variant="outline" className="w-fit gap-2" onClick={copyReport}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copiado!" : "Copiar texto"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

