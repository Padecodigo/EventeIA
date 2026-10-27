import { describe, expect, it } from "vitest";

import { BULK_CANCEL_CONFIRMATION, isBulkCancelConfirmed } from "@/lib/events/lifecycle";

describe("confirmação do cancelamento em massa", () => {
  it("aceita a palavra exata, ignorando caixa e espaços", () => {
    expect(isBulkCancelConfirmed("CANCELAR")).toBe(true);
    expect(isBulkCancelConfirmed("cancelar")).toBe(true);
    expect(isBulkCancelConfirmed("  Cancelar  ")).toBe(true);
  });

  it("recusa qualquer outra entrada", () => {
    for (const value of ["", "cancel", "CANCELAR TUDO", "sim", null, undefined, 1, {}]) {
      expect(isBulkCancelConfirmed(value)).toBe(false);
    }
  });

  it("mantém a palavra anunciada na interface", () => {
    expect(BULK_CANCEL_CONFIRMATION).toBe("CANCELAR");
  });
});
