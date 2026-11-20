"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { resolveMetaPageCredentials } from "@/lib/meta/connection-store";
import { subscribePageFields } from "@/lib/meta/page-webhooks";

export async function subscribePageAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const creds = await resolveMetaPageCredentials();
  if (creds === null) {
    redirect("/admin/meta/webhooks?status=sem_conexao");
  }

  const fields = formData.getAll("fields").filter((v): v is string => typeof v === "string");

  const result = await subscribePageFields({
    pageId: creds.pageId,
    fields,
    accessToken: creds.pageAccessToken,
    apiVersion: serverEnv().META_API_VERSION,
  });

  revalidatePath("/admin/meta/webhooks");

  const status = result.ok ? "inscrito" : "erro";
  redirect(`/admin/meta/webhooks?status=${status}`);
}
