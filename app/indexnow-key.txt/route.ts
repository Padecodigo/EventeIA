import { indexNowKeySchema } from "@/lib/seo/indexnow";

/** Arquivo de verificação IndexNow (Bing, Yandex, Seznam…): devolve a chave em texto puro. */
export function GET(): Response {
  const parsed = indexNowKeySchema.safeParse(process.env.INDEXNOW_KEY ?? "");
  if (!parsed.success) return new Response("Not found", { status: 404 });
  return new Response(parsed.data, {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
  });
}
