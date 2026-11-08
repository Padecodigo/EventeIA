import { describe, expect, it } from "vitest";

import {
  DEFAULT_TICKET_PRICE_CENTS,
  isAvailableTicket,
  isTicketStatusTransitionAllowed,
  pickOldestAvailable,
  ticketCreditIdempotencyKey,
  ticketPriceCents,
  type TicketLike,
} from "@/lib/tickets/pure";
import {
  consumeAvailableTicket,
  createPendingTicket,
  listAvailableTickets,
  type TicketDb,
} from "@/lib/tickets/store";

describe("lib/tickets/pure", () => {
  it("resolve o preço do ticket avulso (default R$ 97,00)", () => {
    expect(ticketPriceCents({})).toBe(DEFAULT_TICKET_PRICE_CENTS);
    expect(ticketPriceCents({ B2C_TICKET_PRICE_CENTS: "4700" })).toBe(4700);
    expect(ticketPriceCents({ B2C_TICKET_PRICE_CENTS: "" })).toBe(DEFAULT_TICKET_PRICE_CENTS);
    expect(ticketPriceCents({ B2C_TICKET_PRICE_CENTS: "abc" })).toBe(DEFAULT_TICKET_PRICE_CENTS);
    expect(ticketPriceCents({ B2C_TICKET_PRICE_CENTS: "-1" })).toBe(DEFAULT_TICKET_PRICE_CENTS);
  });

  it("identifica ticket disponível (ativo e sem evento)", () => {
    expect(isAvailableTicket({ status: "active", event_id: null })).toBe(true);
    expect(isAvailableTicket({ status: "active", event_id: "evt-1" })).toBe(false);
    expect(isAvailableTicket({ status: "consumed", event_id: null })).toBe(false);
    expect(isAvailableTicket({ status: "pending", event_id: null })).toBe(false);
  });

  it("escolhe o ticket disponível mais antigo (FIFO)", () => {
    const tickets: TicketLike[] = [
      { status: "active", event_id: null, created_at: "2026-11-07T12:00:00Z" },
      { status: "active", event_id: null, created_at: "2026-11-06T12:00:00Z" },
      { status: "active", event_id: "evt-9", created_at: "2026-11-05T12:00:00Z" },
      { status: "consumed", event_id: "evt-8", created_at: "2026-11-04T12:00:00Z" },
    ];
    expect(pickOldestAvailable(tickets)?.created_at).toBe("2026-11-06T12:00:00Z");
    expect(pickOldestAvailable([])).toBeNull();
    expect(
      pickOldestAvailable([{ status: "consumed", event_id: null, created_at: "2026-11-06T12:00:00Z" }]),
    ).toBeNull();
  });

  it("valida transições de status do ticket", () => {
    expect(isTicketStatusTransitionAllowed("pending", "active")).toBe(true);
    expect(isTicketStatusTransitionAllowed("active", "consumed")).toBe(true);
    expect(isTicketStatusTransitionAllowed("active", "refunded")).toBe(true);
    expect(isTicketStatusTransitionAllowed("pending", "canceled")).toBe(true);
    expect(isTicketStatusTransitionAllowed("consumed", "active")).toBe(false);
    expect(isTicketStatusTransitionAllowed("pending", "consumed")).toBe(false);
    expect(isTicketStatusTransitionAllowed("refunded", "active")).toBe(false);
  });

  it("deriva a chave de idempotência da cobrança Asaas", () => {
    expect(ticketCreditIdempotencyKey("pay_123")).toBe("ticket_credit:pay_123");
  });
});

describe("lib/tickets/store", () => {
  it("lista apenas tickets ativos e sem evento", async () => {
    const rows = [
      { id: "a", amount_cents: 9700, created_at: "2026-11-05T12:00:00Z", status: "active", event_id: null },
      { id: "b", amount_cents: 9700, created_at: "2026-11-06T12:00:00Z", status: "consumed", event_id: "evt-1" },
      { id: "c", amount_cents: 9700, created_at: "2026-11-07T12:00:00Z", status: "active", event_id: null },
    ];
    const db = {
      from: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({ data: rows, error: null }),
          }),
        }),
      }),
    } as unknown as TicketDb;

    const result = await listAvailableTickets("owner-1", db);
    expect(result.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("consome via RPC e devolve o id; null quando não há ticket disponível", async () => {
    const db = {
      rpc: async () => ({ data: "ticket-id", error: null }),
    } as unknown as TicketDb;
    expect(await consumeAvailableTicket("owner-1", "evt-1", db)).toBe("ticket-id");

    const dbEmpty = {
      rpc: async () => ({ data: null, error: null }),
    } as unknown as TicketDb;
    expect(await consumeAvailableTicket("owner-1", "evt-1", dbEmpty)).toBeNull();
  });

  it("propaga erro do RPC de consumo", async () => {
    const db = {
      rpc: async () => ({ data: null, error: { message: "boom" } }),
    } as unknown as TicketDb;
    await expect(consumeAvailableTicket("owner-1", "evt-1", db)).rejects.toThrow(
      /consume_available_ticket falhou/,
    );
  });

  it("cria ticket pendente com chave de idempotência derivada", async () => {
    let inserted: Record<string, unknown> | undefined;
    const db = {
      from: () => ({
        insert: (payload: Record<string, unknown>) => {
          inserted = payload;
          return {
            select: () => ({
              maybeSingle: async () => ({ data: { id: "tp_1" }, error: null }),
            }),
          };
        },
      }),
    } as unknown as TicketDb;

    const id = await createPendingTicket(
      { ownerProfileId: "owner-1", paymentId: "pay_123", amountCents: 9700 },
      db,
    );
    expect(id).toBe("tp_1");
    expect(inserted).toMatchObject({
      owner_profile_id: "owner-1",
      status: "pending",
      event_id: null,
      payment_id: "pay_123",
      amount_cents: 9700,
      idempotency_key: "ticket_credit:pay_123",
    });
  });
});
