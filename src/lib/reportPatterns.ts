// Lógica pura (sem React) do módulo "Relatórios Padrões": extração de
// campos de uma OS colada como texto e motivos reutilizáveis (botões que
// viram tag no relatório). Padrão de arquivo igual a nlpParser.ts —
// funções isoladas e testáveis, sem estado.

// --- Campos extraídos da OS ---

export interface OsFieldFlags {
  atividade: boolean;
  tipoAtividade: boolean;
  cliente: boolean;
  endereco: boolean;
  numero: boolean;
  complemento: boolean;
  bairro: boolean;
  cidade: boolean;
  designador: boolean;
  idFibra: boolean;
  idCto: boolean;
  fibraPorta: boolean;
  pon: boolean;
  rpon: boolean;
  velocidade: boolean;
}

export type OsFieldKey = keyof OsFieldFlags;

export interface OsFieldGroup {
  title: string;
  fields: { key: OsFieldKey; label: string }[];
}

// Ordem e agrupamento usados tanto na tela de seleção de campos quanto na
// prévia do relatório final.
export const OS_FIELD_GROUPS: OsFieldGroup[] = [
  {
    title: "Atividade",
    fields: [
      { key: "atividade", label: "Atividade / Nº da OS" },
      { key: "tipoAtividade", label: "Tipo de Atividade (se for batimento)" },
    ],
  },
  {
    title: "Cliente",
    fields: [{ key: "cliente", label: "Nome do Cliente" }],
  },
  {
    title: "Endereço",
    fields: [
      { key: "endereco", label: "Endereço" },
      { key: "numero", label: "Número" },
      { key: "complemento", label: "Complemento" },
      { key: "bairro", label: "Bairro" },
      { key: "cidade", label: "Cidade" },
    ],
  },
  {
    title: "Rede / Fibra",
    fields: [
      { key: "designador", label: "Designador" },
      { key: "idFibra", label: "ID Fibra/Acesso" },
      { key: "idCto", label: "ID da CTO (se for batimento de caixa)" },
      { key: "fibraPorta", label: "Fibra/Porta (se for batimento de caixa)" },
      { key: "pon", label: "PON" },
      { key: "rpon", label: "RPON" },
    ],
  },
  {
    title: "Produtos",
    fields: [{ key: "velocidade", label: "Árvore de Produtos (somente os Mbps)" }],
  },
];

export const OS_FIELD_LABELS: Record<OsFieldKey, string> = Object.fromEntries(
  OS_FIELD_GROUPS.flatMap((group) => group.fields.map((field) => [field.key, field.label]))
) as Record<OsFieldKey, string>;

export const DEFAULT_FIELD_FLAGS: OsFieldFlags = Object.fromEntries(
  OS_FIELD_GROUPS.flatMap((group) => group.fields.map((field) => [field.key, true]))
) as unknown as OsFieldFlags;

export type ExtractedOsData = Record<OsFieldKey, string>;

