"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
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
