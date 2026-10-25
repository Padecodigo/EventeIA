import Link from "next/link";

import { TERMS_EFFECTIVE_DATE_LABEL } from "@/lib/legal/terms";

export interface LegalSection {
  id: string;
  title: string;
  paragraphs?: readonly string[];
  items?: readonly string[];
}

/** Layout comum das páginas legais (mesma identidade visual do site). */
export function LegalDocument({
  eyebrow,
  title,
  intro,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  sections: readonly LegalSection[];
}) {
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-16 sm:px-8">
      <header>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="mt-3 font-serif text-display-2 font-display">{title}</h1>
        <p className="mt-3 text-sm text-vinho/70">
          Vigente a partir de {TERMS_EFFECTIVE_DATE_LABEL}.
        </p>
        <p className="mt-4 text-base leading-7 text-vinho/80">{intro}</p>
      </header>
      {sections.map((section, index) => (
        <section key={section.id} id={section.id} className="flex flex-col gap-3">
          <h2 className="font-serif text-title-2">
            {String(index + 1)}. {section.title}
          </h2>
          {section.paragraphs?.map((text) => (
            <p key={text} className="text-sm leading-7 text-vinho/80">
              {text}
            </p>
          ))}
          {section.items !== undefined ? (
            <ul className="list-disc space-y-1 pl-5 text-sm leading-7 text-vinho/80">
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
      <p className="rounded-2xl bg-areia-secundaria/60 px-5 py-4 text-sm leading-6 text-vinho/80">
        Dúvidas ou pedidos sobre este documento? Fale com a gente pela página de{" "}
        <Link
          href="/contato"
          className="font-medium text-vinho underline decoration-champagne underline-offset-4"
        >
          contato
        </Link>
        .
      </p>
    </article>
  );
}