export const EMPTY_EXTRACTED_DATA: ExtractedOsData = Object.fromEntries(
  OS_FIELD_GROUPS.flatMap((group) => group.fields.map((field) => [field.key, ""]))
) as ExtractedOsData;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Procura um rótulo ("Cliente", "Bairro", etc) em qualquer linha do texto
// e devolve o valor associado — na mesma linha após ":" (ex: "Bairro:
// Jurunas") ou na linha seguinte, quando o valor vem embaixo do rótulo
// (ex: "Tipo de Atividade:\nInstalação TV + Banda", formato comum nas
// exportações de OS). Tenta os rótulos candidatos em ordem e para no
// primeiro que encontrar um valor não vazio.
function extractAfterLabels(text: string, labels: string[], excludeNext?: RegExp): string | null {
  for (const label of labels) {
    // O rótulo tem que terminar ali — só ":" ou fim de linha logo depois
    // dele. Sem essa exigência, um rótulo mais longo e parecido (ex:
    // "Endereço de Cobrança:" ao procurar "Endereço", ou "Cliente
    // Corporativo:" ao procurar "Cliente") seria confundido com o rótulo
    // buscado, e o texto sobrando ("de Cobrança:", "Corporativo:") vazaria
    // pro valor extraído.
    const re = new RegExp(`^[ \\t]*${escapeRegExp(label)}[ \\t]*(?::[ \\t]*(.*))?\\r?$`, "im");
    const match = text.match(re);
    if (!match || match.index === undefined) continue;
    if (excludeNext && excludeNext.test(match[0])) continue;

    const sameLine = match[1]?.replace(/\r$/, "").trim();
    if (sameLine) return sameLine;

    const tail = text.slice(match.index + match[0].length);
    const nextLine = tail.match(/^[ \t]*\r?\n[ \t]*([^\r\n]+)/);
    if (nextLine && nextLine[1].trim()) {
      // Alguns textos de OS repetem o rótulo como cabeçalho de seção
      // (ex: uma linha "ENDEREÇO" sozinha, seguida de "Endereço: valor").
      // Sem isso, a linha seguinte seria copiada com o rótulo incluído.
      const repeatedLabel = new RegExp(`^${escapeRegExp(label)}[ \\t]*:?[ \\t]*`, "i");
      const value = nextLine[1].trim().replace(repeatedLabel, "").trim();
      if (value) return value;
    }
  }
  return null;
}

// O número da atividade/OS precisa de uma regra própria: o rótulo
// "Atividade" sozinho colide com "Tipo de Atividade", então exigimos que
// o valor encontrado seja uma sequência de dígitos.
function extractAtividade(text: string): string | null {
  const patterns = [
    /n[ºo°]?\.?\s*da\s*atividade\s*:?\s*(\d{4,})/i,
    /n[ºo°]?\.?\s*(?:da\s*)?os\s*:?\s*(\d{4,})/i,
    /\batividade\s*:?\s*(\d{4,})/i,
    /\bos\s*:?\s*(\d{4,})\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[match.length - 1];
  }
  return null;
}

// Não copia a árvore de produtos inteira: extrai só os valores em Mbps,
// na ordem em que aparecem, sem repetir a mesma velocidade duas vezes.
function extractMbpsSpeeds(text: string): string {
  const matches = text.matchAll(/(\d+(?:[.,]\d+)?)\s*mbps/gi);
  const seen = new Set<string>();
  const speeds: string[] = [];
  for (const match of matches) {
    const value = `${match[1].replace(",", ".")} Mbps`;
    if (!seen.has(value)) {
      seen.add(value);
      speeds.push(value);
    }
  }
  return speeds.join(", ");
}

// PON e RPON são campos separados (cada um com seu próprio checkbox), mas
// às vezes já vêm juntos na OS numa linha só ("PON/RPON:
// 7834566882:77886894") — nesse caso divide pelo ":" para preencher os
// dois. Do contrário, procura "PON" e "RPON" em linhas próprias.
function extractPonAndRpon(text: string): { pon: string | null; rpon: string | null } {
  const combined = extractAfterLabels(text, ["PON/RPON", "PON / RPON"]);
  if (combined) {
    const [pon, rpon] = combined.split(":").map((part) => part.trim());
    return { pon: pon || null, rpon: rpon || null };
  }
  return {
    pon: extractAfterLabels(text, ["PON"]),
    rpon: extractAfterLabels(text, ["RPON"]),
  };
}

