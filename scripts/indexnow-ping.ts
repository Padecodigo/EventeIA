/**
 * Avisa o IndexNow (Bing/Copilot, Yandex, Seznam…) sobre URLs alteradas.
 * Uso: pnpm seo:indexnow [--send] [url ...]   (sem URLs = todas as rotas públicas)
 * Padrão é dry-run: só imprime o payload. --send faz o POST de verdade.
 */
import { INDEXNOW_ENDPOINT, buildIndexNowPayload } from "../lib/seo/indexnow";
import { PRIVATE_PREFIXES, PUBLIC_ROUTES, absoluteUrl, siteUrl } from "../lib/seo/site";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const send = args.includes("--send");
  const base = siteUrl();
  const urls = args.filter((a) => a !== "--send");
  const list = urls.length > 0 ? urls : PUBLIC_ROUTES.map((r) => absoluteUrl(r.path, base));
  const payload = buildIndexNowPayload(base, process.env.INDEXNOW_KEY ?? "", list, PRIVATE_PREFIXES);

  console.log(JSON.stringify({ ...payload, key: "***" }, null, 2));
  if (!send) {
    console.log("dry-run: nada enviado (use --send).");
    return;
  }
  const res = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  console.log(`IndexNow respondeu HTTP ${res.status}`);
  if (res.status >= 400) process.exitCode = 1;
}

void main();
