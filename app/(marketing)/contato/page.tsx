import { SupportForm } from "@/components/support/support-form";

export const metadata = {
  title: "Contato — sugestões, reclamações e suporte",
  description: "Fale com a equipe EventeIA: sugestões, reclamações, elogios ou relato de problemas.",
};

export default function ContactPage() {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-16 sm:px-8">
      <header>
        <p className="eyebrow">Contato</p>
        <h1 className="mt-3 font-serif text-display-2 font-display">Fale com a gente.</h1>
        <p className="mt-3 text-sm leading-6 text-vinho/75">
          Sugestões, reclamações, elogios ou um problema? Respondemos no e-mail informado. Já tem conta? Entre e use
          “Ajuda e feedback” para acompanhar tudo em “Meus chamados”.
        </p>
      </header>
      <SupportForm withEmail />
    </section>
  );
}
