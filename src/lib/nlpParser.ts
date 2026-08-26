import { MONTH_NAMES_PT, addDays, makeISODate, nextWeekdayISO, pad2, todayISO } from "@/lib/date";

export interface ParsedTask {
  title: string;
  date: string | null; // null quando não conseguimos identificar nenhuma data no texto
  time: string | null; // HH:mm, null quando não há horário explícito
}

// Dias da semana em português, na mesma ordem do JS Date#getDay()
// (0 = domingo). Usado tanto para casar no texto quanto para calcular a
// próxima data correspondente.
const WEEKDAYS_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

// Remove acentos para comparação de texto mais tolerante (ex: usuário
// pode digitar "terca" sem cedilha/acento e ainda assim deve casar).
// Importante: para as letras acentuadas do português, NFD decompõe cada
// caractere em "letra base + marca de acento" (2 unidades) e removê-la
// devolve 1 unidade — ou seja, o resultado tem o MESMO tamanho e os
// MESMOS índices de caractere que o texto original. Isso é o que permite
// usar as posições do match feito em `lower` para cortar o trecho
// equivalente (com acento) do texto original mais abaixo.
function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Palavras-chave comuns associadas a temas de calendário (independente
// dos calendários reais do usuário, que têm nomes livres). Usado por
// guessCalendarId para inferir o calendário certo mesmo quando a frase
// não menciona o nome do calendário literalmente — ex: "veterinário"
// aponta para um calendário chamado "Pets", "prova"/"aula" para um
// chamado "Faculdade", etc.
const CALENDAR_KEYWORDS: Record<string, string[]> = {
  pet: ["veterinario", "cachorro", "gato", "racao", "vacina", "pet"],
  faculdade: ["prova", "aula", "faculdade", "tcc", "professor", "trabalho academico", "universidade"],
  trabalho: ["reuniao", "sprint", "cliente", "projeto", "chefe", "trabalho", "deadline"],
  conta: ["conta", "luz", "agua", "internet", "boleto", "fatura", "aluguel"],
  saude: ["medico", "dentista", "consulta", "exame", "remedio", "saude"],
  pessoal: ["aniversario", "festa", "presente", "familia", "amigo"],
};

// Tenta descobrir, pelo conteúdo da frase, a qual calendário do usuário
// um compromisso pertence — assim o chat (AssistantChat) não precisa de
// um seletor manual. Estratégia, da mais para a menos específica:
//   1) o nome de algum calendário aparece literalmente na frase;
//   2) uma palavra-chave de CALENDAR_KEYWORDS aparece na frase, e existe
//      um calendário cujo nome contém aquele tema (ex: tema "pet" casa
//      com um calendário chamado "Pets");
//   3) nenhum dos dois: devolve null, e quem chamar decide o calendário
//      padrão (ver AssistantChat, que usa o primeiro da lista).
export function guessCalendarId(
  text: string,
  calendars: { id: string; name: string }[]
): string | null {
  if (calendars.length === 0) return null;
  const lower = stripAccents(text.toLowerCase());

  for (const calendar of calendars) {
    const name = stripAccents(calendar.name.toLowerCase());
    if (name.length >= 3 && lower.includes(name)) return calendar.id;
  }

  for (const [theme, keywords] of Object.entries(CALENDAR_KEYWORDS)) {
    if (!keywords.some((keyword) => lower.includes(keyword))) continue;
    const match = calendars.find((c) => stripAccents(c.name.toLowerCase()).includes(theme));
    if (match) return match.id;
  }

  return null;
}

interface Range {
  start: number;
  end: number;
}

// Interpreta uma frase livre em português (ex: "aniversário da Ana dia 1
// de abril às 19h") e tenta extrair três coisas: o título do compromisso,
// a data e o horário. A estratégia é simples e propositalmente sem IA:
// uma sequência de expressões regulares, da mais específica para a mais
// genérica, parando na primeira que casar. Cada trecho reconhecido como
// data/horário é cortado do texto original (por posição, não por texto
// literal) para sobrar só o título.
export function parseTaskFromText(raw: string): ParsedTask {
  const text = raw.trim();
  const lower = stripAccents(text.toLowerCase());

  let date: string | null = null;
  let time: string | null = null;
  const ranges: Range[] = [];

  // --- HORÁRIO ---
  // "às 14h30" / "14h30" / "14:30"
  let m = lower.match(/\b(\d{1,2})[h:](\d{2})\b/);
  if (m && m.index !== undefined) {
    time = `${pad2(Number(m[1]))}:${m[2]}`;
    ranges.push({ start: m.index, end: m.index + m[0].length });
  } else if ((m = lower.match(/\b(\d{1,2})\s?h\b/)) && m.index !== undefined) {
    // "às 14h" / "14h"
    time = `${pad2(Number(m[1]))}:00`;
    ranges.push({ start: m.index, end: m.index + m[0].length });
  } else if ((m = lower.match(/meio[\s-]?dia/))) {
    time = "12:00";
    ranges.push({ start: m.index!, end: m.index! + m[0].length });
  } else if ((m = lower.match(/meia[\s-]?noite/))) {
    time = "00:00";
    ranges.push({ start: m.index!, end: m.index! + m[0].length });
  }

  // --- DATA ---
  // 1) "20/07" ou "20/07/2026" (com "dia" opcional antes, ex: "dia 20/07",
  // que também é cortado do título junto com a data).
  if ((m = lower.match(/(?:dia\s+)?\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/))) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const explicitYear = m[3];
    const year = explicitYear
      ? explicitYear.length === 2
        ? 2000 + Number(explicitYear)
        : Number(explicitYear)
      : new Date().getFullYear();
    let candidate = makeISODate(year, month - 1, day);
    // Sem ano explícito e a data já passou este ano: assume o próximo
    // ano (comum para aniversários e datas recorrentes).
    if (!explicitYear && candidate < todayISO()) {
      candidate = makeISODate(year + 1, month - 1, day);
    }
    date = candidate;
    ranges.push({ start: m.index!, end: m.index! + m[0].length });
  }

  // 2) "dia 1 de abril"
  if (!date) {
    const monthsLower = MONTH_NAMES_PT.map((name) => stripAccents(name.toLowerCase()));
    const re = new RegExp(`dia\\s+(\\d{1,2})\\s+de\\s+(${monthsLower.join("|")})`, "i");
    if ((m = lower.match(re))) {
      const day = Number(m[1]);
      const monthIndex = monthsLower.indexOf(m[2]);
      let candidate = makeISODate(new Date().getFullYear(), monthIndex, day);
      if (candidate < todayISO()) {
        candidate = makeISODate(new Date().getFullYear() + 1, monthIndex, day);
      }
      date = candidate;
      ranges.push({ start: m.index!, end: m.index! + m[0].length });
    }
  }

  // 3) datas relativas: hoje / amanhã / depois de amanhã
  if (!date) {
    if ((m = lower.match(/depois de amanha/))) {
      date = addDays(todayISO(), 2);
      ranges.push({ start: m.index!, end: m.index! + m[0].length });
    } else if ((m = lower.match(/\bamanha\b/))) {
      date = addDays(todayISO(), 1);
      ranges.push({ start: m.index!, end: m.index! + m[0].length });
    } else if ((m = lower.match(/\bhoje\b/))) {
      date = todayISO();
      ranges.push({ start: m.index!, end: m.index! + m[0].length });
    }
  }

  // 4) dia da semana: "segunda", "próxima sexta", "sexta-feira"
  if (!date) {
    for (let i = 0; i < WEEKDAYS_PT.length; i++) {
      const dayName = stripAccents(WEEKDAYS_PT[i]);
      const re = new RegExp(`\\b(proxima\\s+)?${dayName}(-feira)?\\b`);
      if ((m = lower.match(re))) {
        date = nextWeekdayISO(i);
        ranges.push({ start: m.index!, end: m.index! + m[0].length });
        break;
      }
    }
  }

  // --- TÍTULO ---
  // Corta do texto original (com acentos/maiúsculas preservados) cada
  // trecho reconhecido acima, removendo do fim para o começo para os
  // índices anteriores não ficarem desalinhados a cada corte.
  let title = text;
  ranges
    .sort((a, b) => b.start - a.start)
    .forEach(({ start, end }) => {
      title = title.slice(0, start) + title.slice(end);
    });

  // \b não funciona de forma confiável antes/depois de "à" (acentos não
  // contam como caractere de palavra no regex do JS), por isso "às" é
  // removido sem \b e "as" continua usando \b para não cortar palavras
  // como "casa".
  title = title
    .replace(/às/gi, "")
    .replace(/\bas\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s,.-]+|[\s,.-]+$/g, "")
    .trim();
  if (title) title = title.charAt(0).toUpperCase() + title.slice(1);

  return { title: title || text, date, time };
}
