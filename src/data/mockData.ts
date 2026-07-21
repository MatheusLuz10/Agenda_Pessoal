import type {
  CalendarGroup,
  EquipmentItem,
  Goal,
  OperationActivity,
  OperationSettings,
  PunchRecord,
  ServiceOrder,
  Tag,
  Task,
  Transaction,
} from "@/types";
import { nowInBrasilia } from "@/lib/date";

// Dados de demonstração usados pelo AgendaContext como estado inicial.
// Servem só para o app ter conteúdo visível antes de qualquer integração
// com um backend real. Quando o Supabase estiver configurado
// (ver src/lib/supabaseClient.ts), estes arrays deixam de ser usados.

export const mockTags: Tag[] = [
  { id: "tag-urgente", name: "Urgente", color: "#ef4444" },
  { id: "tag-faculdade", name: "Faculdade", color: "#3b82f6" },
  { id: "tag-casa", name: "Casa", color: "#f97316" },
];

export const mockCalendars: CalendarGroup[] = [
  {
    id: "cal-faculdade",
    name: "Faculdade",
    icon: "📚",
    color: "blue",
    startDate: "2026-02-01",
    endDate: "2026-12-15",
    observation: "Semestre 2026/1",
    createdAt: "2026-01-15",
  },
  {
    id: "cal-pets",
    name: "Pets",
    icon: "🐶",
    color: "amber",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    observation: "Cuidados do Bidu e da Mel",
    createdAt: "2026-01-10",
  },
  {
    id: "cal-trabalho",
    name: "Trabalho",
    icon: "💼",
    color: "violet",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    createdAt: "2026-01-05",
  },
  {
    id: "cal-contas",
    name: "Contas",
    icon: "💡",
    color: "rose",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    observation: "Contas fixas mensais",
    createdAt: "2026-01-02",
  },
  {
    id: "cal-pessoal",
    name: "Pessoal",
    icon: "🌿",
    color: "emerald",
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    createdAt: "2026-01-02",
  },
];

export const mockTasks: Task[] = [
  {
    id: "t1",
    calendarId: "cal-faculdade",
    title: "Entrega Trabalho ADS",
    description: "Projeto final da disciplina de Engenharia de Software",
    date: "2026-06-20",
    time: "23:59",
    priority: "alta",
    status: "pendente",
    tags: [],
  },
  {
    id: "t2",
    calendarId: "cal-faculdade",
    title: "Estudar prova de lógica",
    date: "2026-06-20",
    time: "19:00",
    priority: "media",
    status: "pendente",
    tags: [],
  },
  {
    id: "t3",
    calendarId: "cal-pets",
    title: "Veterinário",
    description: "Levar o Bidu para vacina anual",
    date: "2026-06-22",
    time: "10:00",
    priority: "alta",
    status: "pendente",
    tags: [],
  },
  {
    id: "t4",
    calendarId: "cal-contas",
    title: "Conta de Luz",
    date: "2026-06-25",
    priority: "media",
    status: "pendente",
    tags: [],
  },
  {
    id: "t5",
    calendarId: "cal-trabalho",
    title: "Reunião de sprint",
    date: "2026-06-19",
    time: "14:00",
    priority: "media",
    status: "pendente",
    tags: [],
  },
  {
    id: "t6",
    calendarId: "cal-contas",
    title: "Conta de Internet",
    date: "2026-06-15",
    priority: "alta",
    status: "pendente",
    tags: [],
  },
  {
    id: "t7",
    calendarId: "cal-pessoal",
    title: "Aniversário da Ana",
    date: "2026-06-28",
    priority: "baixa",
    status: "pendente",
    tags: [],
  },
  {
    id: "t8",
    calendarId: "cal-pets",
    title: "Comprar ração",
    date: "2026-06-19",
    priority: "baixa",
    status: "concluida",
    tags: [],
  },
  {
    id: "t9",
    calendarId: "cal-faculdade",
    title: "Apresentação de TCC",
    date: "2026-07-03",
    priority: "alta",
    status: "pendente",
    tags: [],
  },
];

export const mockTransactions: Transaction[] = [
  {
    id: "tr1",
    type: "entrada",
    description: "Salário",
    amount: 2800,
    category: "Salário",
    date: "2026-06-05",
    recurrent: true,
    recurrenceFrequency: "mensal",
    createdAt: "2026-06-05",
  },
  {
    id: "tr2",
    type: "saida",
    description: "Faculdade",
    amount: 280,
    category: "Educação",
    date: "2026-06-10",
    recurrent: true,
    recurrenceFrequency: "mensal",
    createdAt: "2026-06-10",
  },
  {
    id: "tr3",
    type: "saida",
    description: "Internet",
    amount: 100,
    category: "Moradia",
    date: "2026-06-15",
    recurrent: true,
    recurrenceFrequency: "mensal",
    createdAt: "2026-06-15",
  },
  {
    id: "tr4",
    type: "saida",
    description: "Mercado",
    amount: 350,
    category: "Alimentação",
    date: "2026-06-18",
    recurrent: false,
    createdAt: "2026-06-18",
  },
  {
    id: "tr5",
    type: "saida",
    description: "Conta de Luz",
    amount: 180,
    category: "Moradia",
    date: "2026-06-25",
    recurrent: true,
    recurrenceFrequency: "mensal",
    createdAt: "2026-06-12",
  },
  {
    id: "tr6",
    type: "saida",
    description: "Cinema",
    amount: 60,
    category: "Lazer",
    date: "2026-06-14",
    recurrent: false,
    createdAt: "2026-06-14",
  },
  {
    id: "tr7",
    type: "saida",
    description: "Uber",
    amount: 45,
    category: "Transporte",
    date: "2026-06-08",
    recurrent: false,
    createdAt: "2026-06-08",
  },
  {
    id: "tr8",
    type: "entrada",
    description: "Hora extra",
    amount: 320,
    category: "Hora Extra",
    date: "2026-06-20",
    recurrent: false,
    createdAt: "2026-06-20",
  },
  {
    id: "tr9",
    type: "saida",
    description: "Plano de saúde",
    amount: 220,
    category: "Saúde",
    date: "2026-05-10",
    recurrent: true,
    recurrenceFrequency: "mensal",
    createdAt: "2026-05-10",
  },
  {
    id: "tr10",
    type: "entrada",
    description: "Salário",
    amount: 2800,
    category: "Salário",
    date: "2026-05-05",
    recurrent: true,
    recurrenceFrequency: "mensal",
    createdAt: "2026-05-05",
  },
  {
    id: "tr11",
    type: "saida",
    description: "Aporte investimento",
    amount: 400,
    category: "Investimentos",
    date: "2026-05-20",
    recurrent: false,
    createdAt: "2026-05-20",
  },
];

