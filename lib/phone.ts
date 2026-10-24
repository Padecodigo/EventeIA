/** Normaliza telefones brasileiros para E.164 (+55DDNNNNNNNNN). */
export function normalizePhoneE164(input: string): string | null {
  const trimmed = input.trim();

  if (trimmed.startsWith("+") && !trimmed.startsWith("+55")) {
    return null;
  }

  const digits = input.replace(/\D/g, "");
  if (digits.length === 0) {
    return null;
  }

  const national = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;

  if (national.length !== 10 && national.length !== 11) {
    return null;
  }

  return `+55${national}`;
}

/** DDDs válidos no Brasil (Anatel). */
export const BRAZIL_DDDS: ReadonlySet<string> = new Set([
  "11", "12", "13", "14", "15", "16", "17", "18", "19",
  "21", "22", "24", "27", "28",
  "31", "32", "33", "34", "35", "37", "38",
  "41", "42", "43", "44", "45", "46", "47", "48", "49",
  "51", "53", "54", "55",
  "61", "62", "63", "64", "65", "66", "67", "68", "69",
  "71", "73", "74", "75", "77", "79",
  "81", "82", "83", "84", "85", "86", "87", "88", "89",
  "91", "92", "93", "94", "95", "96", "97", "98", "99",
]);

export interface BrazilPhone {
  e164: string;
  ddd: string;
  mobile: boolean;
}

/**
 * Validação estrita para descoberta automática: DDD real, celular com 9 + 8 dígitos
 * (primeiro dígito do assinante 9) ou fixo com 8 dígitos iniciando em 2–5.
 */
export function parseBrazilPhone(input: string): BrazilPhone | null {
  const e164 = normalizePhoneE164(input);
  if (e164 === null) return null;
  const national = e164.slice(3);
  const ddd = national.slice(0, 2);
  if (!BRAZIL_DDDS.has(ddd)) return null;
  const subscriber = national.slice(2);
  if (subscriber.length === 9) {
    if (!subscriber.startsWith("9")) return null;
    if (/^(\d)\1+$/.test(subscriber.slice(1))) return null; // 99999-9999 etc.
    return { e164, ddd, mobile: true };
  }
  if (subscriber.length === 8 && /^[2-5]/.test(subscriber)) {
    if (/^(\d)\1+$/.test(subscriber)) return null;
    return { e164, ddd, mobile: false };
  }
  return null;
}

/** Extrai telefones de texto livre / HTML: links wa.me, api.whatsapp.com, tel: e números soltos. */
export function extractBrazilPhones(text: string): { phone: BrazilPhone; viaWhatsappLink: boolean }[] {
  const found = new Map<string, { phone: BrazilPhone; viaWhatsappLink: boolean }>();
  const add = (raw: string, viaWhatsappLink: boolean) => {
    const phone = parseBrazilPhone(raw);
    if (phone === null) return;
    const prev = found.get(phone.e164);
    found.set(phone.e164, { phone, viaWhatsappLink: viaWhatsappLink || (prev?.viaWhatsappLink ?? false) });
  };
  for (const m of text.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?phone=)\+?(\d{10,13})/gi)) add(m[1] ?? "", true);
  for (const m of text.matchAll(/tel:\+?([\d\s().-]{10,20})/gi)) add(m[1] ?? "", false);
  for (const m of text.matchAll(/(?:\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}[\s.-]?\d{4}\b/g)) add(m[0], false);
  return [...found.values()];
}