// Analisa o texto completo da OS e devolve somente os campos marcados em
// `flags` — tudo que não estiver selecionado fica como string vazia e não
// é sequer procurado no texto.
export function parseOsText(text: string, flags: OsFieldFlags): ExtractedOsData {
  const data: ExtractedOsData = { ...EMPTY_EXTRACTED_DATA };
  if (!text.trim()) return data;

  if (flags.atividade) data.atividade = extractAtividade(text) ?? "";
  if (flags.tipoAtividade) data.tipoAtividade = extractAfterLabels(text, ["Tipo de Atividade"]) ?? "";
  if (flags.cliente) data.cliente = extractAfterLabels(text, ["Nome do Cliente", "Cliente"]) ?? "";
  if (flags.endereco) data.endereco = extractAfterLabels(text, ["Endereço", "Endereco"]) ?? "";
  if (flags.numero) data.numero = extractAfterLabels(text, ["Número", "Numero"]) ?? "";
  if (flags.complemento) data.complemento = extractAfterLabels(text, ["Complemento"]) ?? "";
  if (flags.bairro) data.bairro = extractAfterLabels(text, ["Bairro"]) ?? "";
  if (flags.cidade) data.cidade = extractAfterLabels(text, ["Cidade"]) ?? "";
  if (flags.designador) data.designador = extractAfterLabels(text, ["Designador"]) ?? "";
  if (flags.idFibra) data.idFibra = extractAfterLabels(text, ["ID Fibra/Acesso", "ID Fibra", "Id Fibra/Acesso"]) ?? "";
  if (flags.idCto) data.idCto = extractAfterLabels(text, ["ID da CTO", "ID CTO", "Id da CTO"]) ?? "";
  if (flags.fibraPorta) data.fibraPorta = extractAfterLabels(text, ["Fibra/Porta", "Fibra / Porta"]) ?? "";
  if (flags.pon || flags.rpon) {
    const { pon, rpon } = extractPonAndRpon(text);
    if (flags.pon) data.pon = pon ?? "";
    if (flags.rpon) data.rpon = rpon ?? "";
  }
  if (flags.velocidade) data.velocidade = extractMbpsSpeeds(text);

  return data;
}

// --- Motivo do relatório ---
//
// O motivo é um botão selecionável (ex: "LOCAL FECHADO") que vira uma tag
// "##TEXTO##" no topo do relatório — mesmo estilo do cabeçalho fixo
// "##BATIMENTO DE CAIXA - FIBRASIL##" já usado no relatório de Batimento
// (ReportsPage.tsx). Só um motivo fica ativo por vez.

export interface ReportQuickTag {
  id: string;
  label: string;
}

export const DEFAULT_QUICK_TAGS: ReportQuickTag[] = [
  { id: "local-fechado", label: "LOCAL FECHADO" },
  { id: "endereco-nao-localizado", label: "ENDEREÇO NÃO LOCALIZADO" },
  { id: "acesso-proibido", label: "ACESSO PROIBIDO" },
  { id: "ordem-com-divergencia", label: "ORDEM COM DIVERGÊNCIA" },
];

// --- Prévia / relatório final ---

export interface BuildReportTextParams {
  data: ExtractedOsData;
  flags: OsFieldFlags;
  observation: string;
  activeQuickTags?: string[];
}

