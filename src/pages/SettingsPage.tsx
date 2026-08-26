import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { Bell, Moon, Database, User } from "lucide-react";
import { AvatarPicker } from "@/components/profile/AvatarPicker";
import { fetchUserProfile, saveUserProfile, uploadAvatarPhoto } from "@/data/userProfileApi";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { getDisplayName, setDisplayName } from "@/lib/userProfile";
import type { UserProfile } from "@/types";

const DEFAULT_PROFILE: UserProfile = { name: "", photoUrl: null, photoPositionX: 50, photoPositionY: 50, photoZoom: 1 };

// Tela "/configuracoes" — preferências do app. Os toggles aqui ainda são
// "decorativos": guardam estado local mas não plugam em nenhuma lógica
// real de notificações (ficaria para uma próxima etapa).
export function SettingsPage() {
  const [notifications, setNotifications] = useState(true);
  const [overdueAlerts, setOverdueAlerts] = useState(true);
  const [todayAlerts, setTodayAlerts] = useState(true);

  // Perfil (nome + foto): sem Supabase configurado, o nome vive só no
  // localStorage (ver lib/userProfile.ts) — mesma limitação de sempre,
  // não sincroniza entre dispositivos/navegadores. Com Supabase, nome e
  // foto ficam na mesma linha da tabela user_profile.
  const [profileId, setProfileId] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile>(() => ({ ...DEFAULT_PROFILE, name: getDisplayName() }));

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    fetchUserProfile().then((row) => {
      if (!row) return;
      const { id, ...rest } = row;
      setProfileId(id);
      setProfile(rest);
      setDisplayName(rest.name);
    });
  }, []);

  function handleNameChange(value: string) {
    setProfile((prev) => ({ ...prev, name: value }));
    setDisplayName(value);
  }

  function persistName() {
    if (!isSupabaseConfigured) return;
    saveUserProfile(profileId, profile)
      .then((saved) => {
        const { id, ...rest } = saved;
        setProfileId(id);
        setProfile(rest);
      })
      .catch((error) => console.error("Falha ao salvar nome de perfil:", error));
  }

  async function handleAvatarSave(
    next: Pick<UserProfile, "photoUrl" | "photoPositionX" | "photoPositionY" | "photoZoom">,
    file: File | null
  ) {
    let photoUrl = next.photoUrl;
    if (file) photoUrl = await uploadAvatarPhoto(file);
    const finalProfile = { ...profile, ...next, photoUrl };
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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Preferências do aplicativo.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <User className="size-4.5 text-muted-foreground" />
          <CardTitle>Perfil</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-4">
          <AvatarPicker profile={profile} onSave={handleAvatarSave} />
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="profile-name">Seu nome</Label>
            <Input
              id="profile-name"
              value={profile.name}
              onChange={(e) => handleNameChange(e.target.value)}
              onBlur={persistName}
              placeholder="Ex: Matheus"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Bell className="size-4.5 text-muted-foreground" />
          <CardTitle>Notificações</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SettingRow
            label="Avisos de tarefas"
            description="Receber avisos sobre tarefas próximas."
            checked={notifications}
            onChange={setNotifications}
          />
          <SettingRow
            label="Destacar tarefas vencidas"
            description="Mostrar tarefas atrasadas em vermelho."
            checked={overdueAlerts}
            onChange={setOverdueAlerts}
          />
          <SettingRow
            label="Destacar tarefas do dia"
            description="Mostrar tarefas de hoje em amarelo."
            checked={todayAlerts}
            onChange={setTodayAlerts}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Moon className="size-4.5 text-muted-foreground" />
          <CardTitle>Aparência</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription>
            O tema claro está ativo. Suporte a tema escuro já está preparado na base de estilos.
          </CardDescription>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Database className="size-4.5 text-muted-foreground" />
          <CardTitle>Dados</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription>
            {isSupabaseConfigured
              ? "Conectado ao Supabase: calendários e tarefas são salvos na nuvem."
              : "Nenhum projeto Supabase configurado: os dados exibidos são mockados localmente e se perdem ao recarregar a página. Preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em um arquivo .env.local (veja .env.example) para persistir os dados de verdade."}
          </CardDescription>
        </CardContent>
      </Card>
    </div>
  );
}

// Uma linha de configuração: rótulo + descrição à esquerda, checkbox à
// direita. Extraído como componente porque o padrão se repete 3 vezes.
function SettingRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <Label>{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(Boolean(v))} />
    </div>
  );
}
