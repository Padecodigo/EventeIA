import { DelayedError } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regressão (regra dura): nenhum contato com fornecedor fora de dia útil 9h–18h, e
 * prospects ocultados (soft-hide) nunca recebem mensagem.
 */
let prospect: Record<string, unknown> = {};
const send = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: () => {
      const q = { select: () => q, eq: () => q, in: () => q, maybeSingle: () => Promise.resolve({ data: prospect }) };
      return q;
    },
  }),
}));
vi.mock("@/lib/whatsapp/provider", () => ({ resolveEventChannel: vi.fn(), sendFirstContactVia: send }));
vi.mock("@/lib/whatsapp/opt-out-runtime", () => ({ recipientOptedOut: vi.fn(() => Promise.resolve(false)) }));
vi.mock("@/lib/whatsapp/session-runtime", () => ({
  createSessionDeps: vi.fn(),
  eventPausedKey: vi.fn(),
  findEventInstance: vi.fn(),
  isEventPaused: vi.fn(() => Promise.resolve(false)),
}));
vi.mock("@/lib/whatsapp/session-manager", () => ({ finishCollection: vi.fn(), handleSessionLost: vi.fn() }));
vi.mock("@/lib/feeds", () => ({ emitFeed: vi.fn() }));

const { processProspectingJob } = await import("@/lib/queue/whatsapp-worker");

const data = {
  prospectId: "11111111-1111-4111-8111-111111111111",
  eventId: "71e24ebd-c1f3-439d-b50a-c93ba60c81bb",
  instance: "inst-1",
  phoneE164: "+5512999999999",
  vendorName: "Buffet Real",
  eventTitle: "Aniversário",
  eventType: "aniversario",
  eventDateIso: "2026-11-22",
  guestCount: 50,
  city: "São José dos Campos",
};
function job() {
  return { data, moveToDelayed: vi.fn(() => Promise.resolve()) };
}

describe("outreach: regra dura de dia útil + prospects ocultos", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    send.mockClear();
    prospect = { id: data.prospectId, status: "pending", vendor_name: "Buffet Real", vendor_category: "buffet", dry_run: false, supplier_id: null, hidden_at: null };
  });

  it("domingo → adiado para segunda 09:00 BRT, sem enviar", async () => {
    vi.setSystemTime(new Date("2026-10-25T13:00:00Z"));
    const j = job();
    await expect(processProspectingJob(j as never, "t", {} as never)).rejects.toBeInstanceOf(DelayedError);
    expect(j.moveToDelayed).toHaveBeenCalledWith(Date.parse("2026-10-26T12:00:00Z"), "t");
    expect(send).not.toHaveBeenCalled();
  });

  it("segunda 08:59 BRT → ainda adiado para 09:00", async () => {
    vi.setSystemTime(new Date("2026-10-26T11:59:00Z"));
    const j = job();
    await expect(processProspectingJob(j as never, "t", {} as never)).rejects.toBeInstanceOf(DelayedError);
    expect(j.moveToDelayed).toHaveBeenCalledWith(Date.parse("2026-10-26T12:00:00Z"), "t");
  });

  it("prospect oculto nunca é contatado (nem adiado)", async () => {
    vi.setSystemTime(new Date("2026-10-26T14:00:00Z"));
    prospect.hidden_at = "2026-10-25T10:00:00Z";
    const j = job();
    await processProspectingJob(j as never, "t", {} as never);
    expect(j.moveToDelayed).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
