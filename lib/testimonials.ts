import "server-only";

import { getSupabasePublic } from "./supabase/public";
import {
  toCardData,
  type PublishedTestimonialRow,
  type TestimonialAudience,
  type TestimonialCardData,
} from "./testimonials/pure";

/**
 * Depoimentos reais publicados (aprovados) para a vitrine.
 * Em caso de ambiente sem Supabase, retorna [] — a UI cai nas personas ilustrativas.
 */
export async function getPublishedTestimonials(
  audience?: TestimonialAudience,
): Promise<TestimonialCardData[]> {
  try {
    const supabase = getSupabasePublic();
    const base = supabase
      .from("testimonials")
      .select("id,author_name,city,event_context,quote,outcome,audience,published_at")
      .eq("published", true)
      .eq("status", "approved")
      .order("published_at", { ascending: false })
      .limit(6);

    const query = audience === undefined ? base : base.eq("audience", audience);
    const { data, error } = await query;

    if (error !== null || data === null) {
      return [];
    }

    return (data as PublishedTestimonialRow[]).map((row, index) => toCardData(row, index));
  } catch {
    return [];
  }
}
