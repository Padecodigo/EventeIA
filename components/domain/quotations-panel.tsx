import { QuotationForm } from "@/components/domain/quotation-form";
import { formatBRL } from "@/lib/money";

const categoryLabels: Record<string, string> = {
  buffet: "Buffet",
  decoracao: "Decoração",
  musica: "Música",
  fotografia: "Fotografia",
  espaco: "Espaço",
  outro: "Outro",
};

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  sent: "Enviada",
  confirmed: "Confirmada",
  declined: "Recusada",
  expired: "Expirada",
  repassado: "Repassado",
};

export interface QuotationRow {
  id: string;
  category: string;
  vendor_name: string;
  vendor_contact: string | null;
  amount_cents: number;
  status: string;
  created_at: string;
}

export function QuotationsPanel({
  eventId,
  quotations,
}: {
  eventId: string;
  quotations: readonly QuotationRow[];
}) {
  const totalCents = quotations.reduce((sum, item) => sum + item.amount_cents, 0);

  return (
    <section className="rounded-card border border-line-subtle bg-off-white shadow-soft">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line-subtle px-6 py-5">
        <div>
          <h2 className="font-serif text-title-1">Cotações</h2>
          <p className="mt-1 text-caption text-vinho/70">
            Registre as propostas recebidas e compare os caminhos.
          </p>
        </div>
      </header>

      {quotations.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="text-left text-overline uppercase tracking-[0.12em] text-vinho/70">
                <th className="px-6 py-3 font-medium">Fornecedor</th>
                <th className="px-6 py-3 font-medium">Categoria</th>
                <th className="px-6 py-3 text-right font-medium">Valor</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {quotations.map((quotation) => (
                <tr key={quotation.id} className="border-t border-line-subtle even:bg-areia-quente/60">
                  <td className="px-6 py-3 text-vinho">
                    {quotation.vendor_name}
                    {quotation.vendor_contact !== null && quotation.vendor_contact.length > 0 ? (
                      <span className="block text-caption text-vinho/70">
                        {quotation.vendor_contact}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-6 py-3 text-vinho/75">
                    {categoryLabels[quotation.category] ?? quotation.category}
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums text-vinho">
                    {formatBRL(quotation.amount_cents)}
                  </td>
                  <td className="px-6 py-3 text-caption text-vinho/70">
                    {statusLabels[quotation.status] ?? quotation.status}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-champagne/60 bg-areia-quente">
                <td className="px-6 py-4 font-serif text-title-3" colSpan={2}>
                  Total das propostas
                </td>
                <td className="px-6 py-4 text-right font-serif text-title-2 tabular-nums">
                  {formatBRL(totalCents)}
                </td>
                <td className="px-6 py-4" />
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-6 py-6 text-sm text-vinho/70">
          Nenhuma cotação ainda. Registre a primeira proposta abaixo.
        </p>
      )}

      <div className="border-t border-line-subtle px-6 py-6">
        <h3 className="font-serif text-title-3">Nova cotação</h3>
        <QuotationForm eventId={eventId} />
      </div>
    </section>
  );
}
