/**
 * Divisão dos fornecedores em posts (lotes) respeitando o limite de marcações
 * por post e o número máximo de posts por dia. Agrupa por tipo de produto e
 * espaça os posts ao longo dos dias.
 */

export interface SupplierForPost {
  handle: string;
  category: string;
}

export interface PostBatch {
  /** Dia em que o post deve ser publicado (0 = primeiro dia). */
  dayIndex: number;
  category: string;
  handles: string[];
}

export interface BatchOptions {
  /** Máximo de @marcações por post (nunca acima do limite da Meta). */
  maxTagsPerPost: number;
  /** Máximo de posts publicados por dia. */
  maxPostsPerDay: number;
}

export function planPostBatches(
  suppliers: readonly SupplierForPost[],
  options: BatchOptions,
): PostBatch[] {
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

  const batches: PostBatch[] = [];
  for (const [category, handles] of byCategory) {
    for (let start = 0; start < handles.length; start += options.maxTagsPerPost) {
      batches.push({
        dayIndex: 0,
        category,
        handles: handles.slice(start, start + options.maxTagsPerPost),
      });
    }
  }

  return batches.map((batch, index) => ({
    ...batch,
    dayIndex: Math.floor(index / options.maxPostsPerDay),
  }));
}
