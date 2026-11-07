import { logger } from "@/lib/logger";
import type { MetaPublishConfig, RemoteDeleteOutcome } from "@/lib/meta/publishing";
import {
  deleteEventPublications,
  type DeleteFacebookPostFn,
  type PublicationTableClient,
} from "@/lib/prospecting/delete-publications";

/**
 * P2 (0080) — encerramento automático e limpeza após o encerramento.
 * - auto_close_ready_events: encerra eventos ativos prontos;
 * - eventos completed/canceled: apaga posts do evento e posts de isca nos DOIS
 *   canais (Instagram + Página), mantendo ids em falha parcial;
 * - purge_closed_event_reports: relatório/handoff saem 72h após a data do evento.
 * Nada aqui envia mensagem a ninguém.
 */

type RpcResult<T> = PromiseLike<{ data: T | null; error: { code?: string } | null }>;

interface EventRow {
  id: string;
  status?: string | null;
  user_deleted_at?: string | null;
}

interface EventQuery {
  in(column: string, values: readonly string[]): EventQuery;
  is(column: string, value: null): EventQuery;
  not?(column: string, op: string, value: null): EventQuery;
  order(column: string, options: { ascending: boolean }): EventQuery;
  range(from: number, to: number): RpcResult<EventRow[]>;
}

interface EventTableClient {
  select(columns: string): EventQuery;
}

export interface ClosureDb {
  rpc(fn: "auto_close_ready_events"): RpcResult<string[]>;
  rpc(fn: "purge_closed_event_reports", args: { p_now: string }): RpcResult<number>;
  from(table: "events"): EventTableClient;
  from(table: "prospecting_posts" | "prospect_posts"): PublicationTableClient;
}

export interface ClosureDeps {
  db: ClosureDb;
  meta: MetaPublishConfig | null;
  stopBackgroundWork: (eventId: string) => Promise<void>;
  deleteMediaFn?: (input: MetaPublishConfig & { mediaId: string }) => Promise<RemoteDeleteOutcome>;
  deleteFacebookPostFn?: DeleteFacebookPostFn;
}

const TERMINAL_STATUSES = new Set(["completed", "canceled"]);

export async function runEventClosureSweep(
  deps: ClosureDeps,
): Promise<{ closed: string[]; postsDeleted: number }> {
  const { data: closedData, error } = await deps.db.rpc("auto_close_ready_events");
  if (error !== null) throw new Error(`auto_close_ready_events falhou (${error.code ?? "?"})`);
  const closed = closedData ?? [];
  for (const id of closed) {
    await deps.stopBackgroundWork(id);
  }
  if (closed.length > 0)
    logger.info({ closed: closed.length }, "eventos encerrados automaticamente");

  let postsDeleted = 0;
  if (deps.meta !== null) {
    const pageSize = 200;
    const candidates: EventRow[] = [];

    // Pré-filtro no banco: eventos que ainda têm refs remotas em qualquer uma
    // das tabelas de publicação. Se o client/fake não suportar `not`, mantém o
    // caminho legado (todos os eventos elegíveis) para não perder limpeza.
    const refEventIds = new Set<string>();
    let refFilterSupported = false;
    let refFilterBroken = false;
    for (const table of ["prospecting_posts", "prospect_posts"] as const) {
      const probe = deps.db.from(table).select("event_id");
      if (typeof probe.not !== "function") continue;
      refFilterSupported = true;
      const referenceColumns = [
        "ig_media_id",
        "fb_post_id",
        table === "prospect_posts" ? "publication" : "image_params",
      ];
      for (const column of referenceColumns) {
        const { data, error } = await probe.not(column, "is", null).limit(5000);
        if (error !== null) {
          // Antes da migração fb_post_id pode não existir; não derruba o sweep.
          const missing = error.code === "42703" || error.code === "PGRST204";
          if (missing) {
            refFilterBroken = true;
            continue;
          }
          throw new Error(`falha ao listar refs de ${table} (${error.code ?? "?"})`);
        }
        for (const row of data ?? []) {
          const eventId = row.event_id;
          if (typeof eventId === "string" && eventId.length > 0) refEventIds.add(eventId);
        }
      }
    }
    if (refFilterSupported && refEventIds.size === 0 && !refFilterBroken) {
      return { closed, postsDeleted };
    }
    const restrictRefs = (query: EventQuery): EventQuery =>
      refFilterSupported && refEventIds.size > 0 ? query.in("id", [...refEventIds]) : query;

    const collect = async (build: () => EventQuery): Promise<void> => {
      let offset = 0;
      for (;;) {
        const { data, error } = await build()
          .order("id", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error !== null) {
          throw new Error(`falha ao listar eventos para limpeza (${error.code ?? "?"})`);
        }
        const page = data ?? [];
        candidates.push(...page);
        if (page.length < pageSize) return;
        offset += pageSize;
      }
    };

    await collect(() =>
      restrictRefs(
        deps.db
          .from("events")
          .select("id,status,user_deleted_at")
          .in("status", [...TERMINAL_STATUSES]),
      ),
    );

    // Eventos apagados pelo usuário (0075) entram mesmo depois do expurgo do
    // relatório. A consulta é paginada e o erro NÃO é ignorado.
    const supportsDeletedQuery =
      typeof deps.db.from("events").select("id,status,user_deleted_at").not === "function";
    if (supportsDeletedQuery) {
      await collect(() => {
        const query = deps.db.from("events").select("id,status,user_deleted_at");
        return typeof query.not === "function" ? query.not("user_deleted_at", "is", null) : query;
      });
    }

    const ids = [...new Set(candidates.map((event) => event.id))];

    for (const eventId of ids) {
      const result = await deleteEventPublications({
        db: deps.db,
        eventId,
        meta: deps.meta,
        deleteMediaFn: deps.deleteMediaFn,
        deleteFacebookPostFn: deps.deleteFacebookPostFn,
      });
      postsDeleted += result.rowsDeleted;
    }
  }
  // NÃO chamamos purge_closed_event_posts antes da migração revisada: a função
  // atual (0080) apaga linhas com ids remotos pendentes. Até lá, a limpeza
  // acima é a única que remove/limpa linhas.
  return { closed, postsDeleted };
}

export async function runClosedReportPurge(db: ClosureDb, now: Date = new Date()): Promise<number> {
  const { data, error } = await db.rpc("purge_closed_event_reports", { p_now: now.toISOString() });
  if (error !== null) throw new Error(`purge_closed_event_reports falhou (${error.code ?? "?"})`);
  const purged = data ?? 0;
  if (purged > 0)
    logger.info({ purged }, "relatórios de eventos encerrados expurgados (72h após a data)");
  return purged;
}
