import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { fetchUserProfile, saveUserProfile, uploadAvatarPhoto } from "@/data/userProfileApi";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import type { UserProfile } from "@/types";

const AVATAR_SIZE = 64;
const EDITOR_SIZE = 220;

const DEFAULT_PROFILE: UserProfile = { photoUrl: null, photoPositionX: 50, photoPositionY: 50, photoZoom: 1 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// Círculo com a foto "cover"-ajustada via CSS puro (min-width/min-height
// 100% + width/height auto preenche o quadrado sem precisar medir a
// imagem em JS), deslocada por position (0-100, 50 = centralizado) e
// ampliada por zoom — os mesmos três valores salvos no perfil.
function AvatarPhoto({
  src,
  positionX,
  positionY,
  zoom,
  size,
}: {
  src: string;
  positionX: number;
  positionY: number;
  zoom: number;
  size: number;
}) {
  // translate(dx, dy) roda antes de scale() na composição do transform
  // (a lista de funções aplica da direita pra esquerda ao conteúdo do
  // próprio elemento), então dx/dy já ficam em pixels finais — daí dar
  // pra usar diretamente um valor proporcional ao tamanho do círculo
  // exibido (mesma fração, seja no avatar pequeno ou no editor grande).
  const offsetX = ((positionX - 50) / 100) * size;
  const offsetY = ((positionY - 50) / 100) * size;
  return (
    <img
      src={src}
      alt=""
      draggable={false}
      className="absolute left-1/2 top-1/2 max-w-none select-none"
      style={{
        minWidth: "100%",
        minHeight: "100%",
        width: "auto",
        height: "auto",
        transform: `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) scale(${zoom})`,
      }}
    />
  );
}

// Card do topo da tela Início: foto de perfil (clicável para trocar/
// reposicionar) + nome + o que for passado em `children` (ex: a data de
// hoje, que continua sendo formatada pela HomePage).
export function ProfileCard({ children }: { children?: ReactNode }) {
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    fetchUserProfile().then((row) => {
      if (!row) return;
      const { id, ...rest } = row;
      setProfileId(id);
      setProfile(rest);
    });
  }, []);

  async function handleSave(next: UserProfile, file: File | null) {
    let photoUrl = next.photoUrl;
    if (file) photoUrl = await uploadAvatarPhoto(file);
    const finalProfile = { ...next, photoUrl };
    if (isSupabaseConfigured) {
      const saved = await saveUserProfile(profileId, finalProfile);
      const { id, ...rest } = saved;
      setProfileId(id);
      setProfile(rest);
    } else {
      setProfile(finalProfile);
    }
  }

  return (
    <>
      <Card>
        <CardContent className="flex items-center gap-4 pt-5">
          <button
            type="button"
            onClick={() => setIsDialogOpen(true)}
            className="relative shrink-0 overflow-hidden rounded-full border border-border bg-muted"
            style={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
            aria-label="Editar foto de perfil"
          >
            {profile.photoUrl ? (
              <AvatarPhoto
                src={profile.photoUrl}
                positionX={profile.photoPositionX}
                positionY={profile.photoPositionY}
                zoom={profile.photoZoom}
                size={AVATAR_SIZE}
              />
            ) : (
              <div className="flex size-full items-center justify-center text-muted-foreground">
                <Camera className="size-5" />
              </div>
            )}
          </button>
          <div>{children}</div>
        </CardContent>
      </Card>

      <AvatarEditorDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        profile={profile}
        onSave={handleSave}
      />
    </>
  );
}

function AvatarEditorDialog({
  open,
  onOpenChange,
  profile,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: UserProfile;
  onSave: (next: UserProfile, file: File | null) => Promise<void>;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(profile.photoUrl);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [positionX, setPositionX] = useState(profile.photoPositionX);
  const [positionY, setPositionY] = useState(profile.photoPositionY);
  const [zoom, setZoom] = useState(profile.photoZoom);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragState = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);

  // Sempre que o diálogo abre, recomeça do que está salvo (evita carregar
  // um ajuste cancelado da última vez) — reset durante a renderização
  // (padrão recomendado pelo React para "resetar estado quando uma prop
  // muda"), não num efeito, pra não disparar uma renderização em cascata.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setPreviewUrl(profile.photoUrl);
      setPendingFile(null);
      setPositionX(profile.photoPositionX);
      setPositionY(profile.photoPositionY);
      setZoom(profile.photoZoom);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setPositionX(50);
    setPositionY(50);
    setZoom(1);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!previewUrl) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, startPosX: positionX, startPosY: positionY };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragState.current) return;
    const deltaXPercent = ((e.clientX - dragState.current.startX) / EDITOR_SIZE) * 100;
    const deltaYPercent = ((e.clientY - dragState.current.startY) / EDITOR_SIZE) * 100;
    // A foto acompanha o arrasto (como segurar e deslizar uma imagem),
    // por isso o delta é somado à posição.
    setPositionX(clamp(dragState.current.startPosX + deltaXPercent, 0, 100));
    setPositionY(clamp(dragState.current.startPosY + deltaYPercent, 0, 100));
  }

  function handlePointerUp() {
    dragState.current = null;
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ photoUrl: profile.photoUrl, photoPositionX: positionX, photoPositionY: positionY, photoZoom: zoom }, pendingFile);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Foto de perfil</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4">
          <div
            className="relative touch-none overflow-hidden rounded-full border border-border bg-muted"
            style={{ width: EDITOR_SIZE, height: EDITOR_SIZE }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {previewUrl ? (
              <AvatarPhoto src={previewUrl} positionX={positionX} positionY={positionY} zoom={zoom} size={EDITOR_SIZE} />
            ) : (
              <div className="flex size-full items-center justify-center text-muted-foreground">
                <Camera className="size-8" />
              </div>
            )}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
            Escolher foto
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />

          {previewUrl && (
            <div className="flex w-full flex-col gap-1.5">
              <Label htmlFor="avatar-zoom">Zoom</Label>
              <input
                id="avatar-zoom"
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <p className="text-xs text-muted-foreground">Arraste a foto dentro do círculo para ajustar a posição.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !previewUrl}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
