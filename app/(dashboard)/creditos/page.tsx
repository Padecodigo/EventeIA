import Link from "next/link";

import { CancelSubscriptionForm } from "@/components/domain/cancel-subscription-form";
import { CreditSliderForm } from "@/components/domain/credit-slider-form";
import { SingleEventOffer } from "@/components/domain/single-event-offer";
import { SubscribePlanForm } from "@/components/domain/subscribe-plan-form";
import { requireUser } from "@/lib/auth";
import { currentBalanceCents } from "@/lib/credits";
import { formatBRL, roundHalfUpDiv } from "@/lib/money";
import { offerDiscountCents, offerHeadline } from "@/lib/offers/pure";
import { activeUserOffer } from "@/lib/offers/server";
import { PLANS } from "@/lib/plans";
import { ticketPriceCents } from "@/lib/seo/pricing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ensureWorkspace } from "@/lib/workspace/server";

import { createWorkspaceAction } from "./actions";

export const metadata = { title: "Créditos" };

const entryLabels: Record<string, string> = {
  grant: "Franquia concedida",
  topup: "Compra de pacote",
  consume: "Ativação de evento",
  refund: "Estorno",
  expire: "Expiração",
  adjust: "Ajuste",
};

export default async function CreditsPage() {
  const user = await requireUser();
  const supabase = await createSupabaseServerClient();

  // Idempotente: garante o workspace antes de consultar os créditos. Sem isto,
  // na 1ª visita a página consultava antes do layout criar o workspace (corrida)
  // e exibia "Criar meu workspace" mesmo com o workspace sendo criado.
  const workspace = await ensureWorkspace(user.id);

  if (workspace === null) {
    return (
      <div className="flex max-w-2xl flex-col gap-6">
        <header>
          <p className="eyebrow">Créditos B2B</p>
          <h1 className="mt-3 font-serif text-display-2 font-display">Seu ateliê começa aqui.</h1>
          <p className="mt-3 text-sm leading-6 text-vinho/75">
            Crie um workspace para organizar os eventos dos seus clientes e comprar pacotes de
            créditos. Cada crédito ativa um evento.
          </p>
        </header>

        <section className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
          <form action={createWorkspaceAction}>
            <button
              type="submit"
              className="rounded-full bg-primaria px-6 py-3 text-sm font-semibold text-on-primary transition hover:bg-primaria-escura"
            >
              Criar meu workspace
            </button>
          </form>
          <p className="mt-3 text-caption text-vinho/70">
            Você pode cadastrar o CPF depois, em{" "}
            <Link href="/perfil" className="underline decoration-champagne underline-offset-4">
              Perfil
            </Link>
            , antes de comprar créditos.
          </p>
        </section>

        <SingleEventOffer priceCents={ticketPriceCents()} />
      </div>
    );
  }

  const [entriesResult, subscriptionResult] = await Promise.all([
    supabase
      .from("credit_ledger")
      .select("id,entry_type,amount_cents,balance_after_cents,created_at,note")
      .eq("workspace_id", workspace.id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("subscriptions")
      .select("plan_code,status,current_period_end")
      .eq("workspace_id", workspace.id)
      .in("status", ["pending", "active", "overdue"])
      .limit(1)
      .maybeSingle(),
  ]);

  const activeOffer = await activeUserOffer(user.id);
  const packOffer =
    activeOffer === null
      ? null
      : {
          headline: offerHeadline(activeOffer.kind, activeOffer),
          remainingMs: activeOffer.remainingMs,
          avulsoOffCents: activeOffer.avulsoOffCents,
          packPercent: activeOffer.packPercent,
        };

  const ledger = (entriesResult.data ?? []).filter((entry) => entry.amount_cents !== 0);
  const balance = currentBalanceCents(entriesResult.data ?? []);
  const subscription = subscriptionResult.data ?? null;

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="eyebrow">Créditos B2B</p>
          <h1 className="mt-3 font-serif text-display-2 font-display">Sua franquia, explicada.</h1>
          <p className="mt-2 text-sm text-vinho/75">{workspace.name}</p>
        </div>
        <div className="rounded-card border border-line-subtle bg-off-white px-6 py-4 shadow-soft">
          <p className="text-caption text-vinho/70">Saldo disponível</p>
          <p className="font-serif text-display-2 tabular-nums">
            {String(Math.trunc(balance / 100))} <span className="text-title-3">créditos</span>
          </p>
          <p className="text-caption text-vinho/70">{formatBRL(balance)} em valor de evento</p>
        </div>
      </section>

      <SingleEventOffer priceCents={ticketPriceCents()} />

      <section>
        <h2 className="font-serif text-title-1">Assinatura mensal (franquia)</h2>
        <p className="mt-1 text-sm text-vinho/75">
          Escolha se quer renovar automaticamente todo mês (Pix ou cartão de crédito; os créditos
          entram após cada pagamento confirmado) ou fazer uma compra única. Você pode cancelar a
          renovação aqui no painel. Seus créditos não expiram: use quando quiser.
        </p>

        {subscription !== null ? (
          <div className="mt-6 rounded-card border border-champagne/50 bg-vinho p-6 text-off-white shadow-raised">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-champagne-claro">
              Renovação automática{" "}
              {subscription.status === "active"
                ? "ativa"
                : subscription.status === "overdue"
                  ? "com pagamento em atraso"
                  : "pendente de confirmação"}
            </p>
            <p className="mt-2 font-serif text-title-1">
              Plano{" "}
              {subscription.plan_code === "atelier"
                ? "Atelier"
                : subscription.plan_code === "essencial"
                  ? "Essencial"
                  : "Maison"}
            </p>
            {subscription.current_period_end !== null ? (
              <p className="mt-1 text-caption text-off-white/75">
                Ciclo atual até{" "}
                {new Date(`${subscription.current_period_end}T12:00:00Z`).toLocaleDateString(
                  "pt-BR",
                )}
              </p>
            ) : null}
            <CancelSubscriptionForm />
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            {PLANS.map((plan) => (
              <article
                key={plan.code}
                className={
                  plan.featured
                    ? "flex flex-col rounded-card bg-white p-6 shadow-raised ring-2 ring-primaria"
                    : "flex flex-col rounded-card border border-line-subtle bg-off-white p-6 shadow-soft"
                }
              >
                <h3 className="font-serif text-title-2">{plan.name}</h3>
                <p className="mt-2 flex-1 text-sm opacity-75">{plan.description}</p>
                <p className="mt-4 font-serif text-title-1">{formatBRL(plan.priceCents)}</p>
                <p className="text-caption opacity-70">
                  {String(plan.credits)} créditos/mês ·{" "}
                  {formatBRL(roundHalfUpDiv(plan.priceCents, plan.credits))} por evento
                </p>
                <div className="mt-5">
                  <SubscribePlanForm
                    planCode={plan.code}
                    planName={plan.name}
                    credits={plan.credits}
                    priceFormatted={formatBRL(plan.priceCents)}
                    firstMonthCents={
                      activeOffer === null
                        ? null
                        : plan.priceCents - offerDiscountCents(activeOffer, "pack", plan.priceCents)
                    }
                  />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-serif text-title-1">Precisa de créditos extras agora?</h2>
        <p className="mt-1 text-sm text-vinho/75">
          Arraste para escolher de 3 a 20 eventos. Pix ou cartão de crédito, compra única e sem
          validade.
        </p>

        <div className="mt-6 max-w-xl">
          <CreditSliderForm offer={packOffer} />
        </div>
      </section>

      <section className="rounded-card border border-line-subtle bg-off-white shadow-soft">
        <header className="border-b border-line-subtle px-6 py-5">
          <h2 className="font-serif text-title-1">Extrato de créditos</h2>
          <p className="mt-1 text-caption text-vinho/70">Cada lançamento é imutável e auditável.</p>
        </header>

        {ledger.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-overline uppercase tracking-[0.12em] text-vinho/70">
                  <th className="px-6 py-3 font-medium">Movimento</th>
                  <th className="px-6 py-3 text-right font-medium">Valor</th>
                  <th className="px-6 py-3 text-right font-medium">Saldo após</th>
                  <th className="px-6 py-3 font-medium">Data</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-t border-line-subtle even:bg-areia-quente/60"
                  >
                    <td className="px-6 py-3 text-vinho">
                      {entryLabels[entry.entry_type] ?? entry.entry_type}
                    </td>
                    <td
                      className={`px-6 py-3 text-right tabular-nums ${
                        entry.amount_cents >= 0 ? "text-vinho" : "text-vinho/75"
                      }`}
                    >
                      {entry.amount_cents >= 0 ? "+" : ""}
                      {formatBRL(entry.amount_cents)}
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums text-vinho">
                      {formatBRL(entry.balance_after_cents)}
                    </td>
                    <td className="px-6 py-3 text-caption text-vinho/70">
                      {new Date(entry.created_at).toLocaleDateString("pt-BR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-6 py-6 text-sm text-vinho/75">
            Nenhum lançamento ainda. Compre um pacote para começar.
          </p>
        )}
      </section>
    </div>
  );
}
