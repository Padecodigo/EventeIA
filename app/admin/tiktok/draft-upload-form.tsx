"use client";

import { useActionState } from "react";

import { TIKTOK_DRAFT_ACCEPT, TIKTOK_DRAFT_MAX_MB } from "@/lib/tiktok/draft-rules";

import { uploadTiktokDraftAction, type TiktokDraftState } from "./actions";

const initialState: TiktokDraftState = null;

const fileField =
  "block w-full rounded-xl border border-line-subtle bg-white px-3 py-2 text-sm text-vinho file:mr-3 file:rounded-full file:border-0 file:bg-areia-secundaria file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-vinho";

export function TiktokDraftUploadForm({ disabled = false }: { disabled?: boolean }) {
  const [state, action, pending] = useActionState(uploadTiktokDraftAction, initialState);

  return (
    <form
      action={action}
      encType="multipart/form-data"
      className="mt-3 flex max-w-xl flex-col gap-3"
      data-testid="tiktok-draft-form"
    >
      <label className="flex flex-col gap-1 text-sm text-vinho">
        Vídeo para o inbox
        <input
          type="file"
          name="video"
          accept={TIKTOK_DRAFT_ACCEPT}
          required
          disabled={disabled || pending}
          className={fileField}
        />
      </label>
      <p className="text-caption text-vinho/60">
        MP4, MOV ou WebM, até {String(TIKTOK_DRAFT_MAX_MB)} MB. O vídeo vira um rascunho no inbox do
        TikTok; nada é publicado automaticamente. Abra o app para revisar, editar e publicar.
      </p>
      <button
        type="submit"
        disabled={disabled || pending}
        className="self-start rounded-full bg-primaria px-5 py-2.5 text-sm font-semibold text-on-primary transition hover:bg-primaria-escura disabled:opacity-50"
      >
        {pending ? "Enviando para o TikTok…" : "Enviar rascunho"}
      </button>
      {state !== null && !state.ok ? (
        <p role="alert" className="text-sm text-semantic-error">
          {state.error}
        </p>
      ) : null}
      {state !== null && state.ok ? (
        <p role="status" className="text-sm text-vinho/75">
          Rascunho enviado ao inbox do TikTok. Abra o app para revisar e publicar.
        </p>
      ) : null}
    </form>
  );
}
