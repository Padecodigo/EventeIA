"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  CONSENT_VERSION,
  isInviteUsable,
  TESTIMONIAL_LIMITS,
} from "@/lib/testimonials/pure";

export interface TestimonialFormState {
  error?: string;
  success?: boolean;
}

const testimonialSchema = z.object({
  token: z.string().uuid(),
  authorName: z
    .string()
    .trim()
    .min(TESTIMONIAL_LIMITS.nameMin)
    .max(TESTIMONIAL_LIMITS.nameMax),
  city: z.string().trim().max(TESTIMONIAL_LIMITS.cityMax).optional(),
  quote: z
    .string()
    .trim()
    .min(TESTIMONIAL_LIMITS.quoteMin)
    .max(TESTIMONIAL_LIMITS.quoteMax),
  outcome: z.string().trim().max(TESTIMONIAL_LIMITS.outcomeMax).optional(),
  consent: z.literal("on"),
});

export async function submitTestimonialAction(
  _previous: TestimonialFormState,
  formData: FormData,
): Promise<TestimonialFormState> {
  const parsed = testimonialSchema.safeParse({
    token: formData.get("token"),
    authorName: formData.get("authorName"),
    city: formData.get("city") ?? undefined,
    quote: formData.get("quote"),
    outcome: formData.get("outcome") ?? undefined,
    consent: formData.get("consent"),
  });

  if (!parsed.success) {
    return {
      error:
        "Revise os campos: nome, cidade, depoimento (mínimo 80 caracteres) e o consentimento são obrigatórios.",
    };
  }

  try {
    const admin = getSupabaseAdmin();

    const { data: invite, error: inviteError } = await admin
      .from("testimonial_invites")
      .select("id,event_id,profile_id,expires_at,used_at")
      .eq("token", parsed.data.token)
      .maybeSingle();

    if (inviteError !== null || invite === null || !isInviteUsable(invite)) {
      return { error: "Este convite é inválido, expirou ou já foi utilizado." };
    }

    const [eventResult, profileResult] = await Promise.all([
      admin
        .from("events")
        .select("event_type,guest_count")
        .eq("id", invite.event_id)
        .maybeSingle(),
      admin.from("profiles").select("role").eq("id", invite.profile_id).maybeSingle(),
    ]);

    const eventContext =
      eventResult.data === null
        ? null
        : `${eventResult.data.event_type} · ${String(eventResult.data.guest_count)} convidados`;
    const audience = profileResult.data?.role === "b2b" ? "b2b" : "b2c";

    // Consome o convite de forma atômica (só um envio por token).
    const { data: claimed, error: claimError } = await admin
      .from("testimonial_invites")
      .update({ used_at: new Date().toISOString() })
      .eq("id", invite.id)
      .is("used_at", null)
      .select("id")
      .maybeSingle();

    if (claimError !== null || claimed === null) {
      return { error: "Este convite já foi utilizado." };
    }

    const { data: inserted, error: insertError } = await admin
      .from("testimonials")
      .insert({
        invite_id: invite.id,
        profile_id: invite.profile_id,
        event_id: invite.event_id,
        author_name: parsed.data.authorName,
        city: parsed.data.city ?? null,
        event_context: eventContext,
        audience,
        quote: parsed.data.quote,
        outcome: parsed.data.outcome ?? null,
        consent_given: true,
        consent_text_version: CONSENT_VERSION,
        status: "pending",
        published: false,
      })
      .select("id")
      .single();

    if (insertError !== null || inserted === null) {
      await admin
        .from("testimonial_invites")
        .update({ used_at: null })
        .eq("id", invite.id);
      logger.error({ code: insertError?.code }, "falha ao registrar depoimento");
      return { error: "Não foi possível enviar agora. Tente novamente em instantes." };
    }

    try {
      await emitFeed(admin, {
        type: "testimonial.submitted",
        actorType: "user",
        actorId: invite.profile_id,
        aggregateType: "testimonial",
        aggregateId: inserted.id,
        payload: { audience, event_id: invite.event_id },
        correlationId: invite.id,
        source: "app",
      });
    } catch (caught) {
      logger.warn(
        { reason: caught instanceof Error ? caught.message : "desconhecido" },
        "feed testimonial.submitted falhou",
      );
    }

    revalidatePath("/");
    revalidatePath("/para-planners");

    return { success: true };
  } catch (caught) {
    logger.error(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "erro inesperado ao enviar depoimento",
    );
    return { error: "Não foi possível enviar agora. Tente novamente em instantes." };
  }
}
