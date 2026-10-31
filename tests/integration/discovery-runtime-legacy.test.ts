import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regressões do runtime da descoberta após a remoção do WhatsApp:
 * - opt-out legado (consents.channel = "whatsapp") continua bloqueando contato;
 * - `whatsapp_verified` não filtra mais fornecedores válidos.
 */
type Op = [string, string, unknown];

const { db, query } = vi.hoisted(() => {
  const db = {
    consents: [] as { status: string }[],
    suppliers: [] as Record<string, unknown>[],
    ops: [] as Op[],
  };

  type Query = {
    select: (columns?: string) => Query;
    eq: (column: string, value: unknown) => Query;
    ilike: (column: string, value: unknown) => Query;
    is: (column: string, value: unknown) => Query;
    neq: (column: string, value: unknown) => Query;
    gte: (column: string, value: unknown) => Query;
    limit: (value: number) => Query;
    maybeSingle: () => Promise<{ data: unknown; error: null }>;
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => Promise<unknown>;
  };

  function query(table: string): Query {
    const q: Query = {
      select: () => q,
      eq: (column, value) => (db.ops.push([`${table}.eq`, column, value]), q),
      ilike: (column, value) => (db.ops.push([`${table}.ilike`, column, value]), q),
      is: (column, value) => (db.ops.push([`${table}.is`, column, value]), q),
      neq: (column, value) => (db.ops.push([`${table}.neq`, column, value]), q),
      gte: (column, value) => (db.ops.push([`${table}.gte`, column, value]), q),
      limit: () => q,
      maybeSingle: async () => ({
        data: table === "consents" ? (db.consents[0] ?? null) : null,
        error: null,
      }),
      then: (resolve) => Promise.resolve({ data: table === "suppliers" ? db.suppliers : [], error: null }).then(resolve),
    };
    return q;
  }

  return { db, query };
});

vi.mock("@/lib/env", () => ({ serverEnv: () => ({ DISCOVERY_DRY_RUN: false }) }));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ from: (table: string) => query(table) }),
}));
vi.mock("@/lib/queue", () => ({
  QUEUE_NAMES: {},
  enqueue: async () => true,
  getQueue: () => ({}),
  getRedisConnection: () => ({}),
}));

const { createDiscoveryDeps } = await import("@/lib/discovery/runtime");

beforeEach(() => {
  db.consents.length = 0;
  db.suppliers.length = 0;
  db.ops.length = 0;
});

describe("isPhoneOptedOut honra consentimentos legados do WhatsApp", () => {
  it("bloqueia quem pediu opt-out no canal legado", async () => {
    db.consents.push({ status: "opted_out" });
    const deps = createDiscoveryDeps();

    expect(await deps.isPhoneOptedOut("+5512991110000")).toBe(true);
    expect(db.ops).toEqual(
      expect.arrayContaining([
        ["consents.eq", "phone_e164", "+5512991110000"],
        ["consents.eq", "channel", "whatsapp"],
      ]),
    );
  });

  it("libera quando o consentimento legado não é opt-out", async () => {
    db.consents.push({ status: "granted" });
    expect(await createDiscoveryDeps().isPhoneOptedOut("+5512991110000")).toBe(false);
  });
});

describe("cachedSuppliers não exclui mais por whatsapp_verified", () => {
  it("considera fornecedor com whatsapp_verified = false e não aplica esse filtro", async () => {
    db.suppliers.push({
      name: "Buffet do Vale",
      category: "buffet",
      phone_e164: "+5512991110000",
      source_url: "https://exemplo.com.br",
      website_url: null,
      source_provider: "osm",
      city: "Taubaté",
      whatsapp_verified: false,
    });

    const rows = await createDiscoveryDeps().cachedSuppliers({
      city: "Taubaté",
      category: "buffet",
      excludePhones: [],
      limit: 10,
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Buffet do Vale");
    expect(db.ops.some(([op, column]) => op === "suppliers.neq" && column === "whatsapp_verified")).toBe(false);
  });
});
