import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ calls: 0 }));

vi.mock("@/lib/discovery/runtime", () => ({ createDiscoveryDeps: () => ({}) }));
vi.mock("@/lib/discovery/engine", () => ({
  ingestBatch: () => {
    state.calls += 1;
    return Promise.resolve({ ok: true, outcomes: { enqueued: 1 } });
  },
}));

const SECRET = "s".repeat(40);
const url = "http://localhost/api/internal/suppliers/ingest";
const body = { eventId: "11111111-1111-4111-8111-111111111111", suppliers: [{ name: "A" }] };

describe("POST /api/internal/suppliers/ingest", () => {
  beforeEach(() => {
    vi.stubEnv("DISCOVERY_INGEST_SECRET", SECRET);
    state.calls = 0;
  });
  afterEach(() => vi.unstubAllEnvs());

  it("401 sem segredo ou com segredo errado", async () => {
    const { POST } = await import("@/app/api/internal/suppliers/ingest/route");
    expect((await POST(new Request(url, { method: "POST", body: JSON.stringify(body) }))).status).toBe(401);
    const wrong = new Request(url, { method: "POST", headers: { "x-ingest-secret": "x".repeat(40) }, body: JSON.stringify(body) });
    expect((await POST(wrong)).status).toBe(401);
    expect(state.calls).toBe(0);
  });
  it("falha fechada quando o segredo não está configurado", async () => {
    vi.stubEnv("DISCOVERY_INGEST_SECRET", "");
    const { POST } = await import("@/app/api/internal/suppliers/ingest/route");
    const req = new Request(url, { method: "POST", headers: { "x-ingest-secret": "" }, body: JSON.stringify(body) });
    expect((await POST(req)).status).toBe(401);
  });
  it("400 com payload inválido (zod)", async () => {
    const { POST } = await import("@/app/api/internal/suppliers/ingest/route");
    const req = new Request(url, { method: "POST", headers: { "x-ingest-secret": SECRET }, body: JSON.stringify({ eventId: "nao-uuid", suppliers: [] }) });
    expect((await POST(req)).status).toBe(400);
  });
  it("200 e repassa ao motor com segredo correto", async () => {
    const { POST } = await import("@/app/api/internal/suppliers/ingest/route");
    const req = new Request(url, { method: "POST", headers: { "x-ingest-secret": SECRET }, body: JSON.stringify(body) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(state.calls).toBe(1);
  });
});
