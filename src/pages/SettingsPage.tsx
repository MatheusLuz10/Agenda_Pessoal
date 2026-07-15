import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Bell, Moon, Database, Gauge } from "lucide-react";
import { isSupabaseConfigured } from "@/lib/supabaseClient";
import { useOperation } from "@/contexts/OperationContext";
import type { OperationSettings } from "@/types";

// Tela "/configuracoes" — preferências do app. Os toggles aqui ainda são
// "decorativos": guardam estado local mas não plugam em nenhuma lógica
// real de notificações (ficaria para uma próxima etapa).
export function SettingsPage() {
  const [notifications, setNotifications] = useState(true);
  const [overdueAlerts, setOverdueAlerts] = useState(true);
  const [todayAlerts, setTodayAlerts] = useState(true);
  const { settings: operationSettings, updateSettings: updateOperationSettings } = useOperation();

  function patchOperationSettings(patch: Partial<OperationSettings>) {
    updateOperationSettings({ ...operationSettings, ...patch });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground">Preferências do aplicativo.</p>
      </div>

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

      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Gauge className="size-4.5 text-muted-foreground" />
          <CardTitle>Operação</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CardDescription>
            Valores financeiros usados nos cálculos da aba Operação (horas extras e resumo financeiro). Ajustes de
            ciclo e categoria ficam no botão "Ajustes" dentro da própria aba Operação.
          </CardDescription>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="op-base-salary">Salário base (R$)</Label>
              <Input
                id="op-base-salary"
                type="number"
                min={0}
                step="0.01"
                value={operationSettings.baseSalary}
                onChange={(e) => patchOperationSettings({ baseSalary: Number(e.target.value) || 0 })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="op-hazard-pay">Periculosidade (%)</Label>
              <Input
                id="op-hazard-pay"
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={operationSettings.hazardPayPercent}
                onChange={(e) => patchOperationSettings({ hazardPayPercent: Number(e.target.value) || 0 })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="op-weekly-hours">Jornada semanal (horas)</Label>
              <Input
                id="op-weekly-hours"
                type="number"
                min={1}
                step="0.5"
                value={operationSettings.weeklyHours}
                onChange={(e) => patchOperationSettings({ weeklyHours: Number(e.target.value) || 1 })}
              />
              <p className="text-xs text-muted-foreground">Usada para calcular o valor da hora (salário ÷ jornada × 5).</p>
            </div>
          </div>
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
