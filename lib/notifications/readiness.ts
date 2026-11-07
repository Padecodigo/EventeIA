import { z } from "zod";

/**
 * Estado da coleta no momento da notificação:
 * - complete: todas as necessidades têm cotação válida;
 * - incomplete: há orçamento parcial, mas faltam categorias;
 * - empty: nenhuma cotação aproveitável para montar orçamento.
 */
export const quotationsReadyReadinessSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("complete") }),
  z.object({ status: z.literal("incomplete"), uncovered: z.array(z.string()) }),
  z.object({ status: z.literal("empty") }),
]);

export type QuotationsReadyReadiness = z.infer<typeof quotationsReadyReadinessSchema>;
