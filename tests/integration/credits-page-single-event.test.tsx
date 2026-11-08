// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * /creditos (aba "Comprar") vende TICKET do evento — não cria evento, não vende assinatura.
 */
let events: { id: string; title: string; event_date: string | null; status: string }[] = [];
let tickets: { event_id: string; status: string }[] = [];

vi.mock("@/lib/auth", () => ({
  requireUser: () => Promise.resolve({ id: "user-1", email: "a@b.com" }),
}));
vi.mock("@/lib/auth/personal-scope-server", () => ({
  personalEventsFilter: () => Promise.resolve("owner_profile_id.eq.user-1"),
}));
vi.mock("@/lib/seo/pricing", () => ({ ticketPriceCents: () => 9700 }));
vi.mock("@/components/domain/buy-ticket-form", () => ({
  BuyTicketForm: ({ eventId }: { eventId: string }) => (
    <div data-testid="checkout">checkout {eventId}</div>
  ),
}));
vi.mock("@/components/domain/buy-ticket-credit-form", () => ({
  BuyTicketCreditForm: ({ priceFormatted }: { priceFormatted: string }) => (
    <div data-testid="credit-checkout">ticket avulso {priceFormatted}</div>
  ),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      from: () => {
        const q: Record<string, unknown> = {};
        for (const m of ["select", "or", "neq", "order", "eq"]) q[m] = () => q;
        q.then = (resolve: (v: unknown) => unknown) =>
          resolve({ data: events, error: null });
        // `.in(...)` termina a busca de tickets; `.maybeSingle()` a do perfil.
        q.in = () => Promise.resolve({ data: tickets, error: null });
        q.maybeSingle = () => Promise.resolve({ data: null, error: null });
        // `.is(...)` termina a contagem de tickets avulsos disponíveis.
        q.is = () => Promise.resolve({ count: 0, data: [], error: null });
        return q;
      },
    }),
}));

import PaymentPage from "@/app/(dashboard)/creditos/page";

afterEach(cleanup);

describe("/creditos — comprar ticket do evento", () => {
  it("lista evento pendente com link de compra", async () => {
    events = [
      { id: "ev-1", title: "Festa da Lia", event_date: "2026-12-12", status: "draft" },
      { id: "ev-2", title: "Casamento Ana", event_date: "2027-03-01", status: "active" },
    ];
    tickets = [{ event_id: "ev-2", status: "active" }];

    render(await PaymentPage());

    expect(screen.getByRole("heading", { name: /comprar ticket/i })).toBeInTheDocument();
    expect(screen.getByText("Festa da Lia")).toBeInTheDocument();
    expect(screen.queryByText("Casamento Ana")).toBeNull();
    // O checkout do ticket acontece na própria aba, para o evento pendente.
    expect(screen.getByTestId("checkout")).toHaveTextContent("ev-1");
    // A compra de ticket avulso (sem evento) é sempre oferecida.
    expect(screen.getByTestId("credit-checkout")).toBeInTheDocument();
  });

  it("sem evento pendente, ainda oferece comprar o ticket", async () => {
    events = [{ id: "ev-2", title: "Casamento Ana", event_date: null, status: "active" }];
    tickets = [{ event_id: "ev-2", status: "active" }];

    render(await PaymentPage());

    expect(screen.getByRole("heading", { name: /tickets disponíveis/i })).toBeInTheDocument();
    expect(screen.getByTestId("credit-checkout")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /criar um evento/i })).toHaveAttribute(
      "href",
      "/eventos",
    );
    expect(screen.queryByText(/assinatura|franquia|créditos/i)).toBeNull();
  });
});
