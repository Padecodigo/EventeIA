"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import {
  deleteMetaConnection,
  getMetaUserToken,
  saveMetaPageSelection,
} from "@/lib/meta/connection-store";
import { listManagedPages } from "@/lib/meta/graph-login";
import { metaLoginConfig } from "@/lib/meta/login-config";

/**
 * Escolhe a Página a usar após o login. O token nunca é exposto: lido no servidor.
 */
export async function selectMetaPageAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const rawPageId = formData.get("pageId");
  const pageId = typeof rawPageId === "string" ? rawPageId : "";
  const config = metaLoginConfig();
  const token = await getMetaUserToken();

  if (config === null || token === null) {
    redirect("/admin/meta?meta=erro_config");
  }

  const pages = await listManagedPages({ userToken: token, apiVersion: config.apiVersion });
  if (!pages.ok) {
    redirect("/admin/meta?meta=erro_pagina");
  }

  const page = pages.data.find((candidate) => candidate.id === pageId);
  if (page === undefined) {
    redirect("/admin/meta?meta=erro_pagina");
  }

  try {
    await saveMetaPageSelection({ page });
  } catch {
    redirect("/admin/meta?meta=erro_gravar");
  }

  revalidatePath("/admin/meta");
  redirect("/admin/meta?meta=pagina");
}

/** Desconecta a conta Meta e apaga os dados de conexão salvos. */
export async function disconnectMetaAction(): Promise<void> {
  await requireAdmin();

  await deleteMetaConnection();
  revalidatePath("/admin/meta");
  redirect("/admin/meta?meta=desconectado");
}
