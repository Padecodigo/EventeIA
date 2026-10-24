"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { z } from "zod";

import { requireAdmin } from "@/lib/auth";
import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const idSchema = z.object({ testimonialId: z.string().uuid() });

function parseTestimonialId(formData: FormData): string | null {
  const parsed = idSchema.safeParse({ testimonialId: formData.get("testimonialId") });
  return parsed.success ? parsed.data.testimonialId : null;
}

function revalidateTestimonialSurfaces(): void {
  revalidatePath("/admin/depoimentos");
  revalidatePath("/");
  revalidatePath("/para-planners");
}

async function emitModerationFeed(
  testimonialId: string,
  type: "testimonial.published" | "testimonial.rejected" | "testimonial.unpublished",
  actorId: string,
): Promise<void> {
  try {
    await emitFeed(getSupabaseAdmin(), {
      type,
      actorType: "admin",
      actorId,
      aggregateType: "testimonial",
      aggregateId: testimonialId,
      correlationId: testimonialId,
      source: "app",
    });
  } catch (caught) {
    logger.warn(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "feed de moderação falhou",
    );
  }
}

export async function approveTestimonialAction(formData: FormData): Promise<void> {
  const adminUser = await requireAdmin();
  const testimonialId = parseTestimonialId(formData);
  if (testimonialId === null) {
    redirect("/admin/depoimentos");
  }

  const { error } = await getSupabaseAdmin()
    .from("testimonials")
    .update({ status: "approved", published: true, published_at: new Date().toISOString() })
    .eq("id", testimonialId);

  if (error !== null) {
    logger.error({ code: error.code }, "falha ao aprovar depoimento");
    redirect("/admin/depoimentos?erro=aprovar");
  }

  await emitModerationFeed(testimonialId, "testimonial.published", adminUser.id);
  revalidateTestimonialSurfaces();
  redirect("/admin/depoimentos");
}

export async function rejectTestimonialAction(formData: FormData): Promise<void> {
  const adminUser = await requireAdmin();
  const testimonialId = parseTestimonialId(formData);
  if (testimonialId === null) {
    redirect("/admin/depoimentos");
  }

  const { error } = await getSupabaseAdmin()
    .from("testimonials")
    .update({ status: "rejected", published: false, published_at: null })
    .eq("id", testimonialId);

  if (error !== null) {
    logger.error({ code: error.code }, "falha ao rejeitar depoimento");
    redirect("/admin/depoimentos?erro=rejeitar");
  }

  await emitModerationFeed(testimonialId, "testimonial.rejected", adminUser.id);
  revalidateTestimonialSurfaces();
  redirect("/admin/depoimentos");
}

export async function unpublishTestimonialAction(formData: FormData): Promise<void> {
  const adminUser = await requireAdmin();
  const testimonialId = parseTestimonialId(formData);
  if (testimonialId === null) {
    redirect("/admin/depoimentos");
  }

  const { error } = await getSupabaseAdmin()
    .from("testimonials")
    .update({ published: false, published_at: null })
    .eq("id", testimonialId);

  if (error !== null) {
    logger.error({ code: error.code }, "falha ao despublicar depoimento");
    redirect("/admin/depoimentos?erro=despublicar");
  }

  await emitModerationFeed(testimonialId, "testimonial.unpublished", adminUser.id);
  revalidateTestimonialSurfaces();
  redirect("/admin/depoimentos");
}
