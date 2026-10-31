import { supplierDmUrls, supplierRef } from "@/lib/outreach/supplier-links";
import { pageMetadata } from "@/lib/seo/site";

export const metadata = pageMetadata({
  title: "Seja fornecedor",
  description:
    "Fornecedores de festas e eventos: cadastre-se na EventeIA pelo Instagram ou pelo Messenger e receba pedidos de cotação de anfitriões da sua região.",
  path: "/seja-fornecedor",
  keywords: ["fornecedor de festa", "cadastro de fornecedor", "receber pedidos de cotação"],
});

const BENEFITS = [
  {
    title: "Pedidos qualificados",
    text: "Cotações de anfitriões que já definiram o tipo de evento, a data e a região.",
  },
  {
    title: "Sem abordagem fria",
    text: "Você abre a conversa. A EventeIA só responde dentro da janela de mensagem da Meta.",
  },
  {
    title: "Clareza para fechar",
    text: "Tudo em centavos e com contexto: você responde com o que faz sentido para o pedido.",
  },
];

export default async function SejaFornecedorPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>;
}) {
  const { evento } = await searchParams;
  const links = supplierDmUrls(supplierRef(evento));

  return (
    <section className="bg-[#2A1119]">
      <div className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-8 sm:py-24">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-champagne">
          Para fornecedores
        </p>
        <h1 className="mt-5 font-serif text-[clamp(2.4rem,5vw,4rem)] font-display leading-[1.02] tracking-[-0.03em] text-off-white">
          Receba pedidos de cotação <em className="italic text-champagne">sem caça.</em>
        </h1>
        <p className="mt-8 max-w-2xl text-lg leading-8 text-off-white/85">
          A EventeIA aproxima anfitriões e fornecedores de festas e eventos. Cadastre-se por um
          dos canais abaixo e comece a receber pedidos com contexto — é você quem inicia a conversa.
        </p>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <a
            href={links.instagram}
            className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft transition hover:shadow-lg"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-vinho/60">Instagram</p>
            <h2 className="mt-3 font-serif text-title-2">Abrir DM no Instagram</h2>
            <p className="mt-2 text-sm leading-6 text-vinho/75">
              Toque para abrir o Direct e enviar “quero ser fornecedor”.
            </p>
          </a>

          <a
            href={links.messenger}
            className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft transition hover:shadow-lg"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-vinho/60">Messenger</p>
            <h2 className="mt-3 font-serif text-title-2">Abrir no Messenger</h2>
            <p className="mt-2 text-sm leading-6 text-vinho/75">
              Toque para abrir o Messenger e enviar “quero ser fornecedor”.
            </p>
          </a>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-8 border-t border-white/10 pt-10 md:grid-cols-3">
          {BENEFITS.map((benefit) => (
            <article key={benefit.title}>
              <h3 className="font-serif text-2xl leading-tight text-off-white">{benefit.title}</h3>
              <p className="mt-3 text-sm leading-6 text-off-white/80">{benefit.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
