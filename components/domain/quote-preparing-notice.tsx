const QUOTE_PREPARING_MESSAGE =
  "Seu orçamento está sendo preparado! Vamos te avisar por e-mail em até 2 dias úteis.";

/** Aviso exibido depois que o evento foi salvo/ativado — em vez de um spinner. */
export function QuotePreparingNotice() {
  return (
    <div
      role="status"
      data-testid="quote-preparing-notice"
      className="rounded-xl border border-champagne/50 bg-champagne-claro/70 px-4 py-3 text-sm leading-6 text-vinho"
    >
      <p className="font-medium">{QUOTE_PREPARING_MESSAGE}</p>
      <p className="mt-1 text-vinho/75">
        O agente já está buscando fornecedores na sua cidade e pedindo cotações. Você pode fechar
        esta página — nada mais precisa ser feito agora.
      </p>
    </div>
  );
}
