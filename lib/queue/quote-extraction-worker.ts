import { Worker } from "bullmq";
import type { Redis } from "ioredis";

import { logger } from "@/lib/logger";
import { QUEUE_NAMES } from "@/lib/queue";
import { processQuoteMessage, quoteExtractionJobSchema } from "@/lib/quotes/collector";
import { createCollectorDeps } from "@/lib/quotes/runtime";

/** Fila de extração: inbound do fornecedor → roteador (DeepSeek primário) → rascunho em quotations. */
export function createQuoteExtractionWorker(connection: Redis): Worker {
  return new Worker(
    QUEUE_NAMES.quoteExtraction,
    async (job) => {
      const data = quoteExtractionJobSchema.parse(job.data);
      const outcome = await processQuoteMessage(createCollectorDeps(), data);
      logger.info({ eventId: data.eventId, prospectId: data.prospectId, outcome }, "cotação processada");
    },
    { connection, concurrency: 2 },
  );
}
