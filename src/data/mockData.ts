import type {
  AppDocument,
  CalendarGroup,
  DocumentCategory,
  EquipmentItem,
  Goal,
  Pet,
  ServiceOrder,
  Task,
  Transaction,
} from "@/types";
import { nowInBrasilia } from "@/lib/date";

// Dados de demonstração usados pelo AgendaContext como estado inicial.
// Servem só para o app ter conteúdo visível antes de qualquer integração
// com um backend real. Quando o Supabase estiver configurado
// (ver src/lib/supabaseClient.ts), estes arrays deixam de ser usados.

export const mockCalendars: CalendarGroup[] = [];

export const mockTasks: Task[] = [];

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

// Sem exemplo mockado de propósito: a lista de documentos é criada pelo
// próprio usuário.
export const mockDocuments: AppDocument[] = [];

// Idem: sem pet nenhum pré-cadastrado.
export const mockPets: Pet[] = [];

// Categorias padrão — o usuário pode adicionar mais ou apagar estas.
export const mockDocumentCategories: DocumentCategory[] = [
  { id: "cat-casa", name: "Casa", createdAt: "2026-01-01" },
  { id: "cat-saude", name: "Saúde", createdAt: "2026-01-01" },
];
