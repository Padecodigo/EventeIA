import { formatBRL } from "@/lib/money";
import type { WelcomeAdminData } from "@/lib/welcome/admin";

const SOURCE_LABELS = { new_ip: "Novo visitante", convite: "Convite", promo: "Promo/anúncio" } as const;

/** Uso do cupom de boas-vindas (R$ 47, prazo de 24h no banco). Server component. */
export function WelcomeStats({ data, title = "Boas-vindas (R$ 47 · 24h)" }: { data: WelcomeAdminData; title?: string }) {
  const items: [string, string][] = [
    ["Emitidos", String(data.issued)],
    ["Ativos agora", String(data.active)],
    ["Expirados", String(data.expired)],
    ["Vinculados a conta", String(data.bound)],
    ["Usados (pagos)", String(data.redeemed)],
    ["Conversão", `${(data.conversionBps / 100).toFixed(1)}%`],
    ["Desconto concedido", formatBRL(data.discountGivenCents)],
    ["Receita com a oferta", formatBRL(data.revenueCents)],
  ];
  return (
    <section aria-labelledby="welcome-stats" className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
      <h2 id="welcome-stats" className="font-serif text-title-2">{title}</h2>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map(([label, value]) => (
          <div key={label}>
            <dt className="text-caption text-vinho/70">{label}</dt>
            <dd className="font-serif text-title-1 tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-caption text-vinho/70">
        Por origem:{" "}
        {(Object.keys(SOURCE_LABELS) as (keyof typeof SOURCE_LABELS)[])
          .map((k) => `${SOURCE_LABELS[k]} ${String(data.bySource[k])}`)
          .join(" · ")}
      </p>
    </section>
  );
}
