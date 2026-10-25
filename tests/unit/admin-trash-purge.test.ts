import { describe, expect, it } from "vitest";

import { softDeleteSupplier, supplierBlockedAt, type SupplierDb } from "@/lib/admin/suppliers";
import { PURGE_BLOCKED, purgeConfirmed, purgeItems, purgeSummary, type PurgeDb } from "@/lib/admin/trash";

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

  it("nunca apaga custos (registros fiscais de 5 anos) e explica o motivo", async () => {
    const db = memDb({ cost_entries: [{ id: id(3), deleted_at: T }] });
    const r = await purgeItems(db as unknown as PurgeDb, "custos", "all", "admin1");
    expect(r).toMatchObject({ deleted: 0, skipped: 1 });
    expect(r.reason).toContain("5 anos");
    expect(db.tables.cost_entries).toHaveLength(1);
    expect(db.tables.admin_audit_log).toHaveLength(0);
    expect(PURGE_BLOCKED.custos).toBeTruthy();
  });

  it("fornecedor ligado a evento (FK vendor_prospects) é mantido; os demais são apagados", async () => {
    const db = memDb({
      suppliers: [{ id: id(4), deleted_at: T }, { id: id(5), deleted_at: T }, { id: id(6), deleted_at: null }],
      vendor_prospects: [{ id: id(9), supplier_id: id(4) }],
    });
    const r = await purgeItems(db as unknown as PurgeDb, "fornecedores", "all", "admin1");
    expect(r).toMatchObject({ deleted: 1, skipped: 1 });
    expect(db.tables.suppliers.map((x) => x.id)).toEqual([id(4), id(6)]);
    expect(purgeSummary([r])).toMatch(/1 item apagado.*Fornecedores: 1 item mantido/);
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
