/**
 * Catálogo v1 do Agente Orçamentista: tipos de evento → categorias → itens → perguntas.
 * Dados puros (sem I/O) para a entrevista determinística. Versionado: nunca edite um
 * código existente; crie v2 quando a semântica mudar.
 */
import type { EventType } from "@/lib/engine/types";

export const CATALOG_VERSION = "catalog-v1";

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  festa_infantil: "Festa infantil",
  quinze_anos: "15 anos",
  casamento: "Casamento",
  aniversario: "Aniversário",
  batizado: "Batizado",
  formatura: "Formatura",
  corporativo: "Corporativo (confraternização, convenção ou lançamento)",
};

export const ALL_EVENT_TYPES = Object.keys(EVENT_TYPE_LABELS) as EventType[];

export const VALE_DO_PARAIBA_CITIES = [
  "São José dos Campos",
  "Taubaté",
  "Jacareí",
  "Pindamonhangaba",
  "Caçapava",
  "Guaratinguetá",
  "Lorena",
  "Campos do Jordão",
  "Tremembé",
  "Aparecida",
  "Cruzeiro",
  "Caraguatatuba",
  "Ubatuba",
  "São Sebastião",
  "Ilhabela",
  "Santa Branca",
  "Paraibuna",
  "Monteiro Lobato",
] as const;

export type CategoryCode =
  | "espaco"
  | "buffet"
  | "bebidas"
  | "bolo_doces"
  | "decoracao"
  | "foto_video"
  | "som_dj"
  | "musica_ao_vivo"
  | "banda"
  | "cantor_cerimonia"
  | "barman"
  | "iluminacao"
  | "mobiliario"
  | "garcons"
  | "louca"
  | "limpeza"
  | "seguranca"
  | "transporte"
  | "gerador"
  | "cerimonial"
  | "recreacao"
  | "convites"
  | "lembrancinhas"
  | "audiovisual"
  | "outros";

export const CATEGORY_LABELS: Record<CategoryCode, string> = {
  espaco: "Local / espaço",
  buffet: "Buffet",
  bebidas: "Bebidas",
  bolo_doces: "Bolo e doces",
  decoracao: "Decoração",
  foto_video: "Foto e vídeo",
  som_dj: "Som e DJ",
  musica_ao_vivo: "Música ao vivo",
  banda: "Banda",
  cantor_cerimonia: "Cantor de cerimônia",
  barman: "Barman / bar",
  iluminacao: "Iluminação",
  mobiliario: "Mobiliário",
  garcons: "Garçons e copeiras",
  louca: "Louça, talheres e toalhas",
  limpeza: "Limpeza",
  seguranca: "Segurança e portaria",
  transporte: "Transporte de convidados",
  gerador: "Gerador de energia",
  cerimonial: "Cerimonial / assessoria",
  recreacao: "Recreação infantil",
  convites: "Convites",
  lembrancinhas: "Lembrancinhas e brindes",
  audiovisual: "Telão, projetor e microfones",
  outros: "Demanda específica",
};

/**
 * Categorias legadas/variações de texto → categoria canônica atual.
 * Mantém cotações e fornecedores antigos (ex.: "musica_ao_vivo") cobrindo a
 * necessidade nova ("banda") sem migração destrutiva de dados.
 */
export const CATEGORY_ALIASES: Partial<Record<string, CategoryCode>> = {
  musica_ao_vivo: "banda",
  musica: "banda",
  cantor: "cantor_cerimonia",
  cantores: "cantor_cerimonia",
  bartender: "barman",
  bar: "barman",
  dj: "som_dj",
};

export function normalizeCategoryCode(raw: string): CategoryCode | null {
  const t = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
  const alias = CATEGORY_ALIASES[t];
  if (alias !== undefined) return alias;
  if (t in CATEGORY_LABELS) return t as CategoryCode;
  return null;
}

/**
 * Tags de "inclui" no nível do FORNECEDOR (não da cotação): o que o serviço
 * entrega por padrão. São complementares ao escopo extraído de cada resposta e
 * ajudam a detectar, por exemplo, um buffet que só inclui comida.
 */
