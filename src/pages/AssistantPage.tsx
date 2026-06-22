import * as React from "react";
import { useRef, useState } from "react";
import { Send, Bot, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAgenda } from "@/contexts/AgendaContext";
import { parseTaskFromText } from "@/lib/nlpParser";
import { formatDateBR } from "@/lib/date";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
}

// Tela "/assistente" — chat de texto livre para criar tarefas sem abrir
// nenhum formulário. O reconhecimento de data/horário é feito por
// regras (ver src/lib/nlpParser.ts), não por IA: rápido, gratuito e
// previsível, mas só entende os padrões de frase que o parser conhece
// (datas por extenso/numéricas, dias da semana, "hoje"/"amanhã", horas).
export function AssistantPage() {
  const { calendars, addTask } = useAgenda();
  const [calendarId, setCalendarId] = useState(calendars[0]?.id ?? "");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro",
      role: "assistant",
      text: 'Oi! Me conta um compromisso, tipo "aniversário da Ana dia 1 de abril" ou "dentista amanhã às 9h", que eu já agendo pra você.',
    },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Garante que o calendário selecionado no <Select> sempre aponte para
  // um calendário que existe (ex: se o usuário ainda não tinha nenhum
  // calendário quando a tela montou, e cria um depois).
  React.useEffect(() => {
    if (!calendarId && calendars.length > 0) setCalendarId(calendars[0].id);
  }, [calendars, calendarId]);

  function pushMessage(message: ChatMessage) {
    setMessages((prev) => [...prev, message]);
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;

    pushMessage({ id: `u-${Date.now()}`, role: "user", text });
    setInput("");

    if (!calendarId) {
      pushMessage({
        id: `a-${Date.now()}`,
        role: "assistant",
        text: "Você ainda não tem nenhum calendário. Crie um na tela de Calendários antes de usar o chat.",
      });
      return;
    }

    const parsed = parseTaskFromText(text);

    if (!parsed.date) {
      pushMessage({
        id: `a-${Date.now()}`,
        role: "assistant",
        text: 'Não consegui identificar uma data nessa frase. Tenta incluir algo como "dia 20/07", "amanhã" ou "segunda-feira".',
      });
      return;
    }

    addTask({
      calendarId,
      title: parsed.title,
      date: parsed.date,
      time: parsed.time ?? undefined,
      priority: "media",
    });

    const calendarName = calendars.find((c) => c.id === calendarId)?.name ?? "";
    const when = parsed.time ? `${formatDateBR(parsed.date)} às ${parsed.time}` : formatDateBR(parsed.date);
    pushMessage({
      id: `a-${Date.now()}`,
      role: "assistant",
      text: `Anotado ✅ "${parsed.title}" em ${when}, no calendário ${calendarName}.`,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Assistente</h1>
        <p className="text-sm text-muted-foreground">
          Crie atividades digitando em linguagem natural.
        </p>
      </div>

      <Card>
        <CardContent className="flex h-[60vh] flex-col gap-3 pt-5">
          <div className="flex-1 overflow-y-auto pr-1">
            <div className="flex flex-col gap-3">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex items-start gap-2",
                    message.role === "user" && "flex-row-reverse"
                  )}
                >
                  <div
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-full",
                      message.role === "user" ? "bg-primary text-primary-foreground" : "bg-accent"
                    )}
                  >
                    {message.role === "user" ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
                  </div>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-xl px-3 py-2 text-sm",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-accent text-accent-foreground"
                    )}
                  >
                    {message.text}
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row">
            <Select value={calendarId} onValueChange={setCalendarId}>
              <SelectTrigger className="sm:w-44">
                <SelectValue placeholder="Calendário" />
              </SelectTrigger>
              <SelectContent>
                {calendars.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder='Ex: "aniversário da Ana dia 1 de abril"'
              className="flex-1"
            />
            <Button type="submit" className="gap-1.5" disabled={!input.trim()}>
              <Send className="size-4" />
              <span className="hidden sm:inline">Enviar</span>
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
