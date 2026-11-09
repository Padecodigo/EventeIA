import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { generateNvidiaImage } = await import("@/lib/nvidia/image");

describe("prompt NVIDIA", () => {
  it("inclui Avoid no Flux Dev e no fallback, com semente diferente de zero", async () => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      const model = url.includes("klein") ? "klein" : "dev";
      if (model === "dev") {
        return new Response("rate limit", { status: 429 });
      }
      return new Response(
        JSON.stringify({
          artifacts: [{ base64: Buffer.from("png").toString("base64") }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const result = await generateNvidiaImage({
      apiKey: "k",
      prompt: "a still banquet table",
      seed: 42,
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(bodies.length).toBeGreaterThanOrEqual(2);
    for (const body of bodies) {
      expect(String(body.prompt)).toContain("Avoid:");
      expect(body.seed).toBe(42);
    }
  });
});
