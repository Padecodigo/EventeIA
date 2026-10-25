import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EmailMessage } from "@/lib/notifications/email";
import type { SupportDeps, TicketRow } from "@/lib/support/service";

/**
 * Integração das server actions da central de atendimento (sessão, headers e Supabase
 * substituídos por um "banco" em memória que reproduz as regras de posse da 0027).
 */
let sessionUser: { id: string; email: string } | null = null;
const sent: EmailMessage[] = [];
const tickets = new Map<string, TicketRow & { event_id: string | null; attachment_path: string | null; page_url: string | null }>();
const messages: { ticket_id: string; author_role: string; author_id: string; body: string }[] = [];
const uploads: string[] = [];
let rateHits = new Map<string, number>();
let seq = 0;

const USER = { id: "b2222222-2222-4222-8222-222222222222", email: "ana@teste.com" };
const OTHER = { id: "c3333333-3333-4333-8333-333333333333", email: "bia@teste.com" };
const ADMIN = { id: "a1111111-1111-4111-8111-111111111111", email: "admin@teste.com" };
const ANA_EVENT = "e1111111-1111-4111-8111-111111111111";
const BIA_EVENT = "e2222222-2222-4222-8222-222222222222";

function deps(): SupportDeps {
  return {
    async rateHit(key, limit) {
      const n = (rateHits.get(key) ?? 0) + 1;
      rateHits.set(key, n);
      if (n > limit) {
        const { SupportRateLimitedError } = await import("@/lib/support/service");
        throw new SupportRateLimitedError();
      }
    },
    eventOwnedBy: async (eventId, userId) =>
      (eventId === ANA_EVENT && userId === USER.id) || (eventId === BIA_EVENT && userId === OTHER.id),
    async uploadAttachment(path) {
      uploads.push(path);
      return true;
    },
    async insertTicket(row) {
      seq += 1;
      const id = `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
      const t = { id, status: "aberto" as const, ...row };
      tickets.set(id, t);
      return t;
    },
    getTicket: async (id) => tickets.get(id) ?? null,
    async insertMessage(row) {
      messages.push(row);
    },
    async updateTicket(id, patch) {
      const t = tickets.get(id);
      if (t !== undefined) tickets.set(id, { ...t, ...patch });
    },
    contactEmail: async (t) => (t.user_id === USER.id ? USER.email : t.user_id === OTHER.id ? OTHER.email : t.email),
    newId: () => "11111111-1111-4111-8111-111111111111",
    email: { mode: "mock", send: async (m) => (sent.push(m), { id: null }) },
    adminEmail: "suporte@eventeia.com.br",
    appUrl: "https://app.test",
    warn: () => undefined,
  };
}

vi.mock("@/lib/support/runtime", () => ({ createSupportDeps: () => deps(), signedAttachmentUrl: async () => null }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (k: string) => ({ "x-forwarded-for": "198.51.100.7", "user-agent": "Vitest/1.0" })[k.toLowerCase()] ?? null,
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { getUser: async () => ({ data: { user: sessionUser } }) } }),
}));
vi.mock("@/lib/auth", () => ({
  requireUser: async () => {
    if (sessionUser === null) throw new Error("NEXT_REDIRECT /entrar");
    return sessionUser;
  },
  requireAdmin: async () => {
    if (sessionUser?.id !== ADMIN.id) throw new Error("NEXT_REDIRECT /painel");
    return sessionUser;
  },
}));

const { createSupportTicketAction, replySupportTicketAction } = await import("@/app/actions/support");
const { adminReplyTicketAction, adminUpdateTicketAction } = await import("@/app/admin/chamados/actions");

function form(values: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.append(k, v);
  return fd;
}

beforeEach(() => {
  sessionUser = null;
  sent.length = 0;
  messages.length = 0;
  uploads.length = 0;
  tickets.clear();
  rateHits = new Map();
});

describe("central de atendimento — server actions", () => {
  it("visitante anônimo precisa de e-mail e recebe confirmação", async () => {
    const semEmail = await createSupportTicketAction(null, form({ type: "sugestao", subject: "Ideia", message: "Exportar em PDF seria ótimo" }));
    expect(semEmail).toEqual({ ok: false, error: "Informe um e-mail para receber a resposta" });

    const r = await createSupportTicketAction(null, form({ type: "elogio", subject: "Amei", message: "Ferramenta incrível!!", email: "visita@teste.com", pageUrl: "https://x.com/planos?a=1" }));
    expect(r?.ok).toBe(true);
    const t = [...tickets.values()][0];
    expect(t).toMatchObject({ user_id: null, email: "visita@teste.com", priority: "normal", page_url: "/planos?a=1", user_agent: "Vitest/1.0" });
    expect(sent.map((m) => m.to)).toEqual(["visita@teste.com"]);
  });

  it("problema de usuário logado: prioridade alta, contexto do evento, anexo e alerta ao admin", async () => {
    sessionUser = USER;
    const png = new File([new Uint8Array([1, 2, 3])], "tela.png", { type: "image/png" });
    const r = await createSupportTicketAction(null, form({ type: "problema", subject: "Erro no PDF", message: "O PDF não baixa no evento", pageUrl: `/eventos/${ANA_EVENT}`, email: "ignorado@x.com", screenshot: png }));
    expect(r?.ok).toBe(true);
    const t = [...tickets.values()][0];
    expect(t).toMatchObject({ user_id: USER.id, email: null, priority: "alta", event_id: ANA_EVENT, attachment_path: `${USER.id}/11111111-1111-4111-8111-111111111111.png` });
    expect(sent.map((m) => m.to)).toEqual([USER.email, "suporte@eventeia.com.br"]);
  });

  it("não vincula evento de outra pessoa e rejeita anexo inválido", async () => {
    sessionUser = USER;
    await createSupportTicketAction(null, form({ type: "reclamacao", subject: "Demora", message: "Demorou bastante", eventId: BIA_EVENT }));
    expect([...tickets.values()][0]?.event_id).toBeNull();
    const pdf = new File(["x"], "a.pdf", { type: "application/pdf" });
    const bad = await createSupportTicketAction(null, form({ type: "problema", subject: "Erro", message: "Anexo inválido aqui", screenshot: pdf }));
    expect(bad).toEqual({ ok: false, error: "Envie PNG, JPG ou WEBP" });
    expect(uploads).toEqual([]);
  });

  it("rate limit por conta", async () => {
    sessionUser = USER;
    const fd = () => form({ type: "sugestao", subject: "Ideia", message: "Mais uma ideia legal" });
    for (let i = 0; i < 5; i++) expect((await createSupportTicketAction(null, fd()))?.ok).toBe(true);
    const r = await createSupportTicketAction(null, fd());
    expect(r?.ok).toBe(false);
    expect(tickets.size).toBe(5);
  });

  it("regressão: confirmação anônima é genérica e não ecoa o texto enviado", async () => {
    await createSupportTicketAction(null, form({ type: "elogio", subject: "Ganhe R$ 1000 em http://golpe.test", message: "Clique aqui http://golpe.test agora", email: "vitima@teste.com" }));
    expect(sent).toHaveLength(1);
    expect(sent[0]?.subject).not.toContain("golpe");
    expect(sent[0]?.text).not.toContain("golpe");
    expect(sent[0]?.text).toContain("Se não foi você");
  });

  it("regressão: no máximo 1 confirmação por e-mail e 3 chamados por e-mail a cada 10 min", async () => {
    const fd = () => form({ type: "sugestao", subject: "Ideia", message: "Mais uma ideia legal", email: "Alvo@Teste.com" });
    for (let i = 0; i < 3; i++) expect((await createSupportTicketAction(null, fd()))?.ok).toBe(true);
    expect((await createSupportTicketAction(null, fd()))?.ok).toBe(false);
    expect(sent.filter((m) => m.to === "alvo@teste.com")).toHaveLength(1);
    expect(tickets.size).toBe(3);
  });

  it("teto global de confirmações anônimas: chamado é criado, e-mail não sai", async () => {
    for (let i = 0; i < 20; i++) rateHits.set("confirm:anon:global", i + 1);
    const r = await createSupportTicketAction(null, form({ type: "sugestao", subject: "Ideia", message: "Mais uma ideia legal", email: "novo@teste.com" }));
    expect(r?.ok).toBe(true);
    expect(sent).toHaveLength(0);
  });

  it("thread: usuário responde só o próprio; admin responde, muda status e usuário é avisado", async () => {
    sessionUser = USER;
    await createSupportTicketAction(null, form({ type: "sugestao", subject: "Ideia", message: "Uma ideia muito boa" }));
    const id = [...tickets.keys()][0];

    sessionUser = OTHER;
    expect(await replySupportTicketAction(null, form({ ticketId: id, body: "intrusa" }))).toEqual({ ok: false, error: "Chamado não encontrado" });
    await expect(adminReplyTicketAction(null, form({ ticketId: id, body: "x" }))).rejects.toThrow("NEXT_REDIRECT");

    sessionUser = USER;
    expect((await replySupportTicketAction(null, form({ ticketId: id, body: "Complemento" })))?.ok).toBe(true);

    sessionUser = ADMIN;
    sent.length = 0;
    expect((await adminReplyTicketAction(null, form({ ticketId: id, body: "Obrigado, vamos avaliar." })))?.ok).toBe(true);
    expect(tickets.get(id)?.status).toBe("em_andamento");
    expect(sent[0]?.to).toBe(USER.email);
    expect(sent[0]?.text).toContain("Obrigado, vamos avaliar.");
    expect(messages.map((m) => m.author_role)).toEqual(["user", "admin"]);

    expect((await adminUpdateTicketAction(null, form({ ticketId: id, status: "fechado", priority: "urgente" })))?.ok).toBe(true);
    expect(tickets.get(id)).toMatchObject({ status: "fechado", priority: "urgente" });
    expect(sent.at(-1)?.to).toBe("suporte@eventeia.com.br");
    expect(await adminUpdateTicketAction(null, form({ ticketId: id, status: "resolvido", priority: "urgente" }))).toEqual({ ok: false, error: "Transição de status inválida" });

    sessionUser = USER;
    expect(await replySupportTicketAction(null, form({ ticketId: id, body: "Ainda aí?" }))).toEqual({ ok: false, error: "Chamado fechado" });
  });
});
