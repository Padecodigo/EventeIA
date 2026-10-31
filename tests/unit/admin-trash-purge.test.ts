import { describe, expect, it } from "vitest";

import { softDeleteSupplier, supplierBlockedAt, type SupplierDb } from "@/lib/admin/suppliers";
import { PURGE_BLOCKED, SUPPLIER_REFERENCING_TABLES, archiveRetentionEnd, supplierAnonymizePatch, purgeConfirmed, purgeItems, purgeSummary, type PurgeDb } from "@/lib/admin/trash";

import { memDb } from "./helpers/mem-db";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const T = "2026-10-25T10:00:00.000Z";

describe("exclusão definitiva da lixeira", () => {
  it("só apaga itens que já estão na lixeira e registra auditoria", async () => {
    const db = memDb({ finance_alerts: [{ id: id(1), deleted_at: T }, { id: id(2), deleted_at: null }] });
    const r = await purgeItems(db as unknown as PurgeDb, "alertas", [id(1), id(2), "lixo"], "admin1");
    expect(r.deleted).toBe(1);
    expect(db.tables.finance_alerts.map((x) => x.id)).toEqual([id(2)]);
    expect(db.tables.admin_audit_log[0]).toMatchObject({ admin_id: "admin1", action: "trash.purge", target_table: "finance_alerts", target_ids: [id(1)] });
  });

  it("custos vão para o arquivo morto (archived_at), não são apagados", async () => {
    const db = memDb({ cost_entries: [{ id: id(3), deleted_at: T }, { id: id(30), deleted_at: null }] });
    const r = await purgeItems(db as unknown as PurgeDb, "custos", "all", "admin1", new Date(T));
    expect(r).toMatchObject({ deleted: 0, archived: 1 });
    expect(db.tables.cost_entries).toHaveLength(2);
    expect(db.tables.cost_entries[0]).toMatchObject({ archived_at: T, archived_by: "admin1" });
    expect(db.tables.cost_entries[1].archived_at).toBeUndefined();
    expect(db.tables.admin_audit_log[0]).toMatchObject({ action: "trash.empty.archive" });
    expect(PURGE_BLOCKED.custos).toBeUndefined();
    // segundo esvaziamento não re-arquiva nada
    const again = await purgeItems(db as unknown as PurgeDb, "custos", "all", "admin1");
    expect([again.deleted, again.archived ?? 0]).toEqual([0, 0]);
  });

  it("fornecedor referenciado é anonimizado (PII fora, linha mantida); o solto é apagado", async () => {
    const db = memDb({
      suppliers: [{ id: id(4), deleted_at: T, name: "Buffet X", phone_e164: "+5512999990000", contact_email: "a@b.c", website_url: "https://x", source_url: "https://s", external_id: "g1" }, { id: id(5), deleted_at: T }, { id: id(6), deleted_at: null }],
      vendor_prospects: [{ id: id(9), supplier_id: id(4) }],
    });
    const r = await purgeItems(db as unknown as PurgeDb, "fornecedores", "all", "admin1", new Date(T));
    expect(r).toMatchObject({ deleted: 1, anonymized: 1, skipped: 0 });
    expect(db.tables.suppliers.map((x) => x.id)).toEqual([id(4), id(6)]);
    expect(db.tables.suppliers[0]).toMatchObject({ ...supplierAnonymizePatch(new Date(T)), deleted_at: T });
    expect(purgeSummary([r])).toMatch(/1 item apagado.*1 fornecedor anonimizado/);
  });

  it("regressão 31/10: fornecedor só em prospect_conversations não derruba o esvaziamento e é anonimizado", async () => {
    const db = memDb({
      suppliers: [{ id: id(10), deleted_at: T }, { id: id(11), deleted_at: T }, { id: id(12), deleted_at: T }],
      prospect_conversations: [{ id: id(20), supplier_id: id(10) }],
      supplier_selections: [{ id: id(21), supplier_id: id(11) }],
    });
    const r = await purgeItems(db as unknown as PurgeDb, "fornecedores", "all", "admin1");
    expect(r).toMatchObject({ deleted: 1, anonymized: 2 });
    expect(db.tables.suppliers.map((x) => x.id)).toEqual([id(10), id(11)]);
    expect(SUPPLIER_REFERENCING_TABLES).toContain("prospect_conversations");
  });

  it("retenção do arquivo morto: 5 anos a partir do mais tardio (custo ou arquivamento)", () => {
    expect(archiveRetentionEnd("2026-01-10T00:00:00Z", T).toISOString()).toBe("2031-10-25T10:00:00.000Z");
    expect(archiveRetentionEnd("2027-01-10T00:00:00.000Z", T).toISOString()).toBe("2032-01-10T00:00:00.000Z");
  });

  it("chamados apagados devolvem os anexos para remoção", async () => {
    const db = memDb({ support_tickets: [{ id: id(7), deleted_at: T, attachment_path: "u/x.png" }] });
    const r = await purgeItems(db as unknown as PurgeDb, "chamados", [id(7)], "admin1");
    expect(r.attachments).toEqual(["u/x.png"]);
    expect(db.tables.support_tickets).toHaveLength(0);
  });

  it("confirmação exige digitar EXCLUIR", () => {
    expect(purgeConfirmed("excluir ")).toBe(true);
    expect(purgeConfirmed("sim")).toBe(false);
    expect(purgeConfirmed(null)).toBe(false);
  });
});

describe("excluir fornecedor (soft delete)", () => {
  it("marca deleted_at/deleted_by e bloqueia busca/contato", async () => {
    const db = memDb({ suppliers: [{ id: id(8), deleted_at: null, opt_out_at: null }] });
    expect(await softDeleteSupplier(db as unknown as SupplierDb, id(8), "admin1", new Date(T))).toEqual({ ok: true });
    expect(db.tables.suppliers[0]).toMatchObject({ deleted_at: T, deleted_by: "admin1" });
    expect(supplierBlockedAt(db.tables.suppliers[0] as never)).toBe(T);
    expect(supplierBlockedAt({ opt_out_at: null, deleted_at: null })).toBeNull();
    expect(await softDeleteSupplier(db as unknown as SupplierDb, "x", "admin1")).toMatchObject({ ok: false });
  });
});
