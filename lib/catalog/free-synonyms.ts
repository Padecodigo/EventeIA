import type { CategoryCode } from "./v1";

/**
 * Dicionário local (contingência do intérprete): nome canônico, categoria e
 * termos relacionados / sinônimos / variantes regionais. Usado quando o
 * DeepSeek falha e para enriquecer a saída do LLM. Busca tolerante a acento,
 * caixa, hífen e erro de digitação (distância de edição).
 */

export interface SynonymEntry {
  canonical: string;
  category: CategoryCode;
  terms: readonly string[];
}

export const SYNONYMS: readonly SynonymEntry[] = [
  {
    canonical: "Brinquedo inflável",
    category: "recreacao",
    terms: [
      "brinquedo inflável",
      "pula-pula",
      "cama elástica",
      "castelo inflável",
      "tobogã inflável",
      "piscina de bolinhas",
      "brinquedos para festa",
      "locação de brinquedos",
    ],
  },
  {
    canonical: "Mágico infantil",
    category: "recreacao",
    terms: [
      "mágico",
      "show de mágica",
      "ilusionista",
      "mágico para festa infantil",
      "animador infantil",
    ],
  },
  {
    canonical: "Recreação infantil",
    category: "recreacao",
    terms: [
      "recreação infantil",
      "recreador",
      "monitor infantil",
      "animação infantil",
      "tia da recreação",
      "brincadeiras",
    ],
  },
  {
    canonical: "Palhaço",
    category: "recreacao",
    terms: ["palhaço", "palhaçaria", "show de palhaço", "animador infantil"],
  },
  {
    canonical: "Personagens vivos",
    category: "recreacao",
    terms: [
      "personagens vivos",
      "cover de personagem",
      "fantasia de personagem",
      "princesas",
      "super-heróis",
    ],
  },
  {
    canonical: "Pintura facial",
    category: "recreacao",
    terms: [
      "pintura facial",
      "face painting",
      "pintura de rosto",
      "maquiagem infantil",
      "tatuagem temporária",
    ],
  },
  {
    canonical: "Pista de dança",
    category: "mobiliario",
    terms: [
      "pista de dança",
      "pista de led",
      "pista iluminada",
      "tablado",
      "piso para pista",
      "pista ao ar livre",
    ],
  },
  {
    canonical: "Tenda",
    category: "mobiliario",
    terms: [
      "tenda",
      "toldo",
      "tenda chapéu de bruxa",
      "cobertura",
      "lona",
      "estrutura para eventos",
    ],
  },
  {
    canonical: "Mesas e cadeiras",
    category: "mobiliario",
    terms: [
      "mesas e cadeiras",
      "locação de mesas",
      "cadeira tiffany",
      "jogo de mesa",
      "mobiliário para festa",
    ],
  },
  {
    canonical: "Lounge",
    category: "mobiliario",
    terms: ["lounge", "puff", "pufe", "sofá para evento", "mobiliário lounge"],
  },
  {
    canonical: "Salgados",
    category: "buffet",
    terms: [
      "salgados",
      "salgadinho",
      "coxinha",
      "quibe",
      "kibe",
      "risole",
      "esfiha",
      "empadinha",
      "pastelzinho",
      "enroladinho",
    ],
  },
  {
    canonical: "Food truck",
    category: "buffet",
    terms: ["food truck", "foodtruck", "trailer de lanche", "carrinho de lanche", "lanche de rua"],
  },
  {
    canonical: "Churrasco",
    category: "buffet",
    terms: [
      "churrasco",
      "churrasqueiro",
      "assador",
      "espetinho",
      "costela fogo de chão",
      "barbecue",
    ],
  },
  {
    canonical: "Crepe",
    category: "buffet",
    terms: ["crepe", "crepe suíço", "crepeiro", "crepe no palito"],
  },
  {
    canonical: "Pizza",
    category: "buffet",
    terms: ["pizza", "rodízio de pizza", "pizzaiolo", "forno de pizza móvel"],
  },
  {
    canonical: "Cachorro-quente",
    category: "buffet",
    terms: ["cachorro-quente", "hot dog", "dogão", "podrão", "carrinho de cachorro-quente"],
  },
  {
    canonical: "Pipoca e algodão-doce",
    category: "buffet",
    terms: ["pipoca", "pipoqueiro", "algodão-doce", "carrinho de pipoca", "algodão doce"],
  },
  {
    canonical: "Sorvete",
    category: "bolo_doces",
    terms: ["sorvete", "carrinho de sorvete", "picolé", "gelato", "açaí"],
  },
  {
    canonical: "Doces finos",
    category: "bolo_doces",
    terms: [
      "doces",
      "docinhos",
      "brigadeiro",
      "beijinho",
      "bem-casado",
      "doces finos",
      "brigadeiro gourmet",
    ],
  },
  {
    canonical: "Bolo",
    category: "bolo_doces",
    terms: ["bolo", "bolo de festa", "bolo decorado", "bolo cenográfico", "confeitaria", "cake"],
  },
  {
    canonical: "DJ e sonorização",
    category: "som_dj",
    terms: [
      "DJ",
      "som",
      "sonorização",
      "caixa de som",
      "equipamento de som",
      "som para festa",
      "discotecagem",
      "paredão",
    ],
  },
  {
    canonical: "Banda ao vivo",
    category: "banda",
    terms: [
      "banda",
      "música ao vivo",
      "banda de baile",
      "conjunto musical",
      "músicos",
      "pagode",
      "sertanejo",
      "forró",
      "samba",
    ],
  },
  {
    canonical: "Saxofonista",
    category: "banda",
    terms: ["saxofonista", "sax", "saxofone", "músico solo"],
  },
  {
    canonical: "Violinista",
    category: "cantor_cerimonia",
    terms: ["violinista", "violino", "quarteto de cordas", "música para cerimônia"],
  },
  {
    canonical: "Iluminação cênica",
    category: "iluminacao",
    terms: [
      "iluminação",
      "luz",
      "iluminação cênica",
      "refletor",
      "moving head",
      "neon",
      "luzes",
      "varal de luz",
    ],
  },
  {
    canonical: "Telão e projetor",
    category: "audiovisual",
    terms: ["telão", "projetor", "painel de led", "tela de projeção", "microfone", "som e imagem"],
  },
  {
    canonical: "Bar de drinks",
    category: "barman",
    terms: [
      "bar de drinks",
      "barman",
      "bartender",
      "drinks",
      "coquetelaria",
      "bar móvel",
      "caipirinha",
    ],
  },
  {
    canonical: "Chopp",
    category: "bebidas",
    terms: ["chopp", "chope", "chopeira", "cerveja", "barril de chopp"],
  },
  {
    canonical: "Foto e vídeo",
    category: "foto_video",
    terms: ["fotógrafo", "foto", "filmagem", "vídeo", "cinegrafista", "drone", "videomaker"],
  },
  {
    canonical: "Cabine de fotos",
    category: "foto_video",
    terms: [
      "cabine de fotos",
      "totem de fotos",
      "photo booth",
      "fotos instantâneas",
      "espelho mágico",
      "plataforma 360",
    ],
  },
  {
    canonical: "Decoração com balões",
    category: "decoracao",
    terms: ["balões", "bexigas", "arco de balões", "decoração com balões", "balão"],
  },
  {
    canonical: "Decoração floral",
    category: "decoracao",
    terms: ["flores", "arranjos florais", "decoração floral", "florista", "buquê"],
  },
  {
    canonical: "Painel decorativo",
    category: "decoracao",
    terms: ["painel", "painel decorativo", "backdrop", "pegue e monte", "mesa do bolo"],
  },
  {
    canonical: "Gerador de energia",
    category: "gerador",
    terms: ["gerador", "gerador de energia", "grupo gerador", "energia elétrica"],
  },
  {
    canonical: "Segurança",
    category: "seguranca",
    terms: ["segurança", "seguranças", "vigilante", "portaria", "controle de acesso"],
  },
  {
    canonical: "Recepcionista",
    category: "seguranca",
    terms: ["recepcionista", "recepção", "hostess", "lista de convidados"],
  },
  {
    canonical: "Transporte de convidados",
    category: "transporte",
    terms: ["transporte", "van", "ônibus", "micro-ônibus", "traslado", "transfer"],
  },
  {
    canonical: "Garçons",
    category: "garcons",
    terms: ["garçom", "garçons", "copeira", "copeiro", "equipe de serviço"],
  },
  {
    canonical: "Limpeza",
    category: "limpeza",
    terms: ["limpeza", "faxina", "diarista", "equipe de limpeza", "limpeza pós-festa"],
  },
  {
    canonical: "Convites",
    category: "convites",
    terms: ["convites", "convite digital", "convite impresso", "save the date"],
  },
  {
    canonical: "Lembrancinhas",
    category: "lembrancinhas",
    terms: ["lembrancinhas", "lembrancinha", "brindes", "mimos", "sacolinha surpresa"],
  },
  {
    canonical: "Fogos de artifício",
    category: "outros",
    terms: [
      "fogos de artifício",
      "fogos",
      "show pirotécnico",
      "pirotecnia",
      "chuva de prata",
      "faísca fria",
    ],
  },
  {
    canonical: "Intérprete de Libras",
    category: "outros",
    terms: ["intérprete de Libras", "Libras", "tradutor de Libras", "acessibilidade"],
  },
  {
    canonical: "Cerimonialista",
    category: "cerimonial",
    terms: [
      "cerimonialista",
      "cerimonial",
      "assessoria de eventos",
      "organizadora de eventos",
      "wedding planner",
    ],
  },
];

