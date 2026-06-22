import * as React from "react";
import { useRef, useState } from "react";
import { Send, Bot, User } from "lucide-react";
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

interface AssistantChatProps {
  // Versão compacta (usada no widget da Home) tem menos altura de
  // histórico, para não dominar a tela inicial.
  compact?: boolean;
}

// Chat de texto livre para criar tarefas sem abrir nenhum formulário,
// reaproveitado tanto na tela "/assistente" (versão cheia) quanto num
// widget na Home (versão compacta). O calendário é escolhido manualmente
// no <Select> — uma tentativa anterior de adivinhar o calendário pelo
// texto (guessCalendarId, ainda em src/lib/nlpParser.ts) causava
// escolhas erradas, por isso voltamos ao seletor explícito.
export function AssistantChat({ compact = false }: AssistantChatProps) {
  const { calendars, addTask, loading } = useAgenda();
  const [calendarId, setCalendarId] = useState(calendars[0]?.id ?? "");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "intro",
      role: "assistant",
      text: 'Oi! Escolha o calendário e me conta um compromisso, tipo "aniversário da Ana dia 1 de abril" ou "dentista amanhã às 9h".',
    },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Garante que o calendário selecionado sempre aponte para um
  // calendário que existe (ex: criado depois desta tela já montada).
  React.useEffect(() => {
    if (calendars.length === 0) {
      if (calendarId) setCalendarId("");
      return;
    }

    if (!calendars.some((calendar) => calendar.id === calendarId)) {
      setCalendarId(calendars[0].id);
    }
  }, [calendars, calendarId]);

  const selectedCalendar = calendars.find((calendar) => calendar.id === calendarId);

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

    if (loading) {
      pushMessage({
        id: `a-${Date.now()}`,
        role: "assistant",
        text: "Ainda estou carregando seus calendÃ¡rios. Tenta de novo em alguns segundos.",
      });
      return;
    }

    if (!selectedCalendar) {
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
      calendarId: selectedCalendar.id,
      title: parsed.title,
      date: parsed.date,
      time: parsed.time ?? undefined,
      priority: "media",
    });

    const when = parsed.time ? `${formatDateBR(parsed.date)} às ${parsed.time}` : formatDateBR(parsed.date);
    pushMessage({
      id: `a-${Date.now()}`,
      role: "assistant",
      text: `Anotado ✅ "${parsed.title}" em ${when}, no calendário ${selectedCalendar.name}.`,
    });
  }

  return (
    <div className={cn("flex flex-col gap-3", compact ? "h-80" : "h-[60vh]")}>
      <div className="flex-1 overflow-y-auto pr-1">
        <div className="flex flex-col gap-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex items-start gap-2", message.role === "user" && "flex-row-reverse")}
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
        <Select value={selectedCalendar?.id} onValueChange={setCalendarId}>
          <SelectTrigger className="sm:w-44" disabled={loading || calendars.length === 0}>
            <SelectValue placeholder={loading ? "Carregando..." : "Calendário"} />
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
          disabled={loading}
        />
        <Button type="submit" className="gap-1.5" disabled={!input.trim() || loading || !selectedCalendar}>
          <Send className="size-4" />
          <span className="hidden sm:inline">Enviar</span>
        </Button>
      </form>
    </div>
  );
}