// Datas relativas a hoje, para os dados de exemplo das OSs sempre caírem
// numa mistura de "esta semana" e "fora da semana" independente de quando
// o app for aberto.
function relativeISO(offsetDays: number): string {
  const date = nowInBrasilia();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export const mockEquipmentItems: EquipmentItem[] = [
  {
    id: "eq-1",
    name: "Multímetro digital",
    category: "epis",
    condition: "Bom",
    observation: "Calibrado na semana passada.",
    createdAt: "2026-06-01",
  },
  {
    id: "eq-2",
    name: "Estação de fusão",
    category: "conectores",
    condition: "Médio",
    observation: "Precisa revisão no cabo de alimentação.",
    createdAt: "2026-06-02",
  },
  {
    id: "eq-3",
    name: "Óleo do motor",
    category: "manutencao",
    condition: "Bom",
    observation: "Reposição feita no último atendimento.",
    createdAt: "2026-06-03",
  },
  {
    id: "eq-4",
    name: "Luva de isolamento",
    category: "epis",
    condition: "Defeituoso",
    observation: "Par de luvas com rasgo na palma.",
    createdAt: "2026-06-04",
  },
];

export const mockServiceOrders: ServiceOrder[] = [
  {
    id: "os-1",
    client: "Condomínio Vista Verde",
    description: "Instalação de fibra óptica",
    date: relativeISO(0),
    status: "concluida",
    observation: "",
    createdAt: relativeISO(0),
  },
  {
    id: "os-2",
    client: "Maria Fernandes",
    description: "Troca de roteador",
    date: relativeISO(-1),
    status: "concluida",
    observation: "Cliente relatou queda de sinal intermitente.",
    createdAt: relativeISO(-1),
  },
  {
    id: "os-3",
    client: "Padaria Pão Quente",
    description: "Reparo de conector rompido",
    date: relativeISO(-2),
    status: "em_andamento",
    observation: "Aguardando peça de reposição.",
    createdAt: relativeISO(-2),
  },
  {
    id: "os-4",
    client: "João Pedro",
    description: "Manutenção preventiva de rede interna",
    date: relativeISO(1),
    status: "pendente",
    observation: "",
    createdAt: relativeISO(1),
  },
  {
    id: "os-5",
    client: "Auto Peças Veloz",
    description: "Instalação de ponto de rede adicional",
    date: relativeISO(-10),
    status: "concluida",
    observation: "OS de referência, fora da semana atual.",
    createdAt: relativeISO(-10),
  },
];

export const mockGoals: Goal[] = [
  {
    id: "goal1",
    name: "Notebook novo",
    targetAmount: 5000,
    savedAmount: 2000,
    createdAt: "2026-03-01",
  },
  {
    id: "goal2",
    name: "Viagem de fim de ano",
    targetAmount: 3000,
    savedAmount: 450,
    createdAt: "2026-05-01",
  },
];

export const mockOperationActivities: OperationActivity[] = [
  { id: "act-1", type: "BA", date: relativeISO(0), quantity: 3, createdAt: relativeISO(0) },
  { id: "act-2", type: "BD", date: relativeISO(0), quantity: 1, createdAt: relativeISO(0) },
  { id: "act-3", type: "BA", date: relativeISO(-1), quantity: 4, createdAt: relativeISO(-1) },
  { id: "act-4", type: "BA", date: relativeISO(-2), quantity: 2, createdAt: relativeISO(-2) },
  { id: "act-5", type: "BD", date: relativeISO(-2), quantity: 2, createdAt: relativeISO(-2) },
  { id: "act-6", type: "BA", date: relativeISO(-3), quantity: 5, createdAt: relativeISO(-3) },
];

export const mockOperationPunches: PunchRecord[] = [
  {
    id: "punch-1",
    date: relativeISO(-1),
    clockIn: "08:00",
    lunchStart: "12:00",
    lunchEnd: "13:00",
    clockOut: "18:30",
    createdAt: relativeISO(-1),
  },
];

export const mockOperationSettings: OperationSettings = {
  cycleStartDay: 11,
  cycleEndDay: 20,
  baseSalary: 2200,
  hazardPayPercent: 30,
  weeklyHours: 44,
  effectivenessPercent: 0,
};
