import Link from "next/link";
import { notFound } from "next/navigation";

import { z } from "zod";

import { ActivateWithCredit } from "@/components/domain/activate-with-credit";
import { BudgetTable } from "@/components/domain/budget-table";
import { BuyTicketForm } from "@/components/domain/buy-ticket-form";
import { ChoicesPanel } from "@/components/domain/choices-panel";
import { EventChat } from "@/components/domain/event-chat";
import { EventBudgetLimitEditor } from "@/components/domain/event-budget-limit-editor";
import { EventDetailsEditor } from "@/components/domain/event-details-editor";
import { EventLifecycleActions } from "@/components/domain/event-lifecycle-actions";
import { EventSupportChat } from "@/components/domain/event-support-chat";
import { FollowInstagramCard } from "@/components/domain/follow-instagram-card";
import { QuotationsPanel } from "@/components/domain/quotations-panel";
import { QuotePreparingNotice } from "@/components/domain/quote-preparing-notice";
import { ScenariosPanel } from "@/components/domain/scenarios-panel";
import { SearchStartEditor } from "@/components/domain/search-start-editor";
import { SupplierOptionsPanel } from "@/components/domain/supplier-options-panel";
import { TestimonialInvite } from "@/components/domain/testimonial-invite";
import { CATEGORY_LABELS, UNIT_LABELS, type CategoryCode } from "@/lib/catalog/v1";
import { calculate } from "@/lib/engine";
import type { EngineItemSelection, EventType, RegionCode } from "@/lib/engine/types";
import { serverEnv } from "@/lib/env";
import { isAboveBudgetLimit } from "@/lib/events/budget-limit";
import { canCancelEvent, canCompleteEvent } from "@/lib/events/lifecycle";
import { luckyDiscountCents } from "@/lib/lucky/pure";
import { lookupLuckyCoupon } from "@/lib/lucky/server";
import { isEventStarted, STARTED_EVENT_LOCK_MESSAGE } from "@/lib/events/edit-lock";
import { formatBRL } from "@/lib/money";
import { offerDiscountCents } from "@/lib/offers/pure";
import { activeUserOffer } from "@/lib/offers/server";
import { listEventChatConversations } from "@/lib/outreach/chat-read";
import { parseQuotationOptions } from "@/lib/quotes/choices";
import { categoryLabel } from "@/lib/quotes/labels";
import { latestScenarios } from "@/lib/quotes/scenarios";
import { canEditSearchStart, spDateKey } from "@/lib/search-start";
import { listSupplierSelections } from "@/lib/selection/read";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

  const [ticketResult, profileResult, quotationsResult] =
    await Promise.all([
      supabase.from("event_tickets").select("status").eq("event_id", event.id).maybeSingle(),
      supabase
        .from("profiles")
        .select("display_name,document_number")
        .eq("id", event.owner_profile_id)
        .maybeSingle(),
      supabase
        .from("quotations")
        .select("id,category,vendor_name,vendor_contact,amount_cents,status,created_at,extraction")
        .eq("event_id", event.id)
        .order("created_at", { ascending: true }),
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

  // Orçamento limite (0072): dono ou admin editam; histórico visível a ambos via RLS.
  const budgetLimitCents = event.budget_limit_cents ?? null;
  const {
    data: { user: viewer },
  } = await supabase.auth.getUser();
  const { data: viewerProfile } =
    viewer === null
      ? { data: null }
      : await supabase.from("profiles").select("role").eq("id", viewer.id).maybeSingle();
  const canEditBudgetLimit =
    viewer !== null &&
    (viewer.id === event.owner_profile_id || viewerProfile?.role === "admin") &&
    event.status !== "canceled";
  const { data: budgetHistoryRows } = await supabase
    .from("event_budget_limit_history")
    .select("id,old_cents,new_cents,source,changed_at")
    .eq("event_id", event.id)
    .order("changed_at", { ascending: false })
    .limit(20);
  const budgetSourceLabels: Record<string, string> = { owner: "você", admin: "equipe EventeIA", system: "sistema" };
  const budgetHistory = (budgetHistoryRows ?? []).map((h) => ({
    id: h.id,
    changedAtLabel: new Date(h.changed_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }),
    oldLabel: h.old_cents === null ? "sem limite" : formatBRL(h.old_cents),
    newLabel: h.new_cents === null ? "sem limite" : formatBRL(h.new_cents),
    sourceLabel: budgetSourceLabels[h.source] ?? h.source,
  }));

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
  const editLocked = isEventStarted(event);

  // Escolhas do fornecedor: opções/pacotes extraídos de cada cotação + a escolhida.
  const { data: choiceRows } = await supabase
    .from("quotation_choices")
    .select("quotation_id,option_index")
    .eq("event_id", event.id);
  const chosenByQuotation = new Map(
    (choiceRows ?? []).map((row) => [row.quotation_id, row.option_index]),
  );
  const choiceViews = (quotationsResult.data ?? [])
    .filter((q) => q.status === "draft")
    .map((q) => {
      const options = parseQuotationOptions(q.extraction);
      return {
        quotationId: q.id,
        vendorName: q.vendor_name,
        categoryLabel: categoryLabel(q.category),
        vendorContact: q.vendor_contact,
        options: options.map((option, index) => ({
          index,
          name: option.name,
          description: option.description ?? null,
          includes: option.includes ?? [],
          amountFormatted:
            option.amount_cents === null ? "A combinar" : formatBRL(option.amount_cents),
          aboveLimit: isAboveBudgetLimit(
            option.amount_cents ?? null,
            "pacote",
            event.guest_count,
            budgetLimitCents,
          ),
        })),
        chosenIndex: chosenByQuotation.get(q.id) ?? null,
      };
    })
    .filter((row) => row.options.length > 0);

  // Seleção de produtos (nível de categoria): opções por fornecedor ligado ao evento.
  const selectionViews = unlocked
    ? (await listSupplierSelections(undefined, event.id))
        .filter((row) => row.options.length > 0)
        .map((row) => ({
          supplierId: row.supplierId,
          supplierName: row.supplierName,
          categoryLabel: categoryLabel(row.category),
          options: row.options.map((option) => ({
            optionId: option.optionId,
            name: option.name,
            description: option.description,
            priceFormatted:
              option.priceCents === null ? "A combinar" : formatBRL(option.priceCents),
            unitLabel: UNIT_LABELS[option.unit] ?? option.unit,
            aboveLimit: isAboveBudgetLimit(
              option.priceCents,
              option.unit,
              event.guest_count,
              budgetLimitCents,
            ),
          })),
          selectedOptionId: row.selectedOptionId,
          status: row.status,
        }))
    : [];
  const aboveLimitCount =
    selectionViews.reduce((n, row) => n + row.options.filter((o) => o.aboveLimit).length, 0) +
    choiceViews.reduce((n, row) => n + row.options.filter((o) => o.aboveLimit).length, 0);
  const chatConversations = unlocked
    ? await listEventChatConversations(event.id)
    : [];

  return (
    <div className="flex scroll-mt-24 flex-col gap-8">
      <header id="evento-topo" className="scroll-mt-24 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-overline uppercase tracking-[0.14em] text-vinho/75">Evento</p>
          <h1 className="mt-2 break-words font-serif text-title-1 font-display [overflow-wrap:anywhere] sm:text-display-2">{event.title}</h1>
          <p className="mt-2 text-sm text-vinho/75">
            {event.event_type} · {event.guest_count} convidados ·{" "}
            {new Date(`${event.event_date}T12:00:00Z`).toLocaleDateString("pt-BR")} ·{" "}
            {statusLabels[event.status] ?? event.status}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <span className="rounded-pill bg-areia-secundaria px-4 py-1.5 text-caption text-vinho/70">
            {unlocked ? "Orçamento liberado" : "Aguardando ativação"}
          </span>
          <EventLifecycleActions
            eventId={event.id}
            canComplete={canCompleteEvent(event.status)}
            canCancel={canCancelEvent(event.status)}
          />
        </div>
      </header>

      <FollowInstagramCard />

      <EventBudgetLimitEditor
        eventId={event.id}
        budgetLimitCents={budgetLimitCents}
        limitLabel={budgetLimitCents === null ? "Sem limite definido" : formatBRL(budgetLimitCents)}
        canEdit={canEditBudgetLimit}
        aboveLimitCount={aboveLimitCount}
        history={budgetHistory}
      />

      {editLocked ? (
        <p
          role="note"
          data-testid="event-edit-locked"
          className="rounded-card border border-line-subtle bg-off-white p-6 text-sm text-vinho/80 shadow-soft"
        >
          {STARTED_EVENT_LOCK_MESSAGE}
        </p>
      ) : (
        <EventDetailsEditor
          eventId={event.id}
          guestCount={event.guest_count}
          venueCapacity={event.venue_capacity}
          venueType={event.venue_type}
          eventStyle={event.event_style}
        />
      )}

      <section className="scroll-mt-24 flex flex-wrap items-center justify-between gap-4 rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
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
        {editLocked ? (
          <span className="text-caption text-vinho/70">Entrevista travada: o evento já começou.</span>
        ) : (
          <Link
            href={`/eventos/${event.id}/entrevista`}
            className="rounded-full bg-primaria px-6 py-3 text-sm font-semibold text-on-primary hover:bg-primaria-escura"
          >
            {interviewDone ? "Revisar respostas" : "Começar entrevista"}
          </Link>
        )}
      </section>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1.4fr_1fr] lg:items-start">
        <BudgetTable result={budget} unlocked={unlocked} />

        {unlocked ? (
          <section className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft">
            <h2 className="font-serif text-title-1">Evento ativo.</h2>
            <p className="mt-2 text-sm text-vinho/70">
              O orçamento completo está liberado. As cotações serão organizadas aqui — acompanhe as
              notificações.
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
          {interviewDone && event.quotes_delivered_at === null ? (
            <QuotePreparingNotice searchStartDate={event.search_start_date} />
          ) : null}
          {canEditSearchStart(event) && !editLocked ? (
            <SearchStartEditor
              eventId={event.id}
              searchStartDate={event.search_start_date}
              today={spDateKey(new Date())}
              eventDate={event.event_date}
            />
          ) : null}
          <ScenariosPanel eventId={event.id} scenarios={scenarios} />
          <QuotationsPanel eventId={event.id} quotations={quotationsResult.data ?? []} />
          <ChoicesPanel eventId={event.id} rows={choiceViews} />
          <SupplierOptionsPanel eventId={event.id} rows={selectionViews} />
          <EventChat eventId={event.id} conversations={chatConversations} />
        </>
      ) : null}

      <EventSupportChat />
    </div>
  );
}
