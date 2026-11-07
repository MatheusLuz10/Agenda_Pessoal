// Tipos compartilhados do app. Ficam num arquivo só para que qualquer
// componente, página ou contexto possa importar a mesma "fonte da verdade"
// sobre o formato dos dados (evita duplicar/diverguir definições).

export type Priority = "baixa" | "media" | "alta";

export type TaskStatus = "pendente" | "concluida";

// Uma tarefa/atividade dentro de um calendário específico.
export interface Task {
  id: string;
  calendarId: string; // FK lógica: a qual calendário esta tarefa pertence
  title: string;
  description?: string;
  date: string; // ISO date string (yyyy-MM-dd)
  time?: string; // HH:mm
  priority: Priority;
  observation?: string;
  status: TaskStatus;
}

// Um calendário independente (ex: "Faculdade", "Pets", "Contas").
// Cada um agrupa suas próprias tarefas via Task.calendarId.
export interface CalendarGroup {
  id: string;
  name: string;
  icon: string; // emoji exibido como ícone do calendário
  color: string; // token de cor (ex: "blue", "rose") usado no seletor de cor
  startDate?: string;
  endDate?: string;
  observation?: string;
  createdAt: string;
}

// --- Controle financeiro ("Conta") ---

export type TransactionType = "entrada" | "saida";

export type RecurrenceFrequency = "mensal" | "semanal" | "anual";

export const TRANSACTION_CATEGORIES = [
  "Salário",
  "Hora Extra",
  "Alimentação",
  "Moradia",
  "Educação",
  "Saúde",
  "Transporte",
  "Lazer",
  "Investimentos",
  "Outros",
] as const;

export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number];

// Um lançamento financeiro (entrada ou saída). Independente dos
// calendários de tarefas, mas também tem uma data associada.
export interface Transaction {
  id: string;
  type: TransactionType;
  description: string;
  amount: number; // sempre positivo; o sinal é dado por `type`
  category: TransactionCategory;
  date: string; // ISO date string (yyyy-MM-dd)
  observation?: string;
  recurrent: boolean;
  recurrenceFrequency?: RecurrenceFrequency; // presente só quando recurrent === true
  createdAt: string;
}

// Uma meta de economia (ex: "Notebook novo", R$ 2.000 guardados de R$ 5.000).
export interface Goal {
  id: string;
  name: string;
  targetAmount: number;
  savedAmount: number;
  createdAt: string;
}

// --- Meu trabalho (equipamentos, manutenção e OSs) ---

export type EquipmentCategory = "manutencao" | "epis" | "conectores";

export type EquipmentCondition = "Bom" | "Médio" | "Defeituoso";

// Um item de manutenção do carro, EPI ou conector/ferramenta de fusão.
export interface EquipmentItem {
  id: string;
  name: string;
  category: EquipmentCategory;
  condition: EquipmentCondition;
  observation: string;
  createdAt: string;
}

// Registro de troca de um item que estava "Defeituoso" (botão "Registrar
// troca" no Card "Controle" da aba Meu trabalho). Guarda o nome do item
// na hora da troca (não só a referência) pra continuar aparecendo no
// relatório de defeitos mesmo que o item original seja excluído depois.
export interface EquipmentReplacement {
  id: string;
  itemId: string | null;
  itemName: string;
  category: EquipmentCategory;
  observation: string;
  replacedAt: string; // ISO date string (yyyy-MM-dd)
  createdAt: string;
}

export type ServiceOrderStatus = "pendente" | "em_andamento" | "concluida";

// Uma OS (Ordem de Serviço): o atendimento feito num cliente/local em
// uma data específica.
export interface ServiceOrder {
  id: string;
  client: string;
  description: string;
  date: string; // ISO date string (yyyy-MM-dd)
  status: ServiceOrderStatus;
  observation: string;
  createdAt: string;
}

// Perfil do usuário (nome + foto), editado na tela Configurações. Linha
// única. photoPositionX/Y ficam em 0-100 (50 = centralizado); photoZoom
// em 1-3.
export interface UserProfile {
  name: string;
  photoUrl: string | null;
  photoPositionX: number;
  photoPositionY: number;
  photoZoom: number;
}

// --- Solicitações de Serviços (única parte pública do app) ---

export const SERVICE_REQUEST_TYPES = [
  "Instalação de Câmeras",
  "Manutenção de Câmeras",
  "Manutenção em Computador",
  "Manutenção no Wi-Fi",
  "Instalação de Roteador",
  "Instalação de Repetidor",
  "Passagem de Cabo",
  "Viabilidade para Instalação",
  "Outro",
] as const;

export type ServiceRequestType = (typeof SERVICE_REQUEST_TYPES)[number];

export type ServiceRequestStatus =
  | "nova"
  | "em_analise"
  | "agendada"
  | "em_atendimento"
  | "concluida"
  | "cancelada";

export const SERVICE_REQUEST_STATUS_LABELS: Record<ServiceRequestStatus, string> = {
  nova: "Nova Solicitação",
  em_analise: "Em Análise",
  agendada: "Agendada",
  em_atendimento: "Em Atendimento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export interface ServiceRequestPhoto {
  id: string;
  url: string;
}

// Resultado da consulta pública de andamento (página "/solicitar-servico",
// aba "Consultar andamento"): o cliente informa o código (requestNumber,
// ex: "07/2026-013") e recebe só o essencial pra acompanhar o chamado —
// sem dados de contato de ninguém e sem as observações internas do
// técnico (essas nunca saem da área privada), ver função
// lookup_service_request no schema.sql.
export interface ServiceRequestLookup {
  requestNumber: string;
  serviceType: string;
  status: ServiceRequestStatus;
  description: string;
  createdAt: string;
}

// Um chamado aberto pelo cliente na página pública. `requestNumber` vem
// pronto do banco (trigger set_service_request_number, formato
// "MM/AAAA-NNN") — o cliente nunca calcula isso.
export interface ServiceRequest {
  id: string;
  requestNumber: string;
  clientName: string;
  company: string | null;
  phone: string;
  address: string;
  serviceType: string;
  description: string;
  status: ServiceRequestStatus;
  observations: string | null;
  photos: ServiceRequestPhoto[];
  createdAt: string;
}

// --- Documentos (aba "Documentos", sub-abas dinâmicas + "Pets" fixa) ---

// Uma categoria de documento (ex: "Casa", "Saúde") — lista aberta, o
// usuário cria as suas próprias além das padrão. "Pets" NÃO é uma
// categoria daqui: é uma sub-aba fixa à parte, com comportamento
// diferente (cadastro de pet, não só uma lista de documentos).
export interface DocumentCategory {
  id: string;
  name: string;
  createdAt: string;
}

export type PetSpecies = "Gato" | "Cachorro";

// Um pet cadastrado na sub-aba "Pets" — perfil simples, sem checklist nem
// campo por tipo (isso já foi tentado e era complexidade demais pro que
// era pedido).
export interface Pet {
  id: string;
  name: string;
  species: PetSpecies;
  breed: string; // raça, opcional
  color: string; // cor, opcional
  notes: string; // outras informações, opcional
  createdAt: string;
}

// Um documento guardado — só nome + arquivo (foto tirada na hora ou PDF
// anexado). Pertence OU a uma categoria (categoryId) OU a um pet (petId)
// — nunca os dois.
export interface AppDocument {
  id: string;
  categoryId: string | null;
  petId: string | null;
  name: string;
  fileUrl: string;
  fileName: string;
  createdAt: string;
}
