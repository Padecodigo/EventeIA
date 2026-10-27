import { planPostBatches, type SupplierForPost } from "./batch";
import { buildPostContent } from "./content";

/**
 * Plano de publicação: junta a divisão em lotes com o conteúdo (prompt visual +
 * legenda) de cada post. Puro e determinístico.
 */

export interface PlannedPost {
  dayIndex: number;
  category: string;
  handles: string[];
  imagePrompt: string;
  caption: string;
}

export interface PublishPlanOptions {
  keyword: string;
  maxTagsPerPost: number;
  maxPostsPerDay: number;
  city?: string;
  guestCount?: number;
}

export function buildPublishPlan(
  suppliers: readonly SupplierForPost[],
  options: PublishPlanOptions,
): PlannedPost[] {
  const batches = planPostBatches(suppliers, {
    maxTagsPerPost: options.maxTagsPerPost,
    maxPostsPerDay: options.maxPostsPerDay,
  });

  return batches.map((batch) => {
    const content = buildPostContent({
      category: batch.category,
      city: options.city,
      guestCount: options.guestCount,
      keyword: options.keyword,
      handles: batch.handles,
      variant: batch.dayIndex,
    });
    return {
      dayIndex: batch.dayIndex,
      category: batch.category,
      handles: batch.handles,
      imagePrompt: content.imagePrompt,
      caption: content.caption,
    };
  });
}
