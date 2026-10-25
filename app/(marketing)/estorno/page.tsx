import { LegalDocument } from "@/components/legal/legal-document";
import { REFUND_SECTIONS } from "@/lib/legal/policies";
import { pageMetadata } from "@/lib/seo/site";

export const metadata = pageMetadata({
  title: "Política de Estorno e Disputa de Pagamento",
  description:
    "Política de Estorno do EventeIA: arrependimento em 7 dias, reembolso de tickets não usados, prazos via Pix e cartão e como funcionam chargeback e MED do Pix.",
  path: "/estorno",
});

export default function RefundPage() {
  return (
    <LegalDocument
      eyebrow="Pagamentos"
      title="Política de Estorno e Disputa de Pagamento"
      intro="Quando você tem direito a reembolso, como pedir, em quanto tempo o valor volta e como tratamos disputas de pagamento."
      sections={REFUND_SECTIONS}
    />
  );
}
