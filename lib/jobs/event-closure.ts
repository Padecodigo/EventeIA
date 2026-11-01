import { logger } from "@/lib/logger";
import { deleteMedia, type MetaPublishConfig, type PublishResult } from "@/lib/meta/publishing";

/**
 * P2 (0080) — encerramento automático e limpeza após o encerramento.
 * - auto_close_ready_events: encerra eventos ativos prontos (o gatilho apaga o conteúdo);
 * - posts publicados do evento encerrado: apaga a mídia no Instagram e depois a linha;
 * - purge_closed_event_reports: relatório/handoff saem 72h após a data do evento.
 * Nada aqui envia mensagem a ninguém.
 */

type RpcResult<T> = PromiseLike<{ data: T | null; error: { code?: string } | null }>;

export interface ClosureDb {
  rpc(fn: "auto_close_ready_events"): RpcResult<string[]>;
  rpc(fn: "purge_closed_event_posts"): RpcResult<number>;
  rpc(fn: "purge_closed_event_reports", args: { p_now: string }): RpcResult<number>;
  from(table: "prospecting_posts"): {
    select(columns: string): {
      eq(column: string, value: string): {
        not(column: string, op: string, value: null): {
          in(column: string, values: string[]): RpcResult<{ id: string; ig_media_id: string }[]>;
        };
      };
    };
    delete(): { eq(column: string, value: string): PromiseLike<{ error: { code?: string } | null }> };
  };
  from(table: "events"): {
    select(columns: string): {
      not(column: string, op: string, value: null): {
        is(column: string, value: null): {
          limit(n: number): RpcResult<{ id: string }[]>;
        };
      };
    };
  };
}

export interface ClosureDeps {
  db: ClosureDb;
  meta: MetaPublishConfig | null;
  stopBackgroundWork: (eventId: string) => Promise<void>;
  deleteMediaFn?: (input: MetaPublishConfig & { mediaId: string }) => Promise<PublishResult>;
}

export async function runEventClosureSweep(deps: ClosureDeps): Promise<{ closed: string[]; postsDeleted: number }> {
  const { data: closedData, error } = await deps.db.rpc("auto_close_ready_events");
  if (error !== null) throw new Error(`auto_close_ready_events falhou (${error.code ?? "?"})`);
  const closed = closedData ?? [];
  for (const id of closed) {
    await deps.stopBackgroundWork(id);
  }
  if (closed.length > 0) logger.info({ closed: closed.length }, "eventos encerrados automaticamente");

  let postsDeleted = 0;
  if (deps.meta !== null) {
    const { data: events } = await deps.db
      .from("events")
      .select("id")
      .not("closed_at", "is", null)
      .is("report_purged_at", null)
      .limit(200);
    const ids = (events ?? []).map((e) => e.id);
    if (ids.length > 0) {
      const { data: posts } = await deps.db
        .from("prospecting_posts")
        .select("id,ig_media_id")
        .eq("status", "published")
        .not("ig_media_id", "is", null)
        .in("event_id", ids);
      const del = deps.deleteMediaFn ?? deleteMedia;
      for (const post of posts ?? []) {
        const result = await del({ ...deps.meta, mediaId: post.ig_media_id });
        if (!result.ok) {
          logger.warn({ mediaId: post.ig_media_id }, "falha ao apagar mídia do post do evento encerrado");
          continue;
        }
        await deps.db.from("prospecting_posts").delete().eq("id", post.id);
        postsDeleted += 1;
      }
    }
  }
  const { data: leftover } = await deps.db.rpc("purge_closed_event_posts");
  postsDeleted += leftover ?? 0;
  return { closed, postsDeleted };
}

export async function runClosedReportPurge(db: ClosureDb, now: Date = new Date()): Promise<number> {
  const { data, error } = await db.rpc("purge_closed_event_reports", { p_now: now.toISOString() });
  if (error !== null) throw new Error(`purge_closed_event_reports falhou (${error.code ?? "?"})`);
  const purged = data ?? 0;
  if (purged > 0) logger.info({ purged }, "relatórios de eventos encerrados expurgados (72h após a data)");
  return purged;
}
