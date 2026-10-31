import { INSTAGRAM_HANDLE } from "@/lib/social/contact";

/**
 * Links de entrada do fornecedor (janela iniciada pelo fornecedor — nunca
 * abordagem fria). O `ref` carrega a origem para o webhook do Meta vincular a
 * conversa ao evento (`event:<id>`) ou marcá-la como cadastro de fornecedor.
 */

/** Username da Página no Messenger (deve bater com a Página conectada ao token). */
const MESSENGER_PAGE_USERNAME = "eventeia";

export interface SupplierDmLinks {
  instagram: string;
  messenger: string;
}

export function supplierDmUrls(ref: string): SupplierDmLinks {
  const encoded = encodeURIComponent(ref);
  return {
    instagram: `https://ig.me/m/${INSTAGRAM_HANDLE}?ref=${encoded}`,
    messenger: `https://m.me/${MESSENGER_PAGE_USERNAME}?ref=${encoded}`,
  };
}

/** Ref do link: `event:<uuid>` quando há contexto de evento; senão `fornecedor`. */
export function supplierRef(eventId?: string | null): string {
  const trimmed = eventId?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? `event:${trimmed}` : "fornecedor";
}
