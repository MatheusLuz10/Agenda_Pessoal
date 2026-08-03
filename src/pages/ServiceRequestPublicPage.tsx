import { useState, type ChangeEvent, type CSSProperties } from "react";
import { CheckCircle2, ImagePlus, Phone, Search, User, Wifi, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createServiceRequest, lookupServiceRequest, uploadServiceRequestPhoto } from "@/data/serviceRequestsApi";
import { isAcceptedImageType } from "@/lib/imageCompression";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { SERVICE_REQUEST_STATUS_LABELS, SERVICE_REQUEST_TYPES } from "@/types";
import type { ServiceRequestLookup } from "@/types";

const COMPANY_NAME = "CONECTA WIFI";
const TECHNICIAN_NAME = "Matheus Luz";
const CONTACT_PHONE = "(91) 98645-6795";

// Paleta extraída do material de marca (public/designerSolicitacao.png:
// fundo azul-marinho quase preto + azul vibrante de destaque). Aplicada
// via variáveis CSS no container raiz — os componentes (Card, Input,
// Button etc.) já leem essas mesmas variáveis, então todo o resto da
// página se re-temiza sozinho, sem precisar mexer em cada um.
const BRAND_THEME_STYLE: CSSProperties = {
  ["--background" as string]: "#000b1f",
  ["--foreground" as string]: "#f2f8ff",
  ["--card" as string]: "#0a1b36",
  ["--card-foreground" as string]: "#f2f8ff",
  ["--popover" as string]: "#0a1b36",
  ["--popover-foreground" as string]: "#f2f8ff",
  ["--primary" as string]: "#0d8afd",
  ["--primary-foreground" as string]: "#ffffff",
  ["--secondary" as string]: "#0f2242",
  ["--secondary-foreground" as string]: "#f2f8ff",
  ["--muted" as string]: "#0f2242",
  ["--muted-foreground" as string]: "#9fc4f0",
  ["--accent" as string]: "#123262",
  ["--accent-foreground" as string]: "#f2f8ff",
  ["--border" as string]: "rgba(13, 138, 253, 0.35)",
  ["--input" as string]: "rgba(13, 138, 253, 0.35)",
  ["--ring" as string]: "#0d8afd",
  colorScheme: "dark",
  background:
    "radial-gradient(circle at 12% 8%, rgba(13, 138, 253, 0.28), transparent 40%), " +
    "radial-gradient(circle at 88% 92%, rgba(2, 115, 246, 0.25), transparent 45%), " +
    "#000b1f",
};

interface PendingPhoto {
  file: File;
  previewUrl: string;
}

