import { describe, expect, it, vi } from "vitest";

import {
  createMockEmailAdapter,
  createResendAdapter,
  getEmailAdapter,
  maskEmail,
  type EmailMessage,
} from "@/lib/notifications/email";
import {
  quotationsReadyKey,
  recordQuotationsReady,
  renderQuotationsReadyEmail,
  type NotificationDeps,
} from "@/lib/notifications/quotations-ready";
import { pacingKey, reservePacingSlot, type PacingStore } from "@/lib/queue/prospecting-pacing";
import { detectOptOut, firstContactPayloadSchema } from "@/lib/schemas/whatsapp";
import {
  canSendFirstContact,
  canTransition,
  computeDrainAtMs,
  isCollectionComplete,
  resolveCollectionWindowMinutes,
  toSessionState,
} from "@/lib/whatsapp/session-lifecycle";
import {
  activateSession,
  completeCollectionIfReady,
  endCollectionWindow,
  handleSessionLost,
  type SessionDeps,
} from "@/lib/whatsapp/session-manager";

/* ---------------- pacing por instância ---------------- */

function fakeStore(nowRef: { ms: number }): PacingStore & { keys: Map<string, number> } {
  const keys = new Map<string, number>();
  return {
    keys,
    setIfAbsent(key, ttlMs) {
      const expires = keys.get(key);
      if (expires !== undefined && expires > nowRef.ms) return Promise.resolve(false);
      keys.set(key, nowRef.ms + ttlMs);
      return Promise.resolve(true);
    },
    ttlMs(key) {
      return Promise.resolve((keys.get(key) ?? 0) - nowRef.ms);
    },
  };
}

describe("reservePacingSlot", () => {
  it("1º envio liberado com intervalo 45–90s sorteado pelo RNG injetado", async () => {
    const now = { ms: 1_000_000 };
    const store = fakeStore(now);
    const decision = await reservePacingSlot(store, "inst-a", now.ms, () => 0);
    expect(decision).toEqual({ allowed: true, intervalSeconds: 45 });
    expect(store.keys.get(pacingKey("inst-a"))).toBe(now.ms + 45_000);
  });

  it("2º envio na mesma instância é adiado até o fim do intervalo + jitter", async () => {
    const now = { ms: 1_000_000 };
    const store = fakeStore(now);
    await reservePacingSlot(store, "inst-a", now.ms, () => 0.999); // 90s
    now.ms += 10_000;
    const decision = await reservePacingSlot(store, "inst-a", now.ms, () => 0.5);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.retryAtMs).toBe(now.ms + 80_000 + 2_500);
    }
  });

  it("instâncias diferentes não se bloqueiam (≈100 sessões)", async () => {
    const now = { ms: 0 };
    const store = fakeStore(now);
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) => reservePacingSlot(store, `inst-${String(i)}`, 0, () => 0.3)),
    );
    expect(results.every((r) => r.allowed)).toBe(true);
  });

  it("intervalo nunca fica fora de 45–90s", async () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.9999]) {
      const decision = await reservePacingSlot(fakeStore({ ms: 0 }), "x", 0, () => r);
      expect(decision.allowed && decision.intervalSeconds).toBeGreaterThanOrEqual(45);
      expect(decision.allowed && decision.intervalSeconds).toBeLessThanOrEqual(90);
    }
  });
});

/* ---------------- primeiro contato e opt-out ---------------- */

describe("firstContactPayloadSchema", () => {
  const text = "Olá, tudo bem? Gostaria de um orçamento para uma festa infantil em maio.";
  it("aceita apenas número + texto puro", () => {
    expect(firstContactPayloadSchema.safeParse({ number: "+5512999999999", text }).success).toBe(true);
  });
  it("rejeita anexos/mídia e URLs", () => {
    expect(
      firstContactPayloadSchema.safeParse({ number: "+5512999999999", text, media: "x.jpg" }).success,
    ).toBe(false);
    expect(
      firstContactPayloadSchema.safeParse({ number: "+5512999999999", text: `${text} https://x.co` }).success,
    ).toBe(false);
  });
});

describe("detectOptOut (palavras inteiras, sem acento)", () => {
  it("detecta variantes", () => {
    for (const t of ["Sair", "PARAR", "pare por favor", "Não tenho interesse", "nao tenho interesse.", "sem interesse, obrigado", "Não quero mais"]) {
      expect(detectOptOut(t)).toBe(true);
    }
  });
  it("não dispara em falsos positivos por substring", () => {
    expect(detectOptOut("Vou sair para almoçar e já te mando o orçamento")).toBe(false);
    expect(detectOptOut("ensaiar a dança")).toBe(false);
    expect(detectOptOut("pode parar de me mandar mensagem")).toBe(true);
    expect(detectOptOut("Parece ótimo, segue valor")).toBe(false);
    expect(detectOptOut("Comparecer às 15h")).toBe(false);
  });
});

