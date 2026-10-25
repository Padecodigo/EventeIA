import Link from "next/link";
import { notFound } from "next/navigation";

import { z } from "zod";

import { ActivateWithCredit } from "@/components/domain/activate-with-credit";
import { BudgetTable } from "@/components/domain/budget-table";
import { BuyTicketForm } from "@/components/domain/buy-ticket-form";
import { ProspectingPanel } from "@/components/domain/prospecting-panel";
import { QuotationsPanel } from "@/components/domain/quotations-panel";
import { QuotePreparingNotice } from "@/components/domain/quote-preparing-notice";
import { ScenariosPanel } from "@/components/domain/scenarios-panel";
import { TestimonialInvite } from "@/components/domain/testimonial-invite";
import { CATEGORY_LABELS, type CategoryCode } from "@/lib/catalog/v1";
import { calculate } from "@/lib/engine";
import type { EngineItemSelection, EventType, RegionCode } from "@/lib/engine/types";
import { serverEnv } from "@/lib/env";
import { luckyDiscountCents } from "@/lib/lucky/pure";
import { lookupLuckyCoupon } from "@/lib/lucky/server";
import { formatBRL } from "@/lib/money";
import { offerDiscountCents } from "@/lib/offers/pure";
import { activeUserOffer } from "@/lib/offers/server";
import { latestScenarios } from "@/lib/quotes/scenarios";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WELCOME_FINAL_PRICE_CENTS } from "@/lib/welcome/pure";
import { lookupWelcomeOffer } from "@/lib/welcome/server";

const eventTypeSchema = z.enum([
  "festa_infantil",
  "quinze_anos",
  "casamento",
  "aniversario",
  "corporativo",
  "batizado",
  "formatura",
]);
const regionSchema = z.enum(["sp", "rj", "mg", "outros"]);

const DEFAULT_ITEMS: EngineItemSelection[] = [
  { category: "buffet" },
  { category: "decoracao" },
  { category: "musica" },
  { category: "fotografia" },
  { category: "espaco" },
];

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  awaiting_payment: "Aguardando pagamento",
  active: "Ativo",
  completed: "Concluído",
  canceled: "Cancelado",
};

