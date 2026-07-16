// OCR gratuito (roda no navegador, sem API paga) usado para ler prints do
// app de ponto "Meus Registros" (modelo padrão confirmado pelo usuário).
// Import dinâmico: a lib só é baixada quando o usuário realmente usa
// "Importar ponto", em vez de inflar o bundle inicial.
//
// Regra combinada com o técnico (jornada padrão sempre começa às 08:00):
// a Entrada NÃO é lida da imagem — fica fixa em "08:00" (editável se o
// dia tiver sido diferente). Só os 3 últimos horários da leitura entram,
// na ordem em que aparecem: início do almoço, fim do almoço e saída. Isso
// evita confundir a posição de cada horário, já que a tela também mostra
// o relógio da barra de status do celular no topo (ex: "18:26" — sempre o
// primeiro horário do texto reconhecido, descartado antes de tudo).

export interface ExtractedPunch {
  clockIn?: string;
  lunchStart?: string;
  lunchEnd?: string;
  clockOut?: string;
  // Todos os horários de registro encontrados (sem o relógio da barra de
  // status), em ordem cronológica — útil pra depurar uma leitura ruim.
  times: string[];
}

// Entrada padrão da jornada (ver comentário acima) — só um valor inicial,
// sempre editável depois de lido.
const DEFAULT_CLOCK_IN = "08:00";

// Só ":" como separador (ex: "07:56") — é assim que o app mostra os
// horários de ponto. Aceitar "." também pegava números que não são
// horário nenhum, como a versão do app no rodapé da tela ("2.1.56").
const TIME_PATTERN = /([01]?\d|2[0-3]):([0-5]\d)/g;

function normalizeTime(hours: string, minutes: string): string {
  return `${hours.padStart(2, "0")}:${minutes}`;
}

// Lógica pura de parsing (texto -> horários rotulados), separada da
// chamada ao Tesseract para poder ser testada sem depender de OCR real
// (ver ocr.test.ts).
export function parsePunchText(text: string): ExtractedPunch {
  const matches: { time: string; index: number }[] = [];
  let match: RegExpExecArray | null;
  TIME_PATTERN.lastIndex = 0;
  while ((match = TIME_PATTERN.exec(text))) {
    matches.push({ time: normalizeTime(match[1], match[2]), index: match.index });
  }

  // Descarta o relógio da barra de status do celular: nessa tela ele é
  // sempre o primeiro horário reconhecido no texto, antes de qualquer
  // registro de ponto de verdade — por isso é descartado sem condição.
  const records = matches.slice(1);

  // Os 3 últimos viram início do almoço / fim do almoço / saída, sempre
  // ancorados a partir do FIM da lista (não do início): assim, se o OCR
  // deixar passar um horário do meio (ex: não leu o início do almoço numa
  // foto com ruído/compressão), a saída e o fim do almoço — os últimos —
  // continuam corretos, e só o que faltou fica em branco pra completar
  // manualmente. Ancorar pelo início faria o "buraco" empurrar todo o
  // resto pra posição errada.
  const clockOut = records.at(-1)?.time;
  const lunchEnd = records.length >= 2 ? records.at(-2)?.time : undefined;
  const lunchStart = records.length >= 3 ? records.at(-3)?.time : undefined;

  return {
    clockIn: DEFAULT_CLOCK_IN,
    lunchStart,
    lunchEnd,
    clockOut,
    times: records.map((r) => r.time),
  };
}

// Aumenta a imagem (2x) antes de mandar pro OCR: prints de celular
// comprimidos (JPEG) costumam ter texto pequeno com artefato de
// compressão, e isso derruba a precisão do Tesseract em números como
// "12:02". Upscaling simples melhora bastante o reconhecimento. Se por
// algum motivo o pré-processamento falhar, cai de volta pro arquivo
// original em vez de travar a importação.
async function preprocessImage(file: File): Promise<File | Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width * scale;
    canvas.height = bitmap.height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    return blob ?? file;
  } catch {
    return file;
  }
}

export async function extractPunchFromImage(file: File): Promise<ExtractedPunch> {
  const { recognize } = await import("tesseract.js");
  const preprocessed = await preprocessImage(file);
  const { data } = await recognize(preprocessed, "por");
  return parsePunchText(data.text);
}
