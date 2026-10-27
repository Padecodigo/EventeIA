import { describe, expect, it } from "vitest";

import { MODELSLAB } from "@/lib/meta/limits";
import { generateImage } from "@/lib/modelslab/client";

function fakeFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;
}

describe("ModelsLab — texto para imagem", () => {
  it("envia a chave no corpo e usa o endpoint oficial", async () => {
    const captured: { url: string; body: Record<string, unknown> } = { url: "", body: {} };
    const result = await generateImage({
      apiKey: "k123",
      prompt: "salão de festa",
      fetchImpl: ((url: string, init?: RequestInit) => {
        captured.url = url;
        captured.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Promise.resolve(
          new Response(JSON.stringify({ status: "success", id: 7, output: ["https://img/1.jpg"] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }) as unknown as typeof fetch,
    });

    expect(result).toEqual({ ok: true, images: ["https://img/1.jpg"], id: 7 });
    expect(captured.url).toBe("https://modelslab.com/api/v6/realtime/text2img");
    expect(captured.body.key).toBe("k123");
    expect(captured.body.width).toBe(MODELSLAB.maxWidthPx);
  });

  it("faz clamp dentro dos limites da documentação", async () => {
    let body: Record<string, unknown> = {};
    await generateImage({
      apiKey: "k",
      prompt: "x",
      width: 99999,
      height: 1,
      samples: 99,
      fetchImpl: ((_url: string, init?: RequestInit) => {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Promise.resolve(new Response(JSON.stringify({ status: "success", output: ["a"] }), { status: 200 }));
      }) as unknown as typeof fetch,
    });
    expect(body.width).toBe(MODELSLAB.maxWidthPx);
    expect(body.height).toBe(64);
    expect(body.samples).toBe(MODELSLAB.maxSamples);
  });

  it("propaga erro da API", async () => {
    const result = await generateImage({
      apiKey: "k",
      prompt: "x",
      fetchImpl: fakeFetch({ status: "error", message: "invalid key" }, 401),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid key");
  });

  it("não aceita resposta sem imagens", async () => {
    const result = await generateImage({ apiKey: "k", prompt: "x", fetchImpl: fakeFetch({ status: "success", output: [] }) });
    expect(result.ok).toBe(false);
  });
});
