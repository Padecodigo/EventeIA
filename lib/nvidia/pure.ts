/** Helpers puros da resposta do NVIDIA NIM (sem I/O, testáveis). */

export interface ExtractedImage {
  base64: string | null;
  url: string | null;
  mime: string | null;
}

const DATA_URI = /^data:(image\/[\w.+-]+);base64,(.+)$/s;

export function normalizeImageValue(value: string): ExtractedImage {
  const match = DATA_URI.exec(value.trim());
  if (match !== null) return { base64: match[2] ?? null, url: null, mime: match[1] ?? null };
  if (value.startsWith("http://") || value.startsWith("https://")) return { base64: null, url: value, mime: null };
  return { base64: value, url: null, mime: null };
}

export function extractNvidiaImage(body: unknown): ExtractedImage | null {
  if (typeof body !== "object" || body === null) return null;
  const record = body as Record<string, unknown>;

  const artifacts = record.artifacts;
  if (Array.isArray(artifacts) && artifacts.length > 0) {
    const first = (artifacts as unknown[])[0];
    if (typeof first === "object" && first !== null) {
      const item = first as Record<string, unknown>;
      for (const key of ["base64", "b64_json", "image"]) {
        const value = item[key];
        if (typeof value === "string" && value.length > 0) return normalizeImageValue(value);
      }
      for (const key of ["url", "uri"]) {
        const value = item[key];
        if (typeof value === "string" && value.length > 0) return { base64: null, url: value, mime: null };
      }
    }
  }

  for (const key of ["image", "image_url", "url", "b64_json", "base64"]) {
    const value = record[key];
    if (typeof value === "string" && value.length > 0) return normalizeImageValue(value);
  }

  const data = record.data;
  if (Array.isArray(data) && data.length > 0) {
    const first = (data as unknown[])[0];
    if (typeof first === "object" && first !== null) {
      const item = first as Record<string, unknown>;
      for (const key of ["b64_json", "base64", "url"]) {
        const value = item[key];
        if (typeof value === "string" && value.length > 0) return normalizeImageValue(value);
      }
    }
  }

  return null;
}

export function sniffMime(bytes: Buffer): string | null {
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 3).toString("ascii") === "GIF") return "image/gif";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  return null;
}
