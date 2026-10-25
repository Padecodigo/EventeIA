/**
 * Revogação de contato (LGPD/anti-ban) avaliada NO MOMENTO DO ENVIO.
 *
 * Regressão: o worker de primeiro contato e o follow-up de cotação só olhavam o
 * status do prospect DESTE evento. Quem revogou depois do enfileiramento (consents
 * `opted_out`, opt-out em outro evento → `suppliers.opt_out_at`) ainda recebia mensagem.
 */
export interface OptOutSignals {
  prospectStatus: string | null | undefined;
  consentStatus: string | null | undefined;
  supplierOptOutAt: string | null | undefined;
}

export function isRecipientOptedOut(s: OptOutSignals): boolean {
  return (
    s.prospectStatus === "opt_out" ||
    s.consentStatus === "opted_out" ||
    (s.supplierOptOutAt !== null && s.supplierOptOutAt !== undefined)
  );
}
