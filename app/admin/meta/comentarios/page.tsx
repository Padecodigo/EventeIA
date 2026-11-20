import Image from "next/image";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { listMediaComments, listRecentMedia, type IgMedia } from "@/lib/meta/comments";
import { resolveMetaPageCredentials } from "@/lib/meta/connection-store";

import { Card } from "../../ui";
import { createCommentAction } from "./actions";
import { CommentItem } from "./comment-item";

export const dynamic = "force-dynamic";
export const metadata = { title: "Comentários do post do evento" };

const STATUS_MESSAGES: Record<string, { label: string; tone: string }> = {
  comentado: { label: "Comentário enviado.", tone: "text-vinho" },
  respondido: { label: "Resposta enviada.", tone: "text-vinho" },
  ocultado: { label: "Comentário ocultado.", tone: "text-vinho" },
  mostrado: { label: "Comentário visível novamente.", tone: "text-vinho" },
  excluido: { label: "Comentário excluído.", tone: "text-vinho/70" },
  erro: { label: "Não foi possível concluir a ação. Tente novamente.", tone: "text-vinho/70" },
  sem_conexao: {
    label: "Conecte a Página e o Instagram em Conexão Meta para gerenciar comentários.",
    tone: "text-vinho/70",
  },
};

const MEDIA_ID_RE = /^[0-9]+$/;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function firstString(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function ComentariosAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ media?: string | string[]; status?: string | string[] }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const statusKey = firstString(params.status);
  const status = statusKey !== undefined ? STATUS_MESSAGES[statusKey] : undefined;
  const mediaParam = firstString(params.media);

  const creds = await resolveMetaPageCredentials();

  const header = (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="font-serif text-title-2 text-vinho">Comentários do post do evento</h1>
        <p className="mt-1 text-caption text-vinho/70">
          Event post comments — instagram_manage_comments
        </p>
      </div>
      <Link
        href="/admin/meta"
        className="rounded-full border border-line-subtle px-4 py-2 text-sm font-semibold text-vinho/70 transition hover:opacity-90"
      >
        Voltar para Conexão Meta
        <span className="ml-1 text-caption font-normal opacity-80">
          (Back to Meta Connection)
        </span>
      </Link>
    </header>
  );

  const banner =
    status !== undefined ? (
      <p
        className={`rounded-card border border-line-subtle bg-white/70 p-4 text-sm ${status.tone}`}
      >
        {status.label}
      </p>
    ) : null;

  if (creds === null || creds.igUserId === null) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {banner}
        <Card testId="comentarios-sem-conexao">
          <p className="text-caption uppercase tracking-wide text-vinho/60">Sem conexão</p>
          <p className="mt-2 text-sm text-vinho/70">
            Conecte a Página do Facebook e a conta profissional do Instagram para gerenciar os
            comentários do post do evento.
          </p>
          <p className="mt-3">
            <Link
              href="/admin/meta"
              className="rounded-full bg-primaria px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90"
            >
              Ir para Conexão Meta
            </Link>
          </p>
        </Card>
      </div>
    );
  }

  const apiVersion = serverEnv().META_API_VERSION;
  const mediaResult = await listRecentMedia({
    igUserId: creds.igUserId,
    accessToken: creds.pageAccessToken,
    apiVersion,
  });

  if (!mediaResult.ok) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {banner}
        <Card testId="comentarios-media-error">
          <p className="text-sm text-vinho/70">{mediaResult.error}</p>
        </Card>
      </div>
    );
  }

  const media = mediaResult.data;

  const selectedId =
    mediaParam !== undefined && MEDIA_ID_RE.test(mediaParam) && media.some((m) => m.id === mediaParam)
      ? mediaParam
      : null;

  const commentsResult =
    selectedId !== null
      ? await listMediaComments({
          mediaId: selectedId,
          accessToken: creds.pageAccessToken,
          apiVersion,
        })
      : null;

  return (
    <div className="flex flex-col gap-6">
      {header}
      {banner}

      <Card testId="comentarios-media-list">
        <p className="text-caption uppercase tracking-wide text-vinho/60">
          Posts recentes (Recent posts)
        </p>
        {media.length === 0 ? (
          <p className="mt-2 text-sm text-vinho/70">Nenhum post recente encontrado.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {media.map((item: IgMedia) => {
              const isSelected = item.id === selectedId;
              return (
                <li
                  key={item.id}
                  className={`flex flex-wrap items-start justify-between gap-3 border-t border-line-subtle pt-3 ${
                    isSelected ? "rounded-card bg-white/60" : ""
                  }`}
                >
                  <Link
                    href={`/admin/meta/comentarios?media=${item.id}`}
                    className="flex min-w-0 flex-1 items-start gap-3"
                  >
                    {item.previewUrl !== null ? (
                      <Image
                        src={item.previewUrl}
                        alt={item.caption !== null ? truncate(item.caption, 60) : "Post"}
                        width={64}
                        height={64}
                        unoptimized
                        className="rounded"
                      />
                    ) : null}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-vinho/80">
                        {item.caption !== null && item.caption.trim() !== ""
                          ? truncate(item.caption, 80)
                          : "(sem legenda)"}
                      </p>
                      <p className="text-caption text-vinho/60">
                        {item.timestamp ?? "—"} · {item.commentsCount} comentários
                      </p>
                    </div>
                  </Link>
                  {item.permalink !== null ? (
                    <a
                      href={item.permalink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-caption text-vinho/70 underline"
                    >
                      Ver no Instagram
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {selectedId !== null ? (
        <>
          <Card testId="comentarios-composer">
            <p className="text-caption uppercase tracking-wide text-vinho/60">
              Novo comentário
            </p>
            <form action={createCommentAction} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="mediaId" value={selectedId} />
              <textarea
                name="message"
                required
                maxLength={2200}
                rows={3}
                className="w-full rounded-card border border-line-subtle bg-white/70 p-3 text-sm text-vinho/80"
                placeholder="Escreva um comentário"
              />
              <div>
                <button
                  type="submit"
                  className="rounded-full bg-primaria px-4 py-2 text-sm font-semibold text-on-primary transition hover:opacity-90"
                >
                  Comentar
                  <span className="ml-1 text-caption font-normal opacity-80">(Add comment)</span>
                </button>
              </div>
              <p className="text-caption text-vinho/60">
                A API do Instagram não permite editar comentários; use ocultar/mostrar. (The
                Instagram API has no edit endpoint; use hide/unhide.)
              </p>
            </form>
          </Card>

          <Card testId="comentarios-list">
            <p className="text-caption uppercase tracking-wide text-vinho/60">Comentários</p>
            {commentsResult === null ? null : !commentsResult.ok ? (
              <p className="mt-2 text-sm text-vinho/70">{commentsResult.error}</p>
            ) : commentsResult.data.length === 0 ? (
              <p className="mt-2 text-sm text-vinho/70">Nenhum comentário neste post.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {commentsResult.data.map((c) => (
                  <CommentItem key={c.id} comment={c} mediaId={selectedId} />
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
