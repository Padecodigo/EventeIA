const TRUST_ITEMS = [
  {
    title: "Orçamento explicado",
    text: "Cada número nasce de uma regra clara — faixa mínima, sugestão e teto.",
  },
  {
    title: "Fornecedores prospectados",
    text: "Nós entramos em contato e organizamos as propostas por categoria.",
  },
  {
    title: "Você aprova cada passo",
    text: "Nenhum fornecedor é fechado sem o seu “sim”. Sem letras miúdas.",
  },
  {
    title: "Pagamento sem surpresa",
    text: "Pix ou cartão. Para anfitriões, um valor único por evento.",
  },
];

export function TrustStrip() {
  return (
    <section className="border-y border-line-subtle bg-off-white">
      <div className="mx-auto grid grid-cols-1 w-full max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
        {TRUST_ITEMS.map((item) => (
          <div key={item.title} className="flex gap-3">
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-champagne"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm font-semibold text-vinho">{item.title}</p>
              <p className="mt-1 text-caption leading-5 text-vinho/75">{item.text}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
