import { isWithinBusinessWindow, nextBusinessWindowStart, OUTREACH_WINDOW } from "@/lib/business-days";

/**
 * Regra dura: o agente só fala com fornecedor em dia útil, 09:00–18:00 de Brasília.
 * Fora disso o job é adiado (BullMQ moveToDelayed) até a próxima abertura.
 */
export class OutsideBusinessHoursError extends Error {
  readonly until: Date;
  constructor(until: Date) {
    super(`fora do horário comercial; adiado até ${until.toISOString()}`);
    this.name = "OutsideBusinessHoursError";
    this.until = until;
  }
}

/** Lança OutsideBusinessHoursError quando `now` está fora da janela de contato. */
export function assertBusinessHours(now: Date): void {
  if (!isWithinBusinessWindow(now, OUTREACH_WINDOW)) {
    throw new OutsideBusinessHoursError(nextBusinessWindowStart(now, OUTREACH_WINDOW));
  }
}
