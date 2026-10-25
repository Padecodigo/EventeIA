import { LegalDocument } from "@/components/legal/legal-document";
import { PRIVACY_SECTIONS } from "@/lib/legal/content";
import { pageMetadata } from "@/lib/seo/site";

export const metadata = pageMetadata({
  title: "Política de Privacidade",
  description:
    "Política de Privacidade do EventeIA: quais dados coletamos, como usamos, com quem compartilhamos e os seus direitos na LGPD.",
  path: "/privacidade",
});

export default function PrivacyPage() {
  return (
    <LegalDocument
      eyebrow="Privacidade e LGPD"
      title="Política de Privacidade"
      intro="Como o EventeIA coleta, usa e protege os seus dados, de acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018)."
      sections={PRIVACY_SECTIONS}
    />
  );
}
