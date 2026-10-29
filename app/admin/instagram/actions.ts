"use server";

import { revalidatePath } from "next/cache";

import type { OpResult } from "@/lib/admin/suppliers";
import { requireAdmin } from "@/lib/auth";
import { loginFacebookWithBrowser, loginWithBrowser } from "@/lib/instagram-browser/login";
import { clearFacebookSession, clearInstagramSession } from "@/lib/instagram-browser/session";

/** Login no Instagram (browser headless) a partir do painel admin. */
export async function loginInstagramAction(_prev: OpResult | null, form: FormData): Promise<OpResult> {
  await requireAdmin();

  const username = form.get("username");
  const password = form.get("password");
  if (typeof username !== "string" || username.trim() === "" || typeof password !== "string" || password === "") {
    return { ok: false, error: "Informe usuário/e-mail e senha." };
  }

  const result = await loginWithBrowser({ username: username.trim(), password });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/admin/instagram");
  return { ok: true };
}

/** Login no Facebook (página Eventeia) a partir do painel admin. */
export async function loginFacebookAction(_prev: OpResult | null, form: FormData): Promise<OpResult> {
  await requireAdmin();

  const email = form.get("email");
  const password = form.get("password");
  if (typeof email !== "string" || email.trim() === "" || typeof password !== "string" || password === "") {
    return { ok: false, error: "Informe e-mail e senha." };
  }

  const result = await loginFacebookWithBrowser({ email: email.trim(), password });
  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  revalidatePath("/admin/instagram");
  return { ok: true };
}

/** Deslogar do Instagram (remove a sessão salva). */
export async function logoutInstagramAction(): Promise<void> {
  await requireAdmin();
  await clearInstagramSession();
  revalidatePath("/admin/instagram");
}

/** Deslogar do Facebook (remove a sessão salva). */
export async function logoutFacebookAction(): Promise<void> {
  await requireAdmin();
  await clearFacebookSession();
  revalidatePath("/admin/instagram");
}
