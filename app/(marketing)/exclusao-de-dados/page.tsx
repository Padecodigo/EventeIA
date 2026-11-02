import { LegalDocument } from "@/components/legal/legal-document";
import { DATA_DELETION_SECTIONS } from "@/lib/legal/policies";
import { pageMetadata } from "@/lib/seo/site";

export const metadata = pageMetadata({
  title: "Exclusão de Dados",
  description:
    "Como pedir a exclusão dos seus dados no EventeIA, inclusive os recebidos pelo Instagram e pelo Messenger (LGPD).",
  path: "/exclusao-de-dados",
});

export default function DataDeletionPage() {
  return (
    <LegalDocument
      eyebrow="Privacidade e LGPD"
      title="Instruções de Exclusão de Dados"
      intro="Como pedir que o EventeIA apague os seus dados, inclusive os recebidos pelo Instagram e pelo Facebook Messenger."
      sections={DATA_DELETION_SECTIONS}
    />
  );
}