export const SUPPLIER_INCLUI_TAGS = [
  "comida",
  "servico",
  "louca",
  "bebidas",
  "som",
  "iluminacao",
  "decoracao",
  "bolo_doces",
  "mesas_cadeiras",
  "limpeza",
  "seguranca",
  "gerador",
  "estacionamento",
  "barman",
  "banda",
  "cantor_cerimonia",
] as const;

export type SupplierIncluiTag = (typeof SUPPLIER_INCLUI_TAGS)[number];

export const SUPPLIER_INCLUI_LABELS: Record<SupplierIncluiTag, string> = {
  comida: "comida",
  servico: "serviço (garçons e copeiras)",
  louca: "louça, talheres e taças",
  bebidas: "bebidas",
  som: "som",
  iluminacao: "iluminação",
  decoracao: "decoração",
  bolo_doces: "bolo e doces",
  mesas_cadeiras: "mesas e cadeiras",
  limpeza: "limpeza",
  seguranca: "segurança",
  gerador: "gerador",
  estacionamento: "estacionamento",
  barman: "barman",
  banda: "banda",
  cantor_cerimonia: "cantor de cerimônia",
};

/** Tag de "inclui" → categoria que ela dispensa contratar à parte. */
export const SUPPLIER_INCLUI_COVERS: Partial<Record<SupplierIncluiTag, CategoryCode>> = {
  comida: "buffet",
  servico: "garcons",
  louca: "louca",
  bebidas: "bebidas",
  som: "som_dj",
  iluminacao: "iluminacao",
  decoracao: "decoracao",
  bolo_doces: "bolo_doces",
  mesas_cadeiras: "mobiliario",
  limpeza: "limpeza",
  seguranca: "seguranca",
  gerador: "gerador",
  barman: "barman",
  banda: "banda",
  cantor_cerimonia: "cantor_cerimonia",
};

const SUPPLIER_INCLUI_ALIASES: Record<string, SupplierIncluiTag> = {
  comida: "comida",
  cardapio: "comida",
  alimentacao: "comida",
  servico: "servico",
  servicos: "servico",
  mao_de_obra: "servico",
  equipe: "servico",
  garcons: "servico",
  copeiras: "servico",
  louca: "louca",
  loucas: "louca",
  talheres: "louca",
  bebida: "bebidas",
  bebidas: "bebidas",
  bar: "barman",
  barman: "barman",
  bartender: "barman",
  drinks: "barman",
  som: "som",
  dj: "som",
  musica: "som",
  banda: "banda",
  cantor: "cantor_cerimonia",
  cantor_cerimonia: "cantor_cerimonia",
  cerimonia: "cantor_cerimonia",
  iluminacao: "iluminacao",
  decoracao: "decoracao",
  bolo: "bolo_doces",
  doces: "bolo_doces",
  mesas: "mesas_cadeiras",
  cadeiras: "mesas_cadeiras",
  mobiliario: "mesas_cadeiras",
  limpeza: "limpeza",
  seguranca: "seguranca",
  gerador: "gerador",
  estacionamento: "estacionamento",
};

/** Normaliza a tag (texto livre do fornecedor/admin) para o vocabulário canônico. */
export function normalizeSupplierIncluiTag(raw: string): SupplierIncluiTag | null {
  const t = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");
  if ((SUPPLIER_INCLUI_TAGS as readonly string[]).includes(t)) return t as SupplierIncluiTag;
  const alias = SUPPLIER_INCLUI_ALIASES[t];
  if (alias !== undefined) return alias;
  const rules: [RegExp, SupplierIncluiTag][] = [
    [/barman|bartend/, "barman"],
    [/cantor/, "cantor_cerimonia"],
    [/banda|musica_ao_vivo/, "banda"],
    [/louca|talher/, "louca"],
    [/garc|copeir|servico|staff/, "servico"],
    [/som|dj/, "som"],
    [/bebida|refri|cerveja/, "bebidas"],
    [/bolo|doce/, "bolo_doces"],
    [/mesa|cadeira/, "mesas_cadeiras"],
    [/luz|ilumin/, "iluminacao"],
    [/decor|flor/, "decoracao"],
    [/limp/, "limpeza"],
    [/segur/, "seguranca"],
    [/gerador/, "gerador"],
    [/estaciona/, "estacionamento"],
    [/comida|cardapio|aliment/, "comida"],
  ];
  return rules.find(([re]) => re.test(t))?.[1] ?? null;
}

