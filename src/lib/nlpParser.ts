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
