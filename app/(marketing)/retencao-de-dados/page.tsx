import { LegalDocument } from "@/components/legal/legal-document";
import { RETENTION_SECTIONS } from "@/lib/legal/policies";
import { pageMetadata } from "@/lib/seo/site";

export const metadata = pageMetadata({
  title: "Política de Retenção de Dados",
  description:
    "Por quanto tempo o EventeIA guarda os seus dados (LGPD): arquivos e conversas do evento, pagamentos, registros fiscais e dados da conta.",
  path: "/retencao-de-dados",
});

export default function RetentionPage() {
  return (
    <LegalDocument
      eyebrow="Privacidade e LGPD"
      title="Política de Retenção de Dados"
      intro="Por quanto tempo guardamos os seus dados e o que acontece depois, de acordo com a LGPD (Lei 13.709/2018)."
      sections={RETENTION_SECTIONS}
    />
  );
}