/** Tipos de espaço canônicos (coluna suppliers.tipo_espaco). */
export const SPACE_TYPES = [
  "salao",
  "chacara",
  "sitio",
  "jardim",
  "praia",
  "hotel",
  "clube",
  "outro",
] as const;

export type SpaceType = (typeof SPACE_TYPES)[number];

export const SPACE_TYPE_LABELS: Record<SpaceType, string> = {
  salao: "Salão",
  chacara: "Chácara",
  sitio: "Sítio",
  jardim: "Jardim",
  praia: "Praia",
  hotel: "Hotel",
  clube: "Clube",
  outro: "Outro",
};

export const VENUE_CAPACITY_FIELD = "capacidade";
export const VENUE_TYPE_FIELD = "tipo_espaco";

export type Unit = "por_pessoa" | "por_hora" | "unidade" | "pacote";

export const UNIT_LABELS: Record<Unit, string> = {
  por_pessoa: "por pessoa",
  por_hora: "por hora",
  unidade: "unidade(s)",
  pacote: "pacote",
};

export type StepCode = "local" | "comida" | "estrutura" | "extras";

export const STEPS: { code: StepCode; title: string; description: string }[] = [
  { code: "local", title: "Local e horário", description: "Onde e por quanto tempo acontece a festa." },
  { code: "comida", title: "Comida e bebida", description: "O que vai ser servido aos convidados." },
  { code: "estrutura", title: "Estrutura e serviços", description: "Equipe, limpeza, segurança e energia." },
  { code: "extras", title: "Extras", description: "Detalhes que deixam o evento completo." },
];

export type AnswerValue = boolean | string | number;

/** Condição simples: todas precisam bater (AND). */
export interface Condition {
  question: string;
  equals: AnswerValue;
}

interface QuestionBase {
  id: string;
  step: StepCode;
  label: string;
  hint?: string;
  appliesTo: EventType[] | "all";
  showIf?: Condition[];
}

export type Question =
  | (QuestionBase & { kind: "boolean"; defaultValue: boolean })
  | (QuestionBase & { kind: "single"; options: { value: string; label: string }[]; defaultValue: string })
  | (QuestionBase & { kind: "number"; min: number; max: number; defaultValue: number })
  | (QuestionBase & { kind: "text"; maxLength: number; placeholder: string; defaultValue: string })
  /** Horário "HH:MM" (24h). */
  | (QuestionBase & { kind: "time"; defaultValue: string });

/** Regra de quantidade: convidados, horas de festa, fixa ou 1 profissional a cada N convidados. */
export type QuantityRule =
  | { kind: "guests" }
  | { kind: "hours" }
  | { kind: "fixed"; value: number }
  | { kind: "per_guests"; every: number }
  | { kind: "answer"; question: string };

export interface CatalogItem {
  code: string;
  category: CategoryCode;
  label: string;
  unit: Unit;
  quantity: QuantityRule;
  appliesTo: EventType[] | "all";
  /** Obrigatório para o tipo de evento (sempre entra, salvo condição falsa). */
  mandatory: boolean;
  /** Itens opcionais exigem condição; obrigatórios podem ter condição de exclusão. */
  when?: Condition[];
}

const KIDS: EventType[] = ["festa_infantil", "aniversario", "batizado"];
const FORMAL: EventType[] = ["casamento", "quinze_anos", "formatura"];

/** Pergunta aberta final (todas as entrevistas) → requisito "outros/demanda_especifica". */
export const SPECIAL_REQUEST_QUESTION = "demanda_especifica";
export const SPECIAL_REQUEST_ITEM = "demanda_especifica";
export const MAX_SPECIAL_REQUEST = 500;

