import { centsToCsv, toCsv } from "@/lib/export/csv";

import { archiveRetentionEnd } from "./trash";

/** Linha de custo no arquivo morto (0076): somente leitura, guardada 5 anos. */
export interface ArchivedCostRow {
  id: string;
  occurred_at: string;
  provider: string;
  kind: string;
  reason: string;
  quantity: number;
  cost_brl_cents: number;
  cost_micro_usd: number;
  note: string | null;
  event_id: string | null;
  deleted_at: string | null;
  archived_at: string | null;
}

export const ARCHIVED_COST_COLUMNS =
  "id,occurred_at,provider,kind,reason,quantity,cost_brl_cents,cost_micro_usd,note,event_id,deleted_at,archived_at";

export function retentionEndIso(r: Pick<ArchivedCostRow, "occurred_at" | "archived_at">): string {
  return archiveRetentionEnd(r.occurred_at, r.archived_at ?? r.occurred_at).toISOString();
}

/** CSV fiscal do arquivo morto (datas em UTC, valores em BRL com vírgula decimal conforme centsToCsv). */
export function archivedCostsCsv(rows: readonly ArchivedCostRow[]): string {
  return toCsv(
    ["id", "data_custo_utc", "provedor", "tipo", "motivo", "quantidade", "custo_brl", "custo_micro_usd", "nota", "evento_id", "excluido_em_utc", "arquivado_em_utc", "guardar_ate_utc"],
    rows.map((r) => [
      r.id, r.occurred_at, r.provider, r.kind === "fixed" ? "fixo" : "variável", r.reason, r.quantity,
      centsToCsv(r.cost_brl_cents), r.cost_micro_usd, r.note, r.event_id, r.deleted_at, r.archived_at, retentionEndIso(r),
    ]),
  );
}
