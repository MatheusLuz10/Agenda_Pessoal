import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Inbox,
  Link as LinkIcon,
  MapPin,
  Phone,
  QrCode as QrCodeIcon,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useServiceRequests } from "@/contexts/ServiceRequestsContext";
import { SERVICE_REQUEST_STATUS_LABELS } from "@/types";
import type { ServiceRequest, ServiceRequestStatus } from "@/types";

const PUBLIC_REQUEST_PATH = "/solicitar-servico";

// Template de marca (public/designerSolicitacao.png) usado como moldura do
// QR Code baixável — o QR gerado dinamicamente é desenhado por cima, no
// quadrado branco reservado pra ele. Posição/tamanho medidos em pixels
// reais do arquivo (1681x936), com uma margem de segurança pra não
// invadir os cantos arredondados do quadrado.
const CARD_TEMPLATE_SRC = "/designerSolicitacao.png";
const QR_BOX = { x: 176, y: 280, size: 366 };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Falha ao carregar imagem: ${src}`));
    img.src = src;
  });
}

const STATUS_OPTIONS = Object.keys(SERVICE_REQUEST_STATUS_LABELS) as ServiceRequestStatus[];

const STATUS_BADGE_VARIANT: Record<
  ServiceRequestStatus,
  "default" | "secondary" | "success" | "warning" | "destructive" | "outline"
> = {
  nova: "default",
  em_analise: "outline",
  agendada: "secondary",
  em_atendimento: "warning",
  concluida: "success",
  cancelada: "destructive",
};

function formatDateTimeBR(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Tela "/solicitacoes" — área PRIVADA (autenticada, dentro do
// AppLayout normal) onde os chamados abertos pela página pública
// ("/solicitar-servico") aparecem pro técnico gerenciar: mudar status,
// anotar observações internas e excluir.
export function ServiceRequestsPage() {
  const { requests, loading, setStatus, setObservations, deleteRequest } = useServiceRequests();
  const [statusFilter, setStatusFilter] = useState<ServiceRequestStatus | "todos">("todos");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [isQrDialogOpen, setIsQrDialogOpen] = useState(false);

  const filteredRequests = useMemo(
    () => (statusFilter === "todos" ? requests : requests.filter((r) => r.status === statusFilter)),
    [requests, statusFilter]
  );

  function toggleOpen(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDelete(request: ServiceRequest) {
    if (!window.confirm(`Excluir a solicitação ${request.requestNumber} de ${request.clientName}?`)) return;
    deleteRequest(request.id);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Solicitações</h1>
          <p className="text-sm text-muted-foreground">
            Chamados abertos pelos clientes na página pública de solicitação de serviços.
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setIsQrDialogOpen(true)}>
          <QrCodeIcon className="size-4" />
          Gerar QR Code
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Filtrar por status:</span>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as ServiceRequestStatus | "todos")}>
          <SelectTrigger className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos ({requests.length})</SelectItem>
            {STATUS_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {SERVICE_REQUEST_STATUS_LABELS[status]} ({requests.filter((r) => r.status === status).length})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando solicitações...</p>
      ) : filteredRequests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Inbox className="size-8" />
            <p className="text-sm">Nenhuma solicitação por aqui ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {filteredRequests.map((request) => {
            const isOpen = openIds.has(request.id);
            return (
              <Card key={request.id}>
                <button
                  type="button"
                  onClick={() => toggleOpen(request.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left"
                  aria-expanded={isOpen}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold">{request.requestNumber}</span>
                    <Badge variant={STATUS_BADGE_VARIANT[request.status]}>
                      {SERVICE_REQUEST_STATUS_LABELS[request.status]}
                    </Badge>
                    <span className="text-sm">{request.clientName}</span>
                    <span className="text-xs text-muted-foreground">{request.serviceType}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {formatDateTimeBR(request.createdAt)}
                    {isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                  </div>
                </button>

                {isOpen && (
                  <CardContent className="flex flex-col gap-4 pt-0">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Cliente</p>
                        <p className="text-sm font-medium">{request.clientName}</p>
                      </div>
                      {request.company && (
                        <div>
                          <p className="text-xs text-muted-foreground">Empresa</p>
                          <p className="text-sm font-medium">{request.company}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-muted-foreground">Telefone</p>
                        <p className="flex items-center gap-1.5 text-sm font-medium">
                          <Phone className="size-3.5 text-muted-foreground" />
                          {request.phone}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Endereço</p>
                        <p className="flex items-center gap-1.5 text-sm font-medium">
                          <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
                          {request.address}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-xs text-muted-foreground">Descrição</p>
                      <p className="text-sm">{request.description}</p>
                    </div>

                    {request.photos.length > 0 && (
                      <div>
                        <p className="mb-1.5 text-xs text-muted-foreground">Fotos ({request.photos.length})</p>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                          {request.photos.map((photo) => (
                            <a
                              key={photo.id}
                              href={photo.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block aspect-square overflow-hidden rounded-lg border border-border"
                            >
                              <img src={photo.url} alt="" className="size-full object-cover" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs text-muted-foreground">Status</p>
                      <Select
                        value={request.status}
                        onValueChange={(value) => setStatus(request.id, value as ServiceRequestStatus)}
                      >
                        <SelectTrigger className="w-56">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((status) => (
                            <SelectItem key={status} value={status}>
                              {SERVICE_REQUEST_STATUS_LABELS[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <p className="text-xs text-muted-foreground">Observações internas</p>
                      <Textarea
                        defaultValue={request.observations ?? ""}
                        placeholder="Anotações pra uso interno — o cliente nunca vê isso"
                        onBlur={(e) => setObservations(request.id, e.target.value)}
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(request)}
                      >
                        <Trash2 className="size-4" />
                        Excluir solicitação
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <QrCodeDialog open={isQrDialogOpen} onOpenChange={setIsQrDialogOpen} />
    </div>
  );
}

// Gera o QR Code (e o link) da página pública de solicitações, tudo no
// navegador (biblioteca "qrcode", sem depender de nenhum site externo)
// — pra ser impresso, colado num cartão, no carro etc.
function QrCodeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const publicUrl = `${window.location.origin}${PUBLIC_REQUEST_PATH}`;

  // Mesmo padrão de reset-ao-abrir usado em ReadingDialog/RoutineDialog:
  // ajusta o estado durante a renderização (não num efeito) quando
  // `open` muda de valor.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setCopied(false);
      setDataUrl(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    // Gera só o QR (sem moldura própria) e compõe sobre o template de
    // marca "Conecta Wifi" — o resultado final é uma imagem só, pronta
    // pra imprimir/compartilhar com a identidade visual da empresa.
    async function buildBrandedCard() {
      const [qrDataUrl, template] = await Promise.all([
        QRCode.toDataURL(publicUrl, { width: QR_BOX.size, margin: 1 }),
        loadImage(CARD_TEMPLATE_SRC),
      ]);
      const qrImage = await loadImage(qrDataUrl);
      if (cancelled) return;

      const canvas = document.createElement("canvas");
      canvas.width = template.width;
      canvas.height = template.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D indisponível neste navegador");
      ctx.drawImage(template, 0, 0);
      ctx.drawImage(qrImage, QR_BOX.x, QR_BOX.y, QR_BOX.size, QR_BOX.size);
      if (!cancelled) setDataUrl(canvas.toDataURL("image/png"));
    }

    buildBrandedCard().catch((error) => console.error("Falha ao gerar cartão com QR Code:", error));
    return () => {
      cancelled = true;
    };
  }, [open, publicUrl]);

  function handleCopyLink() {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>QR Code da página de solicitações</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          {dataUrl ? (
            <img
              src={dataUrl}
              alt="Cartão Conecta Wifi com QR Code para a página de solicitação de serviços"
              className="w-full rounded-lg border border-border"
            />
          ) : (
            <div className="flex aspect-[1681/936] w-full items-center justify-center text-sm text-muted-foreground">
              Gerando...
            </div>
          )}
          <p className="break-all text-center text-xs text-muted-foreground">{publicUrl}</p>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" className="gap-1.5" onClick={handleCopyLink}>
            <LinkIcon className="size-4" />
            {copied ? "Copiado!" : "Copiar link"}
          </Button>
          {dataUrl && (
            <Button asChild className="gap-1.5">
              <a href={dataUrl} download="conecta-wifi-qrcode.png">
                <Download className="size-4" />
                Baixar QR Code
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
