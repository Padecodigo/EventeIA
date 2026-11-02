import { CONFIRMATION_INSTRUCTIONS, INSTAGRAM_DM_URL } from "@/lib/events/confirmation-code";

/** Código de confirmação do evento (0082): aparece até o contratante enviá-lo por DM. */
export function EventConfirmationCodeCard({ code }: { code: string }) {
  return (
    <section
      aria-labelledby="codigo-confirmacao"
      className="rounded-2xl border border-vinho/15 bg-areia-secundaria p-5"
    >
      <p id="codigo-confirmacao" className="text-overline uppercase tracking-[0.14em] text-vinho/75">
        Evento criado · aguardando confirmação
      </p>
      <p className="mt-2 select-all font-mono text-title-2 tracking-widest" data-testid="confirmation-code">
        {code}
      </p>
      <p className="mt-2 text-sm text-vinho/80">{CONFIRMATION_INSTRUCTIONS}.</p>
      <a
        href={INSTAGRAM_DM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-block rounded-pill bg-vinho px-4 py-2 text-sm text-white"
      >
        Abrir DM do @eventeia
      </a>
    </section>
  );
}
