import { FACEBOOK_MESSENGER_URL, INSTAGRAM_DM_URL } from "@/lib/social";

export const FOLLOW_INSTAGRAM_TEXT =
  "Fazemos tudo pelo Instagram. Siga nossa página e mande uma mensagem no direct: é por lá que avisamos sobre as opções de produtos e entramos em contato com você.";

const primaryClasses =
  "inline-flex items-center justify-center gap-2 rounded-full bg-primaria px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_-12px_rgba(163,72,90,0.7)] transition duration-editorial ease-editorial hover:bg-primaria-escura";

const secondaryClasses =
  "inline-flex items-center justify-center gap-2 rounded-full border border-vinho/15 bg-white px-6 py-3 text-sm font-semibold text-vinho transition duration-editorial ease-editorial hover:border-primaria/40 hover:bg-verde-claro/50";

export function FollowInstagramCard() {
  return (
    <section className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
      <h2 className="font-serif text-title-2">Fale com a gente no Instagram</h2>
      <p className="mt-2 text-sm text-vinho/75">{FOLLOW_INSTAGRAM_TEXT}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <a
          href={INSTAGRAM_DM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`${primaryClasses} w-full sm:w-auto`}
        >
          Instagram
        </a>
        <a
          href={FACEBOOK_MESSENGER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={`${secondaryClasses} w-full sm:w-auto`}
        >
          Facebook
        </a>
      </div>
    </section>
  );
}
