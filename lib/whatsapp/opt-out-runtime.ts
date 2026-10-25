import "server-only";

import { supplierBlockedAt } from "@/lib/admin/suppliers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { isRecipientOptedOut } from "./opt-out";

/** Consulta consents + fornecedor logo antes de enviar (revogação sempre vence). */
export async function recipientOptedOut(input: {
  phoneE164: string;
  prospectStatus: string | null | undefined;
  supplierId: string | null | undefined;
}): Promise<boolean> {
  if (input.prospectStatus === "opt_out") return true;
  const admin = getSupabaseAdmin();
  const [consent, supplier] = await Promise.all([
    admin
      .from("consents")
      .select("status")
      .eq("phone_e164", input.phoneE164)
      .eq("channel", "whatsapp")
      .maybeSingle(),
    input.supplierId
      ? admin.from("suppliers").select("opt_out_at,deleted_at").eq("id", input.supplierId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return isRecipientOptedOut({
    prospectStatus: input.prospectStatus,
    consentStatus: consent.data?.status,
    // Fornecedor na lixeira do admin também não recebe mensagens.
    supplierOptOutAt: supplierBlockedAt(supplier.data),
  });
}
