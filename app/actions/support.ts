"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { deleteOwnTicket, editOwnTicket, type OwnerResult } from "@/lib/support/owner-ops";
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

export type OwnerTicketState = OwnerResult | null;

/** Dono edita assunto/descrição do próprio chamado (só aberto). Banco confere o dono (auth.uid()). */
export async function editOwnTicketAction(_prev: OwnerTicketState, formData: FormData): Promise<OwnerTicketState> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const result = await editOwnTicket(supabase, fields(formData, ["ticketId", "subject", "message"]));
  if (result.ok) {
    revalidatePath("/chamados");
    revalidatePath(`/chamados/${result.ticketId}`);
  }
  return result;
}

/** Dono exclui (soft delete) o próprio chamado; some da lista dele e vai para a Lixeira do admin. */
export async function deleteOwnTicketAction(_prev: OwnerTicketState, formData: FormData): Promise<OwnerTicketState> {
  await requireUser();
  const supabase = await createSupabaseServerClient();
  const result = await deleteOwnTicket(supabase, formData.get("ticketId"));
  if (!result.ok) return result;
  revalidatePath("/chamados");
  revalidatePath("/admin/lixeira");
  redirect("/chamados?excluido=1");
}
