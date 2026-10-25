"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { closeTicket, reopenTicket, softDeleteTicket, type TicketDb } from "@/lib/support/admin-ops";
import { createSupportDeps } from "@/lib/support/runtime";
import { replyAsAdmin, updateTicketAsAdmin, type ActionResult } from "@/lib/support/service";

type State = ActionResult | null;

function fields(formData: FormData, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const value = formData.get(key);
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

export async function adminReplyTicketAction(_prev: State, formData: FormData): Promise<State> {
  const admin = await requireAdmin();
  const result = await replyAsAdmin(createSupportDeps(), admin.id, fields(formData, ["ticketId", "body"]));
  if (result.ok) {
    revalidatePath("/admin/chamados");
    revalidatePath(`/admin/chamados/${result.ticketId}`);
  }
  return result;
}

export async function adminUpdateTicketAction(_prev: State, formData: FormData): Promise<State> {
  await requireAdmin();
  const result = await updateTicketAsAdmin(createSupportDeps(), fields(formData, ["ticketId", "status", "priority"]));
  if (result.ok) {
    revalidatePath("/admin/chamados");
    revalidatePath(`/admin/chamados/${result.ticketId}`);
  }
  return result;
}

type OpState = { ok?: boolean; error?: string } | null;

function revalidateTicket(id: unknown) {
  revalidatePath("/admin/chamados");
  if (typeof id === "string") revalidatePath(`/admin/chamados/${id}`);
}

export async function adminCloseTicketAction(_prev: OpState, formData: FormData): Promise<OpState> {
  const admin = await requireAdmin();
  const id = formData.get("ticketId");
  const r = await closeTicket(getSupabaseAdmin() as unknown as TicketDb, id, admin.id);
  if (r.ok) revalidateTicket(id);
  return r;
}

export async function adminReopenTicketAction(_prev: OpState, formData: FormData): Promise<OpState> {
  await requireAdmin();
  const id = formData.get("ticketId");
  const r = await reopenTicket(getSupabaseAdmin() as unknown as TicketDb, id);
  if (r.ok) revalidateTicket(id);
  return r;
}

export async function adminDeleteTicketAction(_prev: OpState, formData: FormData): Promise<OpState> {
  const admin = await requireAdmin();
  const id = formData.get("ticketId");
  const r = await softDeleteTicket(getSupabaseAdmin() as unknown as TicketDb, id, admin.id);
  if (!r.ok) return r;
  revalidateTicket(id);
  redirect("/admin/chamados?excluido=1");
}
