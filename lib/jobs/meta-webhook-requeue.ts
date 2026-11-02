import type { MetaWebhookJobData } from "@/lib/jobs/meta-webhook";

/**
 * Reenfileira eventos do Meta presos em `webhook_events.status = 'received'`.
 *
 * A rota persiste o evento e depois enfileira no Redis. Se o job some (Redis
 * recriado num redeploy, falha entre persistir e enfileirar), o evento fica
 * `received` para sempre — nada mais o reprocessa. Este sweep fecha essa
 * lacuna. É idempotente: o jobId é o mesmo da rota (BullMQ deduplica) e o
 * worker ignora eventos já `processed`.
 *
 * Só olha eventos dentro de `maxAgeMs` (padrão 48h): eventos antigos (ex.:
 * simulações de QA) não são reprocessados automaticamente.
 */

export interface StaleMetaEventRow {
  id: string;
  external_event_id: string;
  payload: unknown;
}

export interface RequeueDeps {
  listStale(olderThanIso: string, newerThanIso: string, limit: number): Promise<StaleMetaEventRow[]>;
  enqueue(jobId: string, data: MetaWebhookJobData): Promise<void>;
  now(): Date;
}

export interface RequeueOptions {
  minAgeMs?: number;
  maxAgeMs?: number;
  limit?: number;
}

/** Mesma regra da rota: ':' é reservado pelo BullMQ. */
export function metaJobId(externalEventId: string): string {
  return `meta_${externalEventId.replaceAll(":", "_")}`;
}

/** Deduz o tipo do job pelo formato do payload persistido pela rota. */
export function kindOfPayload(payload: unknown): MetaWebhookJobData["kind"] | null {
  if (payload === null || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.commentId === "string") return "comment";
  if (typeof p.eventId !== "string") return null;
  if (typeof p.senderId === "string") return "message";
  if ("appId" in p) return "echo";
  return null;
}

export async function requeueStaleMetaWebhooks(
  deps: RequeueDeps,
  options: RequeueOptions = {},
): Promise<{ requeued: number; skipped: number }> {
  const minAgeMs = options.minAgeMs ?? 5 * 60_000;
  const maxAgeMs = options.maxAgeMs ?? 48 * 3_600_000;
  const now = deps.now().getTime();
  const rows = await deps.listStale(
    new Date(now - minAgeMs).toISOString(),
    new Date(now - maxAgeMs).toISOString(),
    options.limit ?? 200,
  );
  let requeued = 0;
  let skipped = 0;
  for (const row of rows) {
    const kind = kindOfPayload(row.payload);
    if (kind === null) {
      skipped += 1;
      continue;
    }
    await deps.enqueue(metaJobId(row.external_event_id), {
      kind,
      webhookEventId: row.id,
      event: row.payload as MetaWebhookJobData["event"],
    });
    requeued += 1;
  }
  return { requeued, skipped };
}
