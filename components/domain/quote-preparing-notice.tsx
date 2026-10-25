import { addBusinessDays, formatDayLabel, isWithinBusinessWindow, nextBusinessWindowStart, OUTREACH_WINDOW } from "@/lib/business-days";

/** Texto do aviso, coerente com o gating de dias úteis (busca/contato só seg–sex, sem feriados, 9h–18h). */
export function quotePreparingCopy(now: Date = new Date()): { headline: string; detail: string } {
  const deadline = formatDayLabel(addBusinessDays(now, 2));
  const headline = `Seu orçamento está sendo preparado! Vamos te avisar por e-mail em até 2 dias úteis (até ${deadline}).`;
  if (isWithinBusinessWindow(now, OUTREACH_WINDOW)) {
    return {
      headline,
      detail:
        "O agente já está buscando fornecedores na sua cidade e pedindo cotações. Você pode fechar esta página — nada mais precisa ser feito agora.",
    };
  }
  const start = nextBusinessWindowStart(now, OUTREACH_WINDOW);
  const startKey = new Date(start.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    headline,
    detail: `Buscamos e contatamos fornecedores só em dias úteis, em horário comercial — a busca começa ${formatDayLabel(startKey)}, às 9h. Você pode fechar esta página — nada mais precisa ser feito agora.`,
  };
}

/** Aviso exibido depois que o evento foi salvo/ativado — em vez de um spinner. */
export function QuotePreparingNotice({ now }: { now?: Date } = {}) {
  const { headline, detail } = quotePreparingCopy(now);
  return (
    <div
      role="status"
      data-testid="quote-preparing-notice"
      className="rounded-xl border border-champagne/50 bg-champagne-claro/70 px-4 py-3 text-sm leading-6 text-vinho"
    >
      <p className="font-medium">{headline}</p>
      <p className="mt-1 text-vinho/75">{detail}</p>
    </div>
  );
}