export const QUESTIONS: Question[] = [
  {
    id: "local_proprio",
    step: "local",
    kind: "boolean",
    label: "Você já tem o local da festa?",
    hint: "Casa, salão do condomínio, chácara já reservada…",
    appliesTo: "all",
    defaultValue: false,
  },
  {
    id: "ambiente",
    step: "local",
    kind: "single",
    label: "O evento é em ambiente…",
    appliesTo: "all",
    options: [
      { value: "fechado", label: "Fechado (salão)" },
      { value: "aberto", label: "Aberto (chácara, jardim, praia)" },
      { value: "misto", label: "Misto" },
    ],
    defaultValue: "fechado",
  },
  {
    id: "energia_no_local",
    step: "local",
    kind: "boolean",
    label: "O local tem energia elétrica suficiente para som e iluminação?",
    appliesTo: "all",
    showIf: [{ question: "ambiente", equals: "aberto" }],
    defaultValue: true,
  },
  // Duração (duracao_horas) é DERIVADA de início/fim em parseAnswers; eventos antigos
  // que só têm duracao_horas continuam válidos (ver lib/catalog/time.ts).
  {
    id: "horario_inicio",
    step: "local",
    kind: "time",
    label: "Previsão de início",
    appliesTo: "all",
    defaultValue: "18:00",
  },
  {
    id: "horario_fim",
    step: "local",
    kind: "time",
    label: "Previsão de fim",
    hint: "Se terminar depois da meia-noite, tudo bem: contamos a virada do dia.",
    appliesTo: "all",
    defaultValue: "23:00",
  },
  {
    id: "estilo_comida",
    step: "comida",
    kind: "single",
    label: "Estilo do serviço de comida",
    appliesTo: "all",
    options: [
      { value: "coquetel", label: "Coquetel / salgadinhos" },
      { value: "jantar", label: "Jantar completo" },
      { value: "churrasco", label: "Churrasco" },
      { value: "finger_food", label: "Finger food / food truck" },
    ],
    defaultValue: "coquetel",
  },
  {
    id: "bebida_alcoolica",
    step: "comida",
    kind: "boolean",
    label: "Vai servir bebida alcoólica?",
    appliesTo: "all",
    defaultValue: false,
  },
  {
    id: "bar_terceirizado",
    step: "comida",
    kind: "boolean",
    label: "Quer contratar um bar terceirizado (bartender e drinks)?",
    appliesTo: "all",
    showIf: [{ question: "bebida_alcoolica", equals: true }],
    defaultValue: false,
  },
  {
    id: "bolo",
    step: "comida",
    kind: "boolean",
    label: "Precisa de bolo e mesa de doces?",
    appliesTo: "all",
    defaultValue: true,
  },
  {
    id: "garcons",
    step: "estrutura",
    kind: "boolean",
    label: "Precisa de garçons e copeiras?",
    hint: "Estimamos 1 profissional a cada 20 convidados.",
    appliesTo: "all",
    defaultValue: true,
  },
  {
    id: "louca",
    step: "estrutura",
    kind: "boolean",
    label: "Precisa alugar louça, talheres e toalhas?",
    appliesTo: "all",
    defaultValue: true,
  },
  {
    id: "mobiliario",
    step: "estrutura",
    kind: "boolean",
    label: "Precisa alugar mesas e cadeiras?",
    appliesTo: "all",
    defaultValue: false,
  },
  {
    id: "limpeza",
    step: "estrutura",
    kind: "boolean",
    label: "Quer equipe de limpeza (antes e depois da festa)?",
    appliesTo: "all",
    defaultValue: true,
  },
  {
    id: "seguranca",
    step: "estrutura",
    kind: "boolean",
    label: "Precisa de segurança ou portaria?",
    hint: "Estimamos 1 profissional a cada 100 convidados.",
    appliesTo: "all",
    defaultValue: false,
  },
  {
    id: "transporte",
    step: "estrutura",
    kind: "boolean",
    label: "Precisa de transporte para os convidados (van, ônibus)?",
    appliesTo: "all",
    defaultValue: false,
  },
  {
    id: "transporte_pessoas",
    step: "estrutura",
    kind: "number",
    label: "Quantas pessoas vão usar o transporte?",
    appliesTo: "all",
    showIf: [{ question: "transporte", equals: true }],
    min: 1,
    max: 5000,
    defaultValue: 20,
  },
  {
    id: "cerimonial",
    step: "estrutura",
    kind: "boolean",
    label: "Quer cerimonial / assessoria no dia?",
    appliesTo: "all",
    defaultValue: false,
  },
  {
    id: "musica",
    step: "extras",
    kind: "single",
    label: "Música",
    appliesTo: "all",
    options: [
      { value: "dj", label: "DJ com som" },
      { value: "ao_vivo", label: "Banda / música ao vivo" },
      { value: "ambos", label: "Os dois" },
      { value: "nenhuma", label: "Sem música contratada" },
    ],
    defaultValue: "dj",
  },
  {
    id: "cantor_cerimonia",
    step: "extras",
    kind: "boolean",
    label: "Quer cantor para a cerimônia (igreja)?",
    appliesTo: ["casamento", "batizado"],
    defaultValue: false,
  },
  {
    id: "iluminacao",
    step: "extras",
    kind: "boolean",
    label: "Quer iluminação especial (pista, cênica)?",
    appliesTo: "all",
    defaultValue: false,
  },
  {
    id: "foto",
    step: "extras",
    kind: "single",
    label: "Foto e vídeo",
    appliesTo: "all",
    options: [
      { value: "foto", label: "Só fotografia" },
      { value: "foto_video", label: "Foto e vídeo" },
      { value: "nenhum", label: "Não preciso" },
    ],
    defaultValue: "foto",
  },
  {
    id: "recreacao",
    step: "extras",
    kind: "boolean",
    label: "Quer recreação para as crianças (monitores, brinquedos)?",
    appliesTo: [...KIDS, "casamento", "quinze_anos"],
    defaultValue: true,
  },
  {
    id: "convites",
    step: "extras",
    kind: "boolean",
    label: "Precisa de convites impressos?",
    appliesTo: "all",
    defaultValue: false,
  },
  {
    id: "lembrancinhas",
    step: "extras",
    kind: "boolean",
    label: "Quer lembrancinhas / brindes?",
    appliesTo: "all",
    defaultValue: false,
  },
  {
    id: "audiovisual",
    step: "extras",
    kind: "boolean",
    label: "Precisa de telão, projetor e microfones?",
    appliesTo: ["corporativo", "formatura", "casamento"],
    defaultValue: false,
  },
  {
    id: SPECIAL_REQUEST_QUESTION,
    step: "extras",
    kind: "text",
    label:
      "Tem mais alguma coisa que você precise? Podemos ter esquecido algo, ou você tem alguma demanda específica que podemos encontrar?",
    hint: "Opcional. Ex.: food truck de crepe, tradutor de Libras, fogos, aluguel de tenda.",
    appliesTo: "all",
    maxLength: MAX_SPECIAL_REQUEST,
    placeholder: "Conte aqui com suas palavras…",
    defaultValue: "",
  },
];

