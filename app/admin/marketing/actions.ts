"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { setAutopilotEnabled } from "@/lib/marketing/settings";

/** Liga/desliga **somente** a publicidade automática (prospecção segue ativa). */
export async function toggleAutopilotAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const enabled = formData.get("enabled") === "true";
  await setAutopilotEnabled(enabled);
  revalidatePath("/admin/marketing");
}
