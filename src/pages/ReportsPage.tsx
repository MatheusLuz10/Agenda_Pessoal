import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, Copy, FileStack, Phone, PhoneOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { saveBatimentoReport } from "@/data/batimentoApi";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { nowInBrasilia } from "@/lib/date";

// Tipos de relatório disponíveis em "/meu-trabalho/relatorios". A lista
// existe para caber novos tipos depois, sem mudar a navegação.
const REPORT_TYPES = [
  { key: "batimento", label: "Batimento de caixa - Fibrasil" },
  { key: "retencao-co", label: "Retenção/C.O" },
] as const;

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
      {selectedType === "retencao-co" && <RetencaoCoReportForm />}
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
            <Label htmlFor="batimento-porta-utilizada">Porta utilizada</Label>
            <Select value={portaUtilizada} onValueChange={setPortaUtilizada} disabled={portasLivres.length === 0}>
              <SelectTrigger id="batimento-porta-utilizada">
                <SelectValue placeholder={portasLivres.length === 0 ? "Nenhuma porta livre" : "Selecione a porta"} />
              </SelectTrigger>
              <SelectContent>
                {portasLivres.map((port) => (
                  <SelectItem key={port} value={String(port)}>
                    {port}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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

interface CallLogEntry {
  id: string;
  setor: string;
  motivo: string;
  start: Date;
  end: Date;
  durationMs: number;
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, "0")).join(":");
}

// Registra as ligações feitas durante um atendimento (cliente, C.O.,
// retenção, supervisão etc.) com início/fim/duração via cronômetro —
// o técnico só aperta "Iniciar" e "Encerrar", nada de digitar horário.
function RetencaoCoReportForm() {
  const [setor, setSetor] = useState("");
  const [motivo, setMotivo] = useState("");
  const [calls, setCalls] = useState<CallLogEntry[]>([]);
  const [callStart, setCallStart] = useState<Date | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [reportText, setReportText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  function startCall() {
    const start = nowInBrasilia();
    setCallStart(start);
    setElapsedMs(0);
    intervalRef.current = setInterval(() => {
      setElapsedMs(nowInBrasilia().getTime() - start.getTime());
    }, 1000);
  }

  function endCall() {
    if (!callStart) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    const end = nowInBrasilia();
    const durationMs = end.getTime() - callStart.getTime();
    setCalls((prev) => [
      ...prev,
      { id: crypto.randomUUID(), setor: setor.trim(), motivo: motivo.trim(), start: callStart, end, durationMs },
    ]);
    setCallStart(null);
    setElapsedMs(0);
    setSetor("");
    setMotivo("");
  }

  function removeCall(id: string) {
    setCalls((prev) => prev.filter((call) => call.id !== id));
  }

  function buildReportText(): string {
    const totalMs = calls.reduce((sum, call) => sum + call.durationMs, 0);
    const lines = ["##REGISTRO DE LIGAÇÕES - RETENÇÃO/C.O##", ""];

    if (calls.length === 0) {
      lines.push("Nenhuma ligação registrada.");
    } else {
      calls.forEach((call, index) => {
        lines.push(`LIGAÇÃO ${index + 1}`);
        lines.push(`SETOR: ${call.setor}`);
        lines.push(`INÍCIO: ${formatClock(call.start)}`);
        lines.push(`FIM: ${formatClock(call.end)}`);
        lines.push(`DURAÇÃO: ${formatDuration(call.durationMs)}`);
        lines.push(`MOTIVO: ${call.motivo}`);
        lines.push("");
      });
      lines.push(`TOTAL DE LIGAÇÕES: ${calls.length}`);
      lines.push(`TEMPO TOTAL: ${formatDuration(totalMs)}`);
    }

    return lines.join("\n").trim();
  }

  function handleGenerateReport() {
    setReportText(buildReportText());
    setCopied(false);
  }

  async function copyReport() {
    if (!reportText) return;
    await navigator.clipboard.writeText(reportText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const isCallActive = callStart !== null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Registrar ligação</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="retencao-setor">Setor/contato</Label>
              <Input
                id="retencao-setor"
                value={setor}
                onChange={(e) => setSetor(e.target.value)}
                placeholder="Ex: Retenção, C.O., Cliente, Supervisão"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="retencao-motivo">Motivo</Label>
              <Input id="retencao-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isCallActive ? (
              <Button variant="destructive" className="gap-2" onClick={endCall}>
                <PhoneOff className="size-4" />
                Encerrar ligação
              </Button>
            ) : (
              <Button className="gap-2" onClick={startCall}>
                <Phone className="size-4" />
                Iniciar ligação
              </Button>
            )}
            {isCallActive && (
              <span className="font-mono text-lg tabular-nums text-primary">{formatDuration(elapsedMs)}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {calls.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Ligações registradas ({calls.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {calls.map((call, index) => (
              <div key={call.id} className="flex items-start justify-between gap-3 rounded-xl border border-border p-3">
                <div className="flex flex-col gap-0.5 text-sm">
                  <p className="font-medium">
                    Ligação {index + 1} — {call.setor || "Sem setor"}
                  </p>
                  <p className="text-muted-foreground">
                    {formatClock(call.start)} até {formatClock(call.end)} · Duração {formatDuration(call.durationMs)}
                  </p>
                  {call.motivo && <p className="text-muted-foreground">Motivo: {call.motivo}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  onClick={() => removeCall(call.id)}
                  aria-label="Remover ligação"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3 pt-6">
          <Button className="w-fit gap-2" onClick={handleGenerateReport} disabled={isCallActive}>
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
