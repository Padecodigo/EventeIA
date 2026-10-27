import { describe, expect, it } from "vitest";

import {
  SUPPLIERS_CLEAR_CONFIRMATION,
  isSuppliersClearConfirmed,
} from "@/lib/admin/suppliers";
import { BULK_CLEAR_CONFIRMATION, isBulkClearConfirmed } from "@/lib/events/lifecycle";

describe("confirmação da limpeza em massa", () => {
  it("aceita a palavra exata, ignorando caixa e espaços", () => {
    expect(isBulkClearConfirmed("LIMPAR")).toBe(true);
    expect(isBulkClearConfirmed("limpar")).toBe(true);
    expect(isBulkClearConfirmed("  Limpar  ")).toBe(true);
  });

  it("recusa qualquer outra entrada", () => {
    for (const value of ["", "limp", "LIMPAR TUDO", "sim", null, undefined, 1, {}]) {
      expect(isBulkClearConfirmed(value)).toBe(false);
    }
  });

  it("usa a mesma palavra nos eventos e nos fornecedores", () => {
    expect(BULK_CLEAR_CONFIRMATION).toBe("LIMPAR");
    expect(SUPPLIERS_CLEAR_CONFIRMATION).toBe("LIMPAR");
    expect(isSuppliersClearConfirmed("limpar")).toBe(true);
    expect(isSuppliersClearConfirmed("excluir")).toBe(false);
  });
});
