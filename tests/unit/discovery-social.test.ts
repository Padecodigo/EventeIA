import { describe, expect, it, vi } from "vitest";

import { ingestBatch, type DiscoveryDeps } from "@/lib/discovery/engine";
import { resolveProviders } from "@/lib/discovery/providers/registry";
import { buildSocialPrompt, createSocialProvider, parseSocialProfile, parseSocialResponse } from "@/lib/discovery/providers/social";
import type { DiscoveryQuery } from "@/lib/discovery/providers/types";

const query: DiscoveryQuery = { category: "buffet", categoryLabel: "Buffet", city: "Taubaté", uf: "SP", eventTypeLabel: "Casamento", limit: 5, exclude: [] };
const text = (suppliers: unknown[]) => ({ output_text: JSON.stringify({ suppliers }) });

describe("parseSocialProfile", () => {
  it("normaliza perfis de Instagram, Facebook e TikTok", () => {
    expect(parseSocialProfile("https://instagram.com/BuffetSabor/?hl=pt")).toEqual({ platform: "instagram", handle: "buffetsabor", url: "https://www.instagram.com/BuffetSabor" });
    expect(parseSocialProfile("https://m.facebook.com/buffet.sabor")).toMatchObject({ platform: "facebook", url: "https://www.facebook.com/buffet.sabor" });
    expect(parseSocialProfile("https://www.tiktok.com/@buffetsabor")).toMatchObject({ platform: "tiktok", url: "https://www.tiktok.com/@buffetsabor" });
  });
  it("rejeita posts, login, outros domínios e lookalikes", () => {
    for (const u of ["https://www.instagram.com/p/abc123", "https://www.instagram.com/accounts/login", "https://instagram.com.evil.io/x", "https://exemplo.com/x", "javascript:alert(1)", "https://www.facebook.com/profile.php?id=1"]) {
      expect(parseSocialProfile(u)).toBeNull();
    }
  });
});

describe("SocialProvider", () => {
  it("prompt usa busca pública por site: e cidade+UF, sem login", () => {
    const p = buildSocialPrompt(query);
    expect(p).toContain("site:instagram.com");
    expect(p).toContain("Taubaté (SP, Brasil)");
    expect(p).toContain("não faça login");
  });
  it("extrai nome, link do perfil, telefone/WhatsApp; marca origem e dedupe por @", () => {
    const r = parseSocialResponse(
      text([
        { name: "Buffet Sabor", profile_url: "https://instagram.com/buffetsabor", whatsapp_link: "https://wa.me/5512991234567" },
        { name: "Buffet Sabor (dup)", profile_url: "https://www.instagram.com/BuffetSabor/" },
        { name: "Post", profile_url: "https://www.instagram.com/p/xyz" },
        { name: "Doces Ana", profile_url: "https://facebook.com/docesana", phone: "(12) 3333-4444" },
      ]),
      query,
    );
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ name: "Buffet Sabor", externalId: "instagram:buffetsabor", sourceUrl: "https://www.instagram.com/buffetsabor", whatsappLink: "https://wa.me/5512991234567", city: "Taubaté" });
    expect(r[1]).toMatchObject({ externalId: "facebook:docesana", phone: "(12) 3333-4444" });
  });
  it("chama xAI só com web_search e mapeia 429 para cota", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(JSON.stringify(text([])), { status: 200 })));
    await createSocialProvider({ apiKey: "k", fetchImpl }).search(query);
    const body = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { tools: { type: string }[] };
    expect(body.tools).toEqual([{ type: "web_search" }]);
    const quota = createSocialProvider({ apiKey: "k", fetchImpl: () => Promise.resolve(new Response("", { status: 429 })) });
    await expect(quota.search(query)).rejects.toMatchObject({ name: "ProviderQuotaError" });
  });
  it("registro: social só com XAI_API_KEY", () => {
    expect(resolveProviders({ XAI_API_KEY: "k" }).map((p) => p.name)).toContain("social");
    expect(resolveProviders({ NVIDIA_NIM_API_KEY: "n" }).map((p) => p.name)).not.toContain("social");
    expect(resolveProviders({ DISCOVERY_PROVIDERS: "social" }).map((p) => p.name)).toEqual(["mock"]);
  });
});

describe("integração com a ingestão (dedupe com outros provedores)", () => {
  it("perfil social com telefone já conhecido é duplicado; sem telefone é ignorado", async () => {
    const enqueued: string[] = [];
    const deps = {
      now: () => new Date("2026-10-24T13:00:00Z"),
      dryRunAll: true,
      loadEvent: () => Promise.resolve({ id: "e", title: "T", eventType: "casamento", eventDateIso: "2026-12-12", guestCount: 100, city: "Taubaté", regionCode: "sp", status: "active", ownerId: "o", workspaceId: null, interviewCompleted: true, discoveryStartedAt: null, requirements: [{ category: "buffet", label: "Buffet", quantity: 1, unit: "por_pessoa", notes: null }] }),
      eventProspects: () => Promise.resolve([{ phone: "+5512991234567", category: "buffet", name: "Buffet Sabor (site)" }]),
      isPhoneOptedOut: () => Promise.resolve(false),
      upsertSupplier: () => Promise.resolve({ id: "s", optOutAt: null, lastContactedAt: null }),
      ensureInstance: () => Promise.resolve("i"),
      insertProspect: () => Promise.resolve("p"),
      enqueueProspect: (j: { phoneE164: string }) => (enqueued.push(j.phoneE164), Promise.resolve(true)),
    } as unknown as DiscoveryDeps;
    const suppliers = parseSocialResponse(
      text([
        { name: "Buffet Sabor", profile_url: "https://instagram.com/buffetsabor", whatsapp_link: "https://wa.me/5512991234567" },
        { name: "Sem Fone", profile_url: "https://instagram.com/semfone" },
        { name: "Doces Ana", profile_url: "https://facebook.com/docesana", phone: "(12) 99777-1234" },
      ]),
      query,
    );
    const r = await ingestBatch(deps, { eventId: "e", provider: "social", suppliers });
    expect(r).toMatchObject({ ok: true, outcomes: { duplicate: 1, no_phone: 1, enqueued: 1 } });
    expect(enqueued).toEqual(["+5512997771234"]);
  });
});
