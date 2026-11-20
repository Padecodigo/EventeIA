"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import {
  createComment,
  deleteComment,
  replyToComment,
  setCommentHidden,
} from "@/lib/meta/comments";
import { resolveMetaPageCredentials } from "@/lib/meta/connection-store";

const PATH = "/admin/meta/comentarios";

function readField(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function destination(mediaId: string, status: string): string {
  return `${PATH}?media=${encodeURIComponent(mediaId)}&status=${status}`;
}

export async function createCommentAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const creds = await resolveMetaPageCredentials();
  if (creds === null) redirect(`${PATH}?status=sem_conexao`);

  const mediaId = readField(formData, "mediaId");
  const message = readField(formData, "message");

  let status = "erro";
  try {
    const result = await createComment({
      accessToken: creds.pageAccessToken,
      apiVersion: serverEnv().META_API_VERSION,
      mediaId,
      message,
    });
    status = result.ok ? "comentado" : "erro";
  } catch {
    status = "erro";
  }

  revalidatePath(PATH);
  redirect(destination(mediaId, status));
}

export async function replyCommentAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const creds = await resolveMetaPageCredentials();
  if (creds === null) redirect(`${PATH}?status=sem_conexao`);

  const mediaId = readField(formData, "mediaId");
  const commentId = readField(formData, "commentId");
  const message = readField(formData, "message");

  let status = "erro";
  try {
    const result = await replyToComment({
      accessToken: creds.pageAccessToken,
      apiVersion: serverEnv().META_API_VERSION,
      commentId,
      message,
    });
    status = result.ok ? "respondido" : "erro";
  } catch {
    status = "erro";
  }

  revalidatePath(PATH);
  redirect(destination(mediaId, status));
}

export async function toggleHiddenAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const creds = await resolveMetaPageCredentials();
  if (creds === null) redirect(`${PATH}?status=sem_conexao`);

  const mediaId = readField(formData, "mediaId");
  const commentId = readField(formData, "commentId");
  const hiddenField = readField(formData, "hidden");
  const hidden = hiddenField === "true";

  let status = "erro";
  try {
    const result = await setCommentHidden({
      accessToken: creds.pageAccessToken,
      apiVersion: serverEnv().META_API_VERSION,
      commentId,
      hidden,
    });
    if (result.ok) {
      status = hidden ? "ocultado" : "mostrado";
    }
  } catch {
    status = "erro";
  }

  revalidatePath(PATH);
  redirect(destination(mediaId, status));
}

export async function deleteCommentAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const creds = await resolveMetaPageCredentials();
  if (creds === null) redirect(`${PATH}?status=sem_conexao`);

  const mediaId = readField(formData, "mediaId");
  const commentId = readField(formData, "commentId");

  let status = "erro";
  try {
    const result = await deleteComment({
      accessToken: creds.pageAccessToken,
      apiVersion: serverEnv().META_API_VERSION,
      commentId,
    });
    status = result.ok ? "excluido" : "erro";
  } catch {
    status = "erro";
  }

  revalidatePath(PATH);
  redirect(destination(mediaId, status));
}
