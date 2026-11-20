import type { IgComment } from "@/lib/meta/comments";

import {
  deleteCommentAction,
  replyCommentAction,
  toggleHiddenAction,
} from "./actions";

export function CommentItem({
  comment,
  mediaId,
  isReply = false,
}: {
  comment: IgComment;
  mediaId: string;
  isReply?: boolean;
}) {
  const username = comment.username !== null ? `@${comment.username}` : "—";
  const date =
    comment.timestamp !== null ? new Date(comment.timestamp).toLocaleString("pt-BR") : "";

  return (
    <li data-testid="meta-comment" className="border-t border-line-subtle pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-vinho/80">{username}</p>
        {date !== "" ? <p className="text-caption text-vinho/60">{date}</p> : null}
        {comment.hidden ? (
          <span className="rounded-full border border-line-subtle px-2 py-0.5 text-caption text-vinho/70">
            Oculto (hidden)
          </span>
        ) : null}
      </div>

      <p className="mt-1 whitespace-pre-wrap text-sm text-vinho/70">{comment.text}</p>

      <div className="mt-3 flex flex-col gap-2">
        {!isReply ? (
          <form action={replyCommentAction} className="flex flex-col gap-2">
            <input type="hidden" name="mediaId" value={mediaId} />
            <input type="hidden" name="commentId" value={comment.id} />
            <textarea
              name="message"
              required
              maxLength={2200}
              rows={2}
              className="w-full rounded-card border border-line-subtle bg-white/70 p-2 text-sm text-vinho/80"
            />
            <button
              type="submit"
              className="self-start rounded-full bg-primaria px-4 py-1.5 text-sm font-semibold text-on-primary transition hover:opacity-90"
            >
              Responder
              <span className="ml-1 text-caption font-normal opacity-80">(Reply)</span>
            </button>
          </form>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <form action={toggleHiddenAction}>
            <input type="hidden" name="mediaId" value={mediaId} />
            <input type="hidden" name="commentId" value={comment.id} />
            <input type="hidden" name="hidden" value={String(!comment.hidden)} />
            <button
              type="submit"
              className="rounded-full border border-line-subtle px-4 py-1.5 text-sm font-semibold text-vinho/70 transition hover:opacity-90"
            >
              {comment.hidden ? "Mostrar" : "Ocultar"}
              <span className="ml-1 text-caption font-normal opacity-80">
                ({comment.hidden ? "Unhide" : "Hide"})
              </span>
            </button>
          </form>

          <form action={deleteCommentAction}>
            <input type="hidden" name="mediaId" value={mediaId} />
            <input type="hidden" name="commentId" value={comment.id} />
            <button
              type="submit"
              className="rounded-full border border-line-subtle px-4 py-1.5 text-sm font-semibold text-vinho/70 transition hover:opacity-90"
            >
              Excluir
              <span className="ml-1 text-caption font-normal opacity-80">(Delete)</span>
            </button>
          </form>
        </div>
      </div>

      {comment.replies.length > 0 ? (
        <ul className="ml-6 mt-3 flex flex-col gap-3">
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} mediaId={mediaId} isReply />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
