import { LegalDocument } from "@/components/legal/legal-document";
import { TERMS_SECTIONS } from "@/lib/legal/content";
import { pageMetadata } from "@/lib/seo/site";

export const metadata = pageMetadata({
  title: "Termos de Uso",
  description:
    "Termos de Uso do EventeIA: como funciona o serviço, créditos, pagamentos, reembolso e responsabilidades.",
  path: "/termos",
});

export default function TermsPage() {
  return (
    <LegalDocument
      eyebrow="Termos"
      title="Termos de Uso"
      intro="Regras simples para usar o EventeIA. Leia com atenção: ao criar uma conta ou comprar créditos, você concorda com elas."
      sections={TERMS_SECTIONS}
    />
  );
}
