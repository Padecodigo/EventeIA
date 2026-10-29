"use server";

import { revalidatePath } from "next/cache";

import type { OpResult } from "@/lib/admin/suppliers";
import { requireAdmin } from "@/lib/auth";
import { loginWithBrowser } from "@/lib/instagram-browser/login";
import { clearInstagramSession } from "@/lib/instagram-browser/session";

/** Login no Instagram (browser headless) a partir do painel admin. */
export async function loginInstagramAction(_prev: OpResult | null, form: FormData): Promise<OpResult> {
  await requireAdmin();

  const username = form.get("username");
  const password = form.get("password");
  if (typeof username !== "string" || username.trim() === "" || typeof password !== "string" || password === "") {
    return { ok: false, error: "Informe usuário (sem @) e senha." };
  }

  const result = await loginWithBrowser({ username: username.trim(), password });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/admin/instagram");
  return { ok: true };
}

/** Deslogar (remove a sessão salva da automação). */
export async function logoutInstagramAction(): Promise<void> {
  await requireAdmin();
  await clearInstagramSession();
  revalidatePath("/admin/instagram");
}