// Tela "/solicitar-servico" — a ÚNICA rota pública do app (sem login),
// acessada via QR Code ou link direto. Fica fora do <AppLayout>/
// <RequireAuth>: não usa sidebar, header nem nenhum contexto que
// dependa de autenticação — é uma página autossuficiente.
export function ServiceRequestPublicPage() {
  const [mode, setMode] = useState<"nova" | "consultar">("nova");

  const [clientName, setClientName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [trackingCode, setTrackingCode] = useState<string | null>(null);

  const isValid = Boolean(
    clientName.trim() && phone.trim() && address.trim() && serviceType && description.trim()
  );

  function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite selecionar o mesmo arquivo de novo depois de remover

    const accepted: File[] = [];
    let hasRejected = false;
    for (const file of files) {
      if (isAcceptedImageType(file)) accepted.push(file);
      else hasRejected = true;
    }
    setPhotoError(hasRejected ? "Só são aceitas imagens (JPG, JPEG, PNG ou WEBP)." : null);
    setPhotos((prev) => [...prev, ...accepted.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
  }

  function removePhoto(index: number) {
    setPhotos((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].previewUrl);
      next.splice(index, 1);
      return next;
    });
  }

  async function handleSubmit() {
    if (!isValid || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { id: requestId, trackingCode: newTrackingCode } = await createServiceRequest({
        clientName,
        company,
        phone,
        address,
        serviceType,
        description,
      });
      for (const photo of photos) {
        try {
          await uploadServiceRequestPhoto(requestId, photo.file);
        } catch (error) {
          // Uma foto que falha não deve derrubar a solicitação inteira —
          // o texto já foi registrado, o que importa mais pro cliente.
          console.error("Falha ao enviar uma foto (solicitação já foi registrada):", error);
        }
      }
      photos.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
      setTrackingCode(newTrackingCode);
      setSubmitted(true);
    } catch (error) {
      console.error("Falha ao enviar solicitação:", error);
      setSubmitError("Não foi possível enviar sua solicitação agora. Verifique sua conexão e tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="flex min-h-screen justify-center px-4 py-8 text-foreground sm:px-6"
      style={BRAND_THEME_STYLE}
    >
      <div className="flex w-full max-w-lg flex-col gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_20px_rgba(13,138,253,0.5)]">
            <Wifi className="size-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{COMPANY_NAME}</h1>
          <p className="text-sm text-muted-foreground">
            Técnico responsável: {TECHNICIAN_NAME}
            <br />
            Telefone: {CONTACT_PHONE}
          </p>
        </div>

        {isSupabaseConfigured && (
          <div className="flex gap-1 rounded-xl border border-border bg-card p-1">
            <button
              type="button"
              onClick={() => setMode("nova")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                mode === "nova" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              Nova solicitação
            </button>
            <button
              type="button"
              onClick={() => setMode("consultar")}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                mode === "consultar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              Consultar andamento
            </button>
          </div>
        )}

        {!isSupabaseConfigured ? (
          <Card>
            <CardContent className="pt-5 text-center text-sm text-muted-foreground">
              Formulário indisponível no momento. Entre em contato pelo telefone {CONTACT_PHONE}.
            </CardContent>
          </Card>
        ) : mode === "consultar" ? (
          <TrackRequestCard />
        ) : submitted ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 pt-6 text-center">
              <CheckCircle2 className="size-12 text-success" />
              <h2 className="text-lg font-semibold">Sua solicitação foi enviada com sucesso!</h2>
              <p className="text-sm text-muted-foreground">
                Nossa equipe da {COMPANY_NAME} analisará sua solicitação e entrará em contato o mais breve possível.
              </p>
              {trackingCode && (
                <div className="mt-1 w-full rounded-xl bg-primary/10 p-3">
                  <p className="text-xs text-muted-foreground">Código de acompanhamento</p>
                  <p className="text-lg font-semibold tracking-wide text-primary">{trackingCode}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Guarde esse código para consultar o andamento na aba "Consultar andamento".
                  </p>
                </div>
              )}
              <div className="mt-2 rounded-xl bg-muted/40 p-3 text-sm">
                <p className="font-medium">Técnico responsável:</p>
                <p>{TECHNICIAN_NAME}</p>
                <p className="mt-2 font-medium">Telefone:</p>
                <p>{CONTACT_PHONE}</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col gap-4 pt-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="request-client-name">Nome do cliente</Label>
                <Input
                  id="request-client-name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="Seu nome completo"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="request-company">Empresa (opcional)</Label>
                <Input
                  id="request-company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Nome da empresa, se houver"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="request-phone">Telefone para contato</Label>
                <Input
                  id="request-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(00) 00000-0000"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="request-address">Endereço do serviço</Label>
                <Textarea
                  id="request-address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Rua, número, bairro, referência"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="request-service-type">Tipo de serviço</Label>
                <Select value={serviceType} onValueChange={setServiceType}>
                  <SelectTrigger id="request-service-type">
                    <SelectValue placeholder="Selecione o serviço desejado" />
                  </SelectTrigger>
                  <SelectContent>
                    {SERVICE_REQUEST_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="request-description">Descrição do problema ou solicitação</Label>
                <Textarea
                  id="request-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Descreva o que está acontecendo ou o que você precisa"
                  rows={4}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="request-photos">Fotos (opcional)</Label>
                <label
                  htmlFor="request-photos"
                  className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground hover:bg-accent"
                >
                  <ImagePlus className="size-6" />
                  Toque para escolher fotos (JPG, PNG ou WEBP)
                </label>
                <input
                  id="request-photos"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  className="hidden"
                  onChange={handleFilesSelected}
                />
                {photoError && <p className="text-xs text-warning">{photoError}</p>}

                {photos.length > 0 && (
                  <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {photos.map((photo, index) => (
                      <div key={photo.previewUrl} className="group relative aspect-square overflow-hidden rounded-lg border border-border">
                        <img src={photo.previewUrl} alt="" className="size-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(index)}
                          aria-label="Remover foto"
                          className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-black/60 text-white"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {submitError && <p className="text-sm text-destructive">{submitError}</p>}

              <Button
                size="lg"
                className="gap-2"
                onClick={handleSubmit}
                disabled={!isValid || submitting}
              >
                <User className="size-4" />
                {submitting ? "Enviando..." : "Enviar Solicitação"}
              </Button>
              {!isValid && (
                <p className="text-center text-xs text-muted-foreground">
                  Preencha nome, telefone, endereço, tipo de serviço e a descrição pra enviar.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
          <Phone className="size-3.5" />
          Dúvidas? Ligue para {CONTACT_PHONE}
        </p>
      </div>
    </div>
  );
}

// Aba "Consultar andamento": o cliente digita o código de acompanhamento
// recebido na tela de sucesso (8 caracteres aleatórios, ex: "K7XPQ2RM" —
// não é o request_number, curto/sequencial demais pra resistir a força
// bruta) e vê o status atual, sem precisar ligar. Consulta feita via RPC
// pública que só devolve os campos relevantes (ver lookupServiceRequest).
function TrackRequestCard() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [result, setResult] = useState<ServiceRequestLookup | null>(null);

  async function handleLookup() {
    if (!code.trim() || loading) return;
    setLoading(true);
    setLookupError(null);
    setResult(null);
    try {
      const found = await lookupServiceRequest(code);
      if (!found) {
        setLookupError("Nenhuma solicitação encontrada com esse código. Verifique se digitou corretamente.");
      } else {
        setResult(found);
      }
    } catch (error) {
      console.error("Falha ao consultar solicitação:", error);
      setLookupError("Não foi possível consultar agora. Verifique sua conexão e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="track-code">Código de acompanhamento</Label>
          <Input
            id="track-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLookup();
            }}
            placeholder="Ex: K7XPQ2RM"
            className="uppercase tracking-wide"
          />
        </div>

        <Button className="gap-2" onClick={handleLookup} disabled={!code.trim() || loading}>
          <Search className="size-4" />
          {loading ? "Consultando..." : "Consultar"}
        </Button>

        {lookupError && <p className="text-sm text-destructive">{lookupError}</p>}

        {result && (
          <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-semibold">{result.requestNumber}</span>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                {SERVICE_REQUEST_STATUS_LABELS[result.status]}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{result.serviceType}</p>
            <p className="text-sm">{result.description}</p>
            <p className="text-xs text-muted-foreground">
              Aberta em {new Date(result.createdAt).toLocaleDateString("pt-BR")}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