/** Minúsculas, sem acento, hífen/pontuação viram espaço. */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Distância de Levenshtein com teto (sai cedo acima de `max`). */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const v = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Tolerância por tamanho: palavras curtas exigem grafia exata. */
function tolerance(len: number): number {
  return len <= 3 ? 0 : len <= 6 ? 1 : 2;
}

/** Palavra do usuário ≈ palavra do termo (com erro de digitação e plural simples). */
function wordMatch(user: string, term: string): boolean {
  if (user === term) return true;
  const strip = (w: string) => w.replace(/(oes|aes|ns|s)$/, "");
  if (strip(user) === strip(term) && strip(user).length >= 3) return true;
  return editDistance(user, term, 2) <= tolerance(Math.min(user.length, term.length));
}

/** Pontua o quanto o texto do usuário bate com um termo (0 = nada). */
function termScore(userWords: readonly string[], term: string): number {
  const words = fold(term)
    .split(" ")
    .filter((w) => w.length > 0);
  if (words.length === 0) return 0;
  const hit = words.filter((w) => userWords.some((u) => wordMatch(u, w))).length;
  if (hit < words.length) return 0;
  return words.join(" ").length;
}

const STOP = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "para",
  "pra",
  "com",
  "e",
  "a",
  "o",
  "as",
  "os",
  "um",
  "uma",
  "ao",
  "na",
  "no",
  "em",
]);

/** Melhor entrada do dicionário para o item (ou null). */
export function lookupSynonyms(label: string): SynonymEntry | null {
  const userWords = fold(label)
    .split(" ")
    .filter((w) => w.length > 0 && !STOP.has(w));
  if (userWords.length === 0) return null;
  let best: { entry: SynonymEntry; score: number } | null = null;
  for (const entry of SYNONYMS) {
    for (const term of [entry.canonical, ...entry.terms]) {
      const score = termScore(
        userWords,
        term
          .split(" ")
          .filter((w) => !STOP.has(fold(w)))
          .join(" "),
      );
      if (score > 0 && (best === null || score > best.score)) best = { entry, score };
    }
  }
  return best?.entry ?? null;
}
