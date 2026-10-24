"use server";

import { revalidatePath } from "next/cache";

import { z } from "zod";

import { requireUser } from "@/lib/auth";
import { emitFeed } from "@/lib/feeds";
import { logger } from "@/lib/logger";
import { normalizePhoneE164 } from "@/lib/phone";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface ProfileState {
  error?: string;
  success?: boolean;
}

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  phone: z.string().trim().optional(),
  cpf: z.string().trim().optional(),
});

export async function updateProfileAction(
  _previous: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const user = await requireUser();

  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName"),
    phone: formData.get("phone") ?? "",
    cpf: formData.get("cpf") ?? "",
  });

  if (!parsed.success) {
    return { error: "Confira o nome (2–80 caracteres) e tente novamente." };
  }

  const phoneRaw = parsed.data.phone ?? "";
  const phone = phoneRaw.length === 0 ? null : normalizePhoneE164(phoneRaw);

  if (phoneRaw.length > 0 && phone === null) {
    return { error: "Telefone inválido. Use DDD + número (ex.: 11 99999-9999)." };
  }

  const cpfRaw = (parsed.data.cpf ?? "").replace(/\D/g, "");
  if (cpfRaw.length > 0 && cpfRaw.length !== 11) {
    return { error: "CPF deve ter 11 dígitos." };
  }

  const wantsWhatsapp = formData.get("consent") === "on";

  if (wantsWhatsapp && phone === null) {
    return { error: "Informe um telefone para autorizar o contato pelo WhatsApp." };
  }

  const supabase = await createSupabaseServerClient();
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName, phone_e164: phone })
    .eq("id", user.id);

  if (profileError !== null) {
    logger.error({ code: profileError.code }, "falha ao atualizar perfil");
    return { error: "Não foi possível salvar o perfil." };
  }

  try {
    const admin = getSupabaseAdmin();

    if (cpfRaw.length === 11) {
      await admin
        .from("profiles")
        .update({ document_number: cpfRaw, document_type: "cpf" })
        .eq("id", user.id);
    }

    if (phone !== null) {
      const status = wantsWhatsapp ? "opted_in" : "opted_out";
      await admin.from("consents").upsert(
        {
          profile_id: user.id,
          phone_e164: phone,
          channel: "whatsapp",
          status,
          source: "profile",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "phone_e164,channel" },
      );

      await emitFeed(admin, {
        type: wantsWhatsapp ? "consent.opted_in" : "consent.opted_out",
        actorType: "user",
        actorId: user.id,
        aggregateType: "profile",
        aggregateId: user.id,
        payload: { channel: "whatsapp" },
        correlationId: user.id,
        source: "app",
      });
    }

    await emitFeed(admin, {
      type: "profile.updated",
      actorType: "user",
      actorId: user.id,
      aggregateType: "profile",
      aggregateId: user.id,
      correlationId: user.id,
      source: "app",
    });
  } catch (caught) {
    logger.warn(
      { reason: caught instanceof Error ? caught.message : "desconhecido" },
      "consentimento/feed do perfil falhou",
    );
  }

  revalidatePath("/perfil");
  revalidatePath("/painel");
  return { success: true };
}
