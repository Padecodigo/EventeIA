/**
 * Plano de posts por NECESSIDADE.
 *
 * Para cada necessidade (ex.: buffet, fotografia), pega os fornecedores daquela
 * categoria, fatia em lotes de `maxTagsPerPost` e DUPLICA a postagem quantas
 * vezes forem necessárias (`parte X de Y`) até marcar todos — sem estourar o
 * limite da plataforma. Os posts são espaçados por dia (`maxPostsPerDay`).
 */

export interface NeedPostSupplier {
  handle: string;
  category: string;
}

export interface NeedPost {
  /** Necessidade/categoria que o post atende. */
  category: string;
  /** 1..totalParts — a "duplicata" da postagem para o excedente. */
  part: number;
  totalParts: number;
  /** Dia de publicação (0 = primeiro dia). */
  dayIndex: number;
  handles: string[];
}

export interface PlanNeedOptions {
  maxTagsPerPost: number;
  maxPostsPerDay: number;
}

/** Filtra/normaliza a lista de necessidades (trim, sem vazios, sem duplicata, ordem preservada). */
export function normalizeNeeds(needs: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of needs) {
    const need = raw.trim();
    if (need.length === 0 || seen.has(need)) continue;
    seen.add(need);
    out.push(need);
  }
  return out;
}

export function planNeedPosts(
  needs: readonly string[],
  suppliers: readonly NeedPostSupplier[],
  options: PlanNeedOptions,
): NeedPost[] {
  if (!Number.isInteger(options.maxTagsPerPost) || options.maxTagsPerPost < 1) {
    throw new Error("maxTagsPerPost deve ser um inteiro >= 1");
  }
  if (!Number.isInteger(options.maxPostsPerDay) || options.maxPostsPerDay < 1) {
    throw new Error("maxPostsPerDay deve ser um inteiro >= 1");
  }

  const byCategory = new Map<string, string[]>();
  for (const supplier of suppliers) {
    const handles = byCategory.get(supplier.category) ?? [];
    handles.push(supplier.handle);
    byCategory.set(supplier.category, handles);
  }

  const posts: NeedPost[] = [];
  for (const need of normalizeNeeds(needs)) {
    const handles = byCategory.get(need) ?? [];
    if (handles.length === 0) continue;
    const totalParts = Math.ceil(handles.length / options.maxTagsPerPost);
    for (let part = 1; part <= totalParts; part++) {
      posts.push({
        category: need,
        part,
        totalParts,
        dayIndex: 0,
        handles: handles.slice((part - 1) * options.maxTagsPerPost, part * options.maxTagsPerPost),
      });
    }
  }

  return posts.map((post, index) => ({ ...post, dayIndex: Math.floor(index / options.maxPostsPerDay) }));
}
