"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupportDeps } from "@/lib/support/runtime";
import { createTicket, replyAsUser, type ActionResult } from "@/lib/support/service";
import { clientIpFrom } from "@/lib/welcome/pure";

export type SupportFormState = ActionResult | null;

async function optionalUser(): Promise<{ id: string; email: string | null } | null> {
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return data.user === null ? null : { id: data.user.id, email: data.user.email ?? null };
  } catch {
    return null;
  }
}

function fields(formData: FormData, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = formData.get(key);
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

/** Cria sugestão/reclamação/elogio/chamado — logado ou anônimo (com e-mail). */
export async function createSupportTicketAction(
  _prev: SupportFormState,
  formData: FormData,
): Promise<SupportFormState> {
  const user = await optionalUser();
  const h = await headers();
  const file = formData.get("screenshot");
  const result = await createTicket(
    createSupportDeps(),
    {
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      ipKey: clientIpFrom(h),
      userAgent: h.get("user-agent"),
    },
    fields(formData, ["type", "subject", "message", "email", "pageUrl", "eventId", "website"]),
    file instanceof File ? file : null,
  );
  if (result.ok && user !== null) revalidatePath("/chamados");
  return result;
}

/** Réplica do usuário no próprio chamado. */
export async function replySupportTicketAction(
  _prev: SupportFormState,
  formData: FormData,
): Promise<SupportFormState> {
  const user = await requireUser();
  const result = await replyAsUser(createSupportDeps(), user.id, fields(formData, ["ticketId", "body"]));
  if (result.ok) revalidatePath(`/chamados/${result.ticketId}`);
  return result;
}
