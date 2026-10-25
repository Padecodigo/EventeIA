import { addBusinessDays, formatDayLabel, isWithinBusinessWindow, OUTREACH_WINDOW } from "@/lib/business-days";
import { searchStartInstant, spDateKey } from "@/lib/search-start";

/**
 * Texto do aviso, coerente com o gating de dias úteis (busca/contato só seg–sex, sem feriados, 9h–18h)
 * e com a data agendada pelo cliente (`searchStartDate`, YYYY-MM-DD; null = o quanto antes).
 */
export function quotePreparingCopy(
  now: Date = new Date(),
  searchStartDate: string | null = null,
): { headline: string; detail: string } {
  const start = searchStartInstant(now, searchStartDate, OUTREACH_WINDOW);
  const startsNow = start.getTime() <= now.getTime() && isWithinBusinessWindow(now, OUTREACH_WINDOW);
  // Prazo: 2 dias úteis contados a partir do início efetivo da busca.
  const deadline = formatDayLabel(addBusinessDays(startsNow ? now : start, 2));
  const headline = `Seu orçamento está sendo preparado! Vamos te avisar por e-mail em até 2 dias úteis (até ${deadline}).`;
  const close = "Você pode fechar esta página — nada mais precisa ser feito agora.";
  if (startsNow) {
    return {
      headline,
      detail: `O agente já está buscando fornecedores na sua cidade e pedindo cotações. ${close}`,
    };
  }
  const label = formatDayLabel(spDateKey(start));
  if (searchStartDate !== null && searchStartDate > spDateKey(now)) {
    return {
      headline,
      detail: `Busca agendada: começamos a procurar e contatar fornecedores ${label}, às 9h (horário de Brasília). ${close}`,
    };
  }
  return {
    headline,
    detail: `Buscamos e contatamos fornecedores só em dias úteis, em horário comercial — a busca começa ${label}, às 9h. ${close}`,
  };
}

/** Aviso exibido depois que o evento foi salvo/ativado — em vez de um spinner. */
export function QuotePreparingNotice({ now, searchStartDate = null }: { now?: Date; searchStartDate?: string | null } = {}) {
  const { headline, detail } = quotePreparingCopy(now, searchStartDate);
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