/** Oferta de boas-vindas da conta (vincula a do aparelho, se houver). Prazo vem do banco. */
async function welcomeForCheckout(profileId: string): Promise<{
  remainingMs: number;
  fullCents: number;
  finalCents: number;
  label?: string;
  countdownFormat?: "hms" | "dhms";
} | null> {
  const fullCents = serverEnv().B2C_TICKET_PRICE_CENTS;
  // Oferta pessoal da conta (0036) tem prioridade — mesma regra do checkout.
  const personal = await activeUserOffer(profileId);
  if (personal !== null) {
    const off = offerDiscountCents(personal, "avulso", fullCents);
    if (off > 0) {
      return {
        remainingMs: personal.remainingMs,
        fullCents,
        finalCents: fullCents - off,
        label:
          personal.kind === "welcome"
            ? `Oferta de boas-vindas: ${formatBRL(off)} de desconto no evento avulso`
            : `Seu cupom pessoal: ${formatBRL(off)} de desconto no evento avulso`,
        countdownFormat: "dhms",
      };
    }
  }
  const offer = await lookupWelcomeOffer({ claim: false, source: "new_ip", profileId }).catch(
    () => null,
  );
  if (
    offer?.status === "active" &&
    offer.remainingMs > 0 &&
    fullCents > WELCOME_FINAL_PRICE_CENTS
  ) {
    return { remainingMs: offer.remainingMs, fullCents, finalCents: WELCOME_FINAL_PRICE_CENTS };
  }
  // Nunca as duas ofertas juntas: o cupom sorteado só entra sem boas-vindas ativa.
  const lucky = await lookupLuckyCoupon({ draw: false, profileId }).catch(() => null);
  return lucky?.status === "active" && lucky.percent !== null && lucky.remainingMs > 0
    ? {
        remainingMs: lucky.remainingMs,
        fullCents,
        finalCents: fullCents - luckyDiscountCents(fullCents, lucky.percent),
        label: `Cupom sorteado de ${lucky.percent}% aplicado`,
      }
    : null;
}

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const idParsed = z.string().uuid().safeParse(id);
  if (!idParsed.success) {
    notFound();
  }

  const supabase = await createSupabaseServerClient();
  const { data: event } = await supabase
    .from("events")
    .select("*")
    .eq("id", idParsed.data)
    .maybeSingle();

  if (event === null) {
    notFound();
  }

  const [ticketResult, profileResult, quotationsResult, prospectsResult, instancesResult] =
    await Promise.all([
      supabase.from("event_tickets").select("status").eq("event_id", event.id).maybeSingle(),
      supabase
        .from("profiles")
        .select("display_name,document_number")
        .eq("id", event.owner_profile_id)
        .maybeSingle(),
      supabase
        .from("quotations")
        .select("id,category,vendor_name,vendor_contact,amount_cents,status,created_at")
        .eq("event_id", event.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("vendor_prospects")
        .select("id,vendor_name,vendor_category,phone_e164,status,created_at")
        .eq("event_id", event.id)
        .order("created_at", { ascending: false }),
      getSupabaseAdmin()
        .from("whatsapp_instances")
        .select("status,number_mode")
        .eq("profile_id", event.owner_profile_id)
        .limit(1)
        .maybeSingle(),
    ]);

  const eventType: EventType = eventTypeSchema.safeParse(event.event_type).data ?? "casamento";
  const region: RegionCode = regionSchema.safeParse(event.region_code).data ?? "outros";
  const leadTimeDays = Math.max(
    0,
    Math.round((Date.parse(`${event.event_date}T00:00:00Z`) - Date.now()) / 86_400_000),
  );

  const budget = calculate({
    eventType,
    guestCount: event.guest_count,
    eventDateIso: event.event_date,
    leadTimeDays,
    region,
    items: DEFAULT_ITEMS,
  });

  const unlocked = ticketResult.data?.status === "active";

  const { data: requirementRows } = await supabase
    .from("event_requirements")
    .select("item_code,category,label")
    .eq("event_id", event.id)
    .eq("selected", true)
    .order("created_at", { ascending: true });
  const { data: snapshotRows } = await supabase
    .from("budget_snapshots")
    .select("breakdown,created_at")
    .eq("event_id", event.id)
    .order("created_at", { ascending: false })
    .limit(30);
  const scenarios = latestScenarios(snapshotRows ?? []);

  const requirementCategories = [...new Set((requirementRows ?? []).map((r) => r.category))];
  const interviewDone = event.interview_completed_at !== null;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-overline uppercase tracking-[0.14em] text-vinho/75">Evento</p>
          <h1 className="mt-2 font-serif text-display-2 font-display">{event.title}</h1>
          <p className="mt-2 text-sm text-vinho/75">
            {event.event_type} · {event.guest_count} convidados ·{" "}
            {new Date(`${event.event_date}T12:00:00Z`).toLocaleDateString("pt-BR")} ·{" "}
            {statusLabels[event.status] ?? event.status}
          </p>
        </div>
        <span className="rounded-pill bg-areia-secundaria px-4 py-1.5 text-caption text-vinho/70">
          {unlocked ? "Orçamento liberado" : "Aguardando ativação"}
        </span>
      </header>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
        <div>
          <h2 className="font-serif text-title-2">Entrevista do evento</h2>
          <p className="mt-1 text-sm text-vinho/75">
            {interviewDone
              ? `${event.city ?? ""} · ${requirementRows?.length ?? 0} itens em ${requirementCategories.length} categorias: ${requirementCategories
                  .map((c) => CATEGORY_LABELS[c as CategoryCode] ?? c)
                  .join(", ")}.`
              : "Responda algumas perguntas para o agente saber o que cotar e em qual cidade."}
          </p>
        </div>
        <Link
          href={`/eventos/${event.id}/entrevista`}
          className="rounded-full bg-primaria px-6 py-3 text-sm font-semibold text-white hover:bg-primaria-escura"
        >
          {interviewDone ? "Revisar respostas" : "Começar entrevista"}
        </Link>
      </section>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <BudgetTable result={budget} unlocked={unlocked} />

        {unlocked ? (
          <section className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
            <h2 className="font-serif text-title-1">Evento ativo.</h2>
            <p className="mt-2 text-sm text-vinho/70">
              O orçamento completo está liberado. As cotações e os disparos pelo WhatsApp serão
              organizados aqui — acompanhe as notificações.
            </p>
            <p className="mt-4 text-caption text-vinho/70">
              Próximo passo: pedir cotações aos fornecedores da sua região.
            </p>
            <TestimonialInvite eventId={event.id} />
          </section>
        ) : event.workspace_id !== null ? (
          <ActivateWithCredit eventId={event.id} />
        ) : (
          <BuyTicketForm
            welcome={await welcomeForCheckout(event.owner_profile_id)}
            eventId={event.id}
            priceFormatted={formatBRL(serverEnv().B2C_TICKET_PRICE_CENTS)}
            defaultCpf={profileResult.data?.document_number ?? ""}
          />
        )}
      </div>

      {unlocked ? (
        <>
          {interviewDone && event.quotes_delivered_at === null ? <QuotePreparingNotice /> : null}
          <ScenariosPanel eventId={event.id} scenarios={scenarios} />
          <QuotationsPanel eventId={event.id} quotations={quotationsResult.data ?? []} />
          <ProspectingPanel
            eventId={event.id}
            prospects={prospectsResult.data ?? []}
            instanceStatus={instancesResult.data?.status ?? null}
            numberMode={instancesResult.data?.number_mode ?? null}
          />
        </>
      ) : null}
    </div>
  );
}