/* ---------------- ciclo de vida ---------------- */

describe("session-lifecycle", () => {
  it("transições válidas e inválidas", () => {
    expect(canTransition("connecting", "active")).toBe(true);
    expect(canTransition("active", "draining")).toBe(true);
    expect(canTransition("draining", "disconnected")).toBe(true);
    expect(canTransition("disconnected", "active")).toBe(false);
    expect(canTransition("draining", "active")).toBe(false);
  });
  it("janela com clamp 30–60", () => {
    expect(resolveCollectionWindowMinutes(10)).toBe(30);
    expect(resolveCollectionWindowMinutes(90)).toBe(90);
    expect(resolveCollectionWindowMinutes(5000)).toBe(2880);
    expect(resolveCollectionWindowMinutes(undefined)).toBe(2880);
    expect(computeDrainAtMs(0, 30)).toBe(1_800_000);
  });
  it("só envia em active", () => {
    expect(canSendFirstContact("active")).toBe(true);
    expect(canSendFirstContact("draining")).toBe(false);
    expect(toSessionState("connected")).toBe("active");
    expect(toSessionState("paused")).toBe("disconnected");
  });
});

function fakeSessionDeps(initial: string | null): SessionDeps & { calls: string[]; status: string | null } {
  const deps = {
    calls: [] as string[],
    status: initial,
    now: () => 1_000,
    getStatus: () => Promise.resolve(deps.status),
    setStatus: (_i: string, state: string) => {
      deps.status = state;
      deps.calls.push(`status:${state}`);
      return Promise.resolve();
    },
    logout: vi.fn(() => {
      deps.calls.push("logout");
      return Promise.resolve();
    }),
    pauseEventJobs: (eventId: string) => {
      deps.calls.push(`pause:${eventId}`);
      return Promise.resolve();
    },
    scheduleWindowEnd: (_i: string, _e: string, delayMs: number) => {
      deps.calls.push(`schedule:${String(delayMs)}`);
      return Promise.resolve();
    },
    triggerCollectionEnd: (_i: string, eventId: string) => {
      deps.calls.push(`trigger:${eventId}`);
      return Promise.resolve();
    },
    deliverQuotes: vi.fn((eventId: string) => {
      deps.calls.push(`deliver:${eventId}`);
      return Promise.resolve();
    }),
    notifyQuotationsReady: (eventId: string, reason: string) => {
      deps.calls.push(`notify:${eventId}:${reason}`);
      return Promise.resolve();
    },
    warn: () => undefined,
  };
  return deps;
}

