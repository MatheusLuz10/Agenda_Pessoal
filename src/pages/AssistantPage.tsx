import { Card, CardContent } from "@/components/ui/card";
import { AssistantChat } from "@/components/assistant/AssistantChat";

// Tela "/assistente" - chat de texto livre para criar tarefas sem abrir
// nenhum formulario. O reconhecimento de data/horario e feito por regras
// (ver src/lib/nlpParser.ts), e o calendario e escolhido manualmente.
export function AssistantPage() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assistente</h1>
        <p className="text-sm text-muted-foreground">
          Crie atividades digitando em linguagem natural.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5">
          <AssistantChat />
        </CardContent>
      </Card>
    </div>
  );
}
