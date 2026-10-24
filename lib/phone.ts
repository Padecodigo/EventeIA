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