// Monta o texto final combinando o motivo selecionado (como tag "##...##"
// no topo), os campos extraídos (só os marcados e com valor preenchido) e
// a descrição livre do técnico.
export function buildReportText({ data, flags, observation, activeQuickTags = [] }: BuildReportTextParams): string {
  const lines: string[] = [];

  // Motivo sempre no topo, no mesmo formato "##TEXTO##" do cabeçalho fixo
  // do relatório de Batimento.
  activeQuickTags.forEach((label) => lines.push(`##${label.trim().toUpperCase()}##`));
  if (activeQuickTags.length > 0) lines.push("");

  const pushField = (label: string, value: string) => {
    if (value.trim()) lines.push(`${label}: ${value.trim()}`);
  };

  if (flags.atividade) pushField("OS", data.atividade);
  if (flags.cliente) pushField("CLIENTE", data.cliente);
  if (flags.endereco || flags.numero) {
    // Cada parte só entra se a própria flag estiver marcada — importante
    // porque o seletor por campo em "Informações identificadas" pode
    // desmarcar só um dos dois independentemente.
    const endereco = [flags.endereco ? data.endereco : "", flags.numero ? data.numero : ""]
      .filter((part) => part.trim())
      .join(", ");
    if (endereco) lines.push(`ENDEREÇO: ${endereco}`);
  }
  if (flags.complemento) pushField("COMPLEMENTO", data.complemento);
  if (flags.bairro) pushField("BAIRRO", data.bairro);
  if (flags.cidade) pushField("CIDADE", data.cidade);

  if (flags.tipoAtividade) pushField("ATIVIDADE", data.tipoAtividade);
  if (flags.velocidade) pushField("VELOCIDADE", data.velocidade);

  if (flags.designador) pushField("DESIGNADOR", data.designador);
  if (flags.idFibra) pushField("ID FIBRA/ACESSO", data.idFibra);
  if (flags.idCto) pushField("ID DA CTO", data.idCto);
  if (flags.fibraPorta) pushField("FIBRA/PORTA", data.fibraPorta);
  if (flags.pon || flags.rpon) {
    // Mesma ideia do Endereço/Número: dois campos selecionáveis
    // separados, mas juntos numa linha só no relatório — com ":" se os
    // dois estiverem marcados, ou só o valor sozinho se for um só.
    const ponRpon = [flags.pon ? data.pon : "", flags.rpon ? data.rpon : ""]
      .filter((part) => part.trim())
      .join(":");
    if (ponRpon) lines.push(`PON/RPON: ${ponRpon}`);
  }

  if (observation.trim()) lines.push("", "DESCRIÇÃO:", observation.trim());

  return lines.join("\n").trim();
}

// --- Persistência local (por técnico) ---
//
// O app não tem escopo por usuário em nenhuma outra tela (todas as
// tabelas do Supabase são compartilhadas entre quem está logado — ver
// supabase/schema.sql), então não existe uma tabela própria para os
// motivos. Para não misturar preferências de técnicos diferentes no
// mesmo navegador, cada chave de localStorage é isolada pelo id (ou
// e-mail, no modo mock sem Supabase) do usuário autenticado.

const STORAGE_PREFIX = "report-patterns";

function storageKey(userId: string, suffix: string): string {
  return `${STORAGE_PREFIX}:${userId}:${suffix}`;
}

export function loadQuickTags(userId: string): ReportQuickTag[] {
  try {
    const raw = localStorage.getItem(storageKey(userId, "quick-tags"));
    if (!raw) return DEFAULT_QUICK_TAGS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_QUICK_TAGS;
  } catch {
    return DEFAULT_QUICK_TAGS;
  }
}

export function saveQuickTags(userId: string, tags: ReportQuickTag[]): void {
  try {
    localStorage.setItem(storageKey(userId, "quick-tags"), JSON.stringify(tags));
  } catch {
    // Idem: motivo criado fica só na sessão atual se o storage falhar.
  }
}

// --- Rascunho da OS em andamento ---
//
// O técnico pode ser interrompido no meio do preenchimento (trocar de
// tela, o navegador recarregar) e não deveria precisar colar a OS de
// novo. O rascunho fica salvo até "Novo relatório" chamar clearDraft.

export interface ReportDraft {
  osText: string;
  data: ExtractedOsData;
  processed: boolean;
  selectedMotiveId: string;
  observation: string;
}

export function loadDraft(userId: string): ReportDraft | null {
  try {
    const raw = localStorage.getItem(storageKey(userId, "draft"));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDraft(userId: string, draft: ReportDraft): void {
  try {
    localStorage.setItem(storageKey(userId, "draft"), JSON.stringify(draft));
  } catch {
    // Rascunho não persistido — a tela continua funcionando nesta sessão.
  }
}

export function clearDraft(userId: string): void {
  try {
    localStorage.removeItem(storageKey(userId, "draft"));
  } catch {
    // Sem problema — o pior caso é o rascunho antigo reaparecer.
  }
}