describe("session-manager", () => {
  it("ativa e agenda o fim da janela", async () => {
    const deps = fakeSessionDeps("connecting");
    const result = await activateSession(deps, { instance: "i", eventId: "e", windowMinutes: 30 });
    expect(result.windowMinutes).toBe(30);
    expect(deps.calls).toEqual(["status:active", "schedule:1800000"]);
  });

  it("ativa por 48h por padrão (sessão fica conectada durante toda a coleta)", async () => {
    const deps = fakeSessionDeps("connecting");
    const result = await activateSession(deps, { instance: "i", eventId: "e" });
    expect(result.windowMinutes).toBe(2880);
    expect(deps.calls).toEqual(["status:active", `schedule:${String(48 * 3_600_000)}`]);
  });

  it("fim da janela: draining → entrega cotações → logout → disconnected → notifica", async () => {
    const deps = fakeSessionDeps("active");
    expect(await endCollectionWindow(deps, { instance: "i", eventId: "e" })).toBe("closed");
    expect(deps.calls).toEqual([
      "status:draining",
      "deliver:e",
      "logout",
      "status:disconnected",
      "notify:e:window_closed",
    ]);
    expect(await endCollectionWindow(deps, { instance: "i", eventId: "e" })).toBe("already_closed");
  });

  it("entrega falha: NÃO desconecta (fica em draining) e o erro sobe para retry", async () => {
    const deps = fakeSessionDeps("active");
    deps.deliverQuotes = () => Promise.reject(new Error("cenários"));
    await expect(endCollectionWindow(deps, { instance: "i", eventId: "e" })).rejects.toThrow("cenários");
    expect(deps.status).toBe("draining");
    expect(deps.calls).not.toContain("logout");
  });

  it("meta de 5 cotações por categoria dispara o encerramento antecipado", async () => {
    const deps = fakeSessionDeps("active");
    const base = { instance: "i", eventId: "e", categories: ["buffet", "doces"] };
    expect(await completeCollectionIfReady(deps, { ...base, quotesByCategory: { buffet: 5, doces: 4 } })).toBe(
      "pending",
    );
    expect(await completeCollectionIfReady(deps, { ...base, quotesByCategory: { buffet: 6, doces: 5 } })).toBe(
      "triggered",
    );
    expect(deps.calls).toEqual(["trigger:e"]);
    const closed = fakeSessionDeps("disconnected");
    expect(await completeCollectionIfReady(closed, { ...base, quotesByCategory: { buffet: 5, doces: 5 } })).toBe(
      "not_active",
    );
  });

  it("encerramento por meta notifica com motivo collection_complete", async () => {
    const deps = fakeSessionDeps("active");
    await endCollectionWindow(deps, { instance: "i", eventId: "e", reason: "collection_complete" });
    expect(deps.calls.at(-1)).toBe("notify:e:collection_complete");
  });

  it("isCollectionComplete: todas as categorias precisam da meta; sem categorias nunca", () => {
    expect(isCollectionComplete({ a: 5, b: 5 }, ["a", "b"])).toBe(true);
    expect(isCollectionComplete({ a: 5 }, ["a", "b"])).toBe(false);
    expect(isCollectionComplete({}, [])).toBe(false);
    expect(isCollectionComplete({ a: 2 }, ["a"], 2)).toBe(true);
  });

  it("logout falho ainda encerra localmente", async () => {
    const deps = fakeSessionDeps("active");
    deps.logout = () => Promise.reject(new Error("timeout"));
    expect(await endCollectionWindow(deps, { instance: "i", eventId: "e" })).toBe("closed");
    expect(deps.status).toBe("disconnected");
  });

  it("sessão perdida: marca, pausa jobs do evento e notifica", async () => {
    const deps = fakeSessionDeps("active");
    expect(await handleSessionLost(deps, { instance: "i", eventId: "e" })).toBe("handled");
    expect(deps.calls).toEqual(["pause:e", "status:disconnected", "notify:e:session_lost"]);
  });
});

/* ---------------- notificações ---------------- */

function fakeNotificationDeps(sink: EmailMessage[]): NotificationDeps & { rows: Set<string> } {
  const rows = new Set<string>();
  return {
    rows,
    getOwnerContact: () =>
      Promise.resolve({ profileId: "p", email: "ana@example.com", displayName: "Ana", eventTitle: "Festa da Lia" }),
    insertNotification: (row) => {
      if (rows.has(row.idempotencyKey)) return Promise.resolve(null);
      rows.add(row.idempotencyKey);
      return Promise.resolve("n1");
    },
    markEmailSent: () => Promise.resolve(),
    email: createMockEmailAdapter(sink),
    warn: () => undefined,
  };
}

describe("quotations_ready", () => {
  it("cria notificação + e-mail uma única vez (idempotente)", async () => {
    const sink: EmailMessage[] = [];
    const deps = fakeNotificationDeps(sink);
    expect(await recordQuotationsReady(deps, { eventId: "e", reason: "window_closed" })).toBe("created");
    expect(await recordQuotationsReady(deps, { eventId: "e", reason: "session_lost" })).toBe("duplicate");
    expect(sink).toHaveLength(1);
    expect(deps.rows.has(quotationsReadyKey("e"))).toBe(true);
  });

  it("e-mail falho não desfaz a notificação", async () => {
    const deps = fakeNotificationDeps([]);
    deps.email = { mode: "mock", send: () => Promise.reject(new Error("smtp")) };
    expect(await recordQuotationsReady(deps, { eventId: "e", reason: "window_closed" })).toBe("created");
  });

  it("texto informa que o WhatsApp foi desconectado por segurança", () => {
    const { text } = renderQuotationsReadyEmail({ displayName: "Ana", eventTitle: "X", reason: "window_closed" });
    expect(text).toMatch(/conexão com o seu WhatsApp foi encerrada/);
  });

  it("adapter: mock em dev, Resend só em produção com chave", async () => {
    expect(getEmailAdapter({ NODE_ENV: "development", RESEND_API_KEY: "k" }).mode).toBe("mock");
    expect(getEmailAdapter({ NODE_ENV: "production" }).mode).toBe("mock");
    expect(getEmailAdapter({ NODE_ENV: "production", RESEND_API_KEY: "k" }).mode).toBe("resend");
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ id: "r1" }), { status: 200 })));
    const adapter = createResendAdapter({ apiKey: "k", from: "a@b.c", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await adapter.send({ to: "x@y.z", subject: "s", text: "t" })).toEqual({ id: "r1" });
    expect(maskEmail("ana@example.com")).toBe("an***@example.com");
  });
});
