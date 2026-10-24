import { z } from "zod";

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_KEY_PATH = "/indexnow-key.txt";

/** Chave IndexNow: 8–128 caracteres [a-zA-Z0-9-] (spec indexnow.org). */
export const indexNowKeySchema = z.string().regex(/^[a-zA-Z0-9-]{8,128}$/);

export interface IndexNowPayload {
  host: string;
  key: string;
  keyLocation: string;
  urlList: string[];
}

/** Monta o corpo do POST; descarta URLs de outro host ou privadas. Máx. 10.000 URLs. */
export function buildIndexNowPayload(
  base: string,
  key: string,
  urls: readonly string[],
  privatePrefixes: readonly string[] = [],
): IndexNowPayload {
  const parsedKey = indexNowKeySchema.parse(key);
  const host = new URL(base).host;
  const urlList = [...new Set(urls)]
    .map((u) => new URL(u, base))
    .filter((u) => u.host === host)
    .filter((u) => !privatePrefixes.some((p) => u.pathname === p || u.pathname.startsWith(`${p}/`)))
    .map((u) => u.toString())
    .slice(0, 10_000);
  return { host, key: parsedKey, keyLocation: new URL(INDEXNOW_KEY_PATH, base).toString(), urlList };
}