export const ITEMS: CatalogItem[] = [
  {
    code: "espaco_locacao",
    category: "espaco",
    label: "Locação do espaço",
    unit: "pacote",
    quantity: { kind: "fixed", value: 1 },
    appliesTo: "all",
    mandatory: true,
    when: [{ question: "local_proprio", equals: false }],
  },
  { code: "buffet_coquetel", category: "buffet", label: "Buffet de coquetel", unit: "por_pessoa", quantity: { kind: "guests" }, appliesTo: "all", mandatory: true, when: [{ question: "estilo_comida", equals: "coquetel" }] },
  { code: "buffet_jantar", category: "buffet", label: "Buffet de jantar completo", unit: "por_pessoa", quantity: { kind: "guests" }, appliesTo: "all", mandatory: true, when: [{ question: "estilo_comida", equals: "jantar" }] },
  { code: "buffet_churrasco", category: "buffet", label: "Churrasco", unit: "por_pessoa", quantity: { kind: "guests" }, appliesTo: "all", mandatory: true, when: [{ question: "estilo_comida", equals: "churrasco" }] },
  { code: "buffet_finger_food", category: "buffet", label: "Finger food / food truck", unit: "por_pessoa", quantity: { kind: "guests" }, appliesTo: "all", mandatory: true, when: [{ question: "estilo_comida", equals: "finger_food" }] },
  { code: "bebidas_nao_alcoolicas", category: "bebidas", label: "Refrigerantes, sucos e água", unit: "por_pessoa", quantity: { kind: "guests" }, appliesTo: "all", mandatory: true },
  { code: "bebidas_alcoolicas", category: "bebidas", label: "Cerveja e bebidas alcoólicas", unit: "por_pessoa", quantity: { kind: "guests" }, appliesTo: "all", mandatory: false, when: [{ question: "bebida_alcoolica", equals: true }] },
  { code: "bar_drinks", category: "barman", label: "Bar com bartender", unit: "por_pessoa", quantity: { kind: "guests" }, appliesTo: "all", mandatory: false, when: [{ question: "bebida_alcoolica", equals: true }, { question: "bar_terceirizado", equals: true }] },
  { code: "bolo_principal", category: "bolo_doces", label: "Bolo", unit: "unidade", quantity: { kind: "fixed", value: 1 }, appliesTo: "all", mandatory: false, when: [{ question: "bolo", equals: true }] },
  { code: "doces_finos", category: "bolo_doces", label: "Mesa de doces", unit: "por_pessoa", quantity: { kind: "guests" }, appliesTo: "all", mandatory: false, when: [{ question: "bolo", equals: true }] },
  { code: "decoracao_tematica", category: "decoracao", label: "Decoração", unit: "pacote", quantity: { kind: "fixed", value: 1 }, appliesTo: "all", mandatory: true },
  { code: "fotografia", category: "foto_video", label: "Fotografia", unit: "por_hora", quantity: { kind: "hours" }, appliesTo: "all", mandatory: false, when: [{ question: "foto", equals: "foto" }] },
  { code: "foto_e_video", category: "foto_video", label: "Fotografia e filmagem", unit: "por_hora", quantity: { kind: "hours" }, appliesTo: "all", mandatory: false, when: [{ question: "foto", equals: "foto_video" }] },
  { code: "dj_som", category: "som_dj", label: "DJ com sonorização", unit: "por_hora", quantity: { kind: "hours" }, appliesTo: "all", mandatory: false, when: [{ question: "musica", equals: "dj" }] },
  { code: "dj_som_combo", category: "som_dj", label: "DJ com sonorização", unit: "por_hora", quantity: { kind: "hours" }, appliesTo: "all", mandatory: false, when: [{ question: "musica", equals: "ambos" }] },
  { code: "banda", category: "banda", label: "Banda / música ao vivo", unit: "por_hora", quantity: { kind: "hours" }, appliesTo: "all", mandatory: false, when: [{ question: "musica", equals: "ao_vivo" }] },
  { code: "banda_combo", category: "banda", label: "Banda / música ao vivo", unit: "por_hora", quantity: { kind: "hours" }, appliesTo: "all", mandatory: false, when: [{ question: "musica", equals: "ambos" }] },
  { code: "cantor_cerimonia", category: "cantor_cerimonia", label: "Cantor de cerimônia / igreja", unit: "pacote", quantity: { kind: "fixed", value: 1 }, appliesTo: ["casamento", "batizado"], mandatory: false, when: [{ question: "cantor_cerimonia", equals: true }] },
  { code: "iluminacao_cenica", category: "iluminacao", label: "Iluminação cênica / pista", unit: "pacote", quantity: { kind: "fixed", value: 1 }, appliesTo: "all", mandatory: false, when: [{ question: "iluminacao", equals: true }] },
  { code: "mesas_cadeiras", category: "mobiliario", label: "Mesas e cadeiras", unit: "por_pessoa", quantity: { kind: "guests" }, appliesTo: "all", mandatory: false, when: [{ question: "mobiliario", equals: true }] },
  { code: "garcons_copeiras", category: "garcons", label: "Garçons e copeiras", unit: "unidade", quantity: { kind: "per_guests", every: 20 }, appliesTo: "all", mandatory: false, when: [{ question: "garcons", equals: true }] },
  { code: "louca_talheres", category: "louca", label: "Louça, talheres, taças e toalhas", unit: "por_pessoa", quantity: { kind: "guests" }, appliesTo: "all", mandatory: false, when: [{ question: "louca", equals: true }] },
  { code: "limpeza_pre_pos", category: "limpeza", label: "Limpeza antes e depois", unit: "pacote", quantity: { kind: "fixed", value: 1 }, appliesTo: "all", mandatory: false, when: [{ question: "limpeza", equals: true }] },
  { code: "seguranca_portaria", category: "seguranca", label: "Seguranças / portaria", unit: "unidade", quantity: { kind: "per_guests", every: 100 }, appliesTo: "all", mandatory: false, when: [{ question: "seguranca", equals: true }] },
  { code: "transporte_convidados", category: "transporte", label: "Van / ônibus para convidados", unit: "por_pessoa", quantity: { kind: "answer", question: "transporte_pessoas" }, appliesTo: "all", mandatory: false, when: [{ question: "transporte", equals: true }] },
  { code: "gerador_energia", category: "gerador", label: "Gerador de energia", unit: "por_hora", quantity: { kind: "hours" }, appliesTo: "all", mandatory: true, when: [{ question: "ambiente", equals: "aberto" }, { question: "energia_no_local", equals: false }] },
  { code: "cerimonial_dia", category: "cerimonial", label: "Cerimonial / assessoria do dia", unit: "pacote", quantity: { kind: "fixed", value: 1 }, appliesTo: "all", mandatory: false, when: [{ question: "cerimonial", equals: true }] },
  { code: "recreacao_monitores", category: "recreacao", label: "Monitores e brinquedos", unit: "por_hora", quantity: { kind: "hours" }, appliesTo: [...KIDS, "casamento", "quinze_anos"], mandatory: false, when: [{ question: "recreacao", equals: true }] },
  { code: "convites_impressos", category: "convites", label: "Convites impressos", unit: "unidade", quantity: { kind: "per_guests", every: 2 }, appliesTo: "all", mandatory: false, when: [{ question: "convites", equals: true }] },
  { code: "lembrancinhas", category: "lembrancinhas", label: "Lembrancinhas / brindes", unit: "por_pessoa", quantity: { kind: "guests" }, appliesTo: "all", mandatory: false, when: [{ question: "lembrancinhas", equals: true }] },
  { code: "audiovisual_basico", category: "audiovisual", label: "Telão, projetor e microfones", unit: "pacote", quantity: { kind: "fixed", value: 1 }, appliesTo: ["corporativo", "formatura", "casamento"], mandatory: false, when: [{ question: "audiovisual", equals: true }] },
];

/** Padrões por tipo de evento (sobrescrevem o defaultValue da pergunta). */
export const DEFAULT_OVERRIDES: Partial<Record<EventType, Record<string, AnswerValue>>> = {
  casamento: { cerimonial: true, estilo_comida: "jantar", musica: "ambos", foto: "foto_video", recreacao: false },
  quinze_anos: { cerimonial: true, estilo_comida: "jantar", foto: "foto_video", iluminacao: true, recreacao: false },
  formatura: { cerimonial: true, estilo_comida: "jantar", bebida_alcoolica: true, iluminacao: true },
  corporativo: { audiovisual: true, estilo_comida: "finger_food", musica: "nenhuma" },
  festa_infantil: { recreacao: true, musica: "nenhuma" },
};

export const FORMAL_EVENT_TYPES = FORMAL;
