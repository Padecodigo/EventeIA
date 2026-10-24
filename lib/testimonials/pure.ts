/**
 * Regras puras do fluxo de depoimentos (testáveis sem banco/rede).
 * Fluxo completo: .context/DESIGN_SYSTEM.md §10.
 */

export type TestimonialAudience = "b2c" | "b2b";

export const CONSENT_VERSION = "2026-10-v2";

export const CONSENT_TEXT =
  "Autorizo a EventeIA a publicar meu depoimento no site e nos canais oficiais, " +
  "com meu nome, cidade e contexto do evento (tipo e número de convidados). " +
  "Sei que posso solicitar a correção ou remoção a qualquer momento pelos canais de atendimento, " +
  "conforme a LGPD (Lei nº 13.709/2018).";

export interface TestimonialCardData {
  id: string;
  initials: string;
  name: string;
  context: string;
  city: string;
  quote: string;
  outcome: string;
  tone: "vinho" | "champagne" | "areia";
}

export interface InviteLike {
  expires_at: string;
  used_at: string | null;
}

/** Convite é válido se não foi usado e não expirou. */
export function isInviteUsable(invite: InviteLike, now: Date = new Date()): boolean {
  if (invite.used_at !== null) {
    return false;
  }
  return new Date(invite.expires_at).getTime() > now.getTime();
}

/** Iniciais para o avatar (ex.: "Camila Rezende" → "CR"). */
export function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
  const first = parts[0]?.[0] ?? "E";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : undefined;
  return `${first}${last ?? ""}`.toUpperCase().slice(0, 2);
}

const TONES: ReadonlyArray<TestimonialCardData["tone"]> = ["champagne", "vinho", "areia"];

export interface PublishedTestimonialRow {
  id: string;
  author_name: string;
  city: string | null;
  event_context: string | null;
  quote: string;
  outcome: string | null;
  audience: string;
  published_at: string | null;
}

/** Converte a linha publicada em dados de apresentação. */
export function toCardData(
  row: PublishedTestimonialRow,
  index: number,
): TestimonialCardData {
  return {
    id: row.id,
    initials: initialsFromName(row.author_name),
    name: row.author_name,
    context: row.event_context ?? "Evento na EventeIA",
    city: row.city ?? "",
    quote: row.quote,
    outcome: row.outcome ?? "",
    tone: TONES[index % TONES.length] ?? "champagne",
  };
}

/** Valida limites do formulário (defesa em profundidade além do zod da action). */
export const TESTIMONIAL_LIMITS = {
  nameMin: 2,
  nameMax: 80,
  cityMax: 60,
  quoteMin: 80,
  quoteMax: 800,
  outcomeMax: 80,
} as const;

export interface InviteEligibleEvent {
  event_date: string;
  status: string;
}

/**
 * Elegível para convite automático: evento ativo/concluído, entre 1 e 30 dias
 * após a data (evita convidar antes da festa ou ressuscitar eventos antigos).
 */
export function isEligibleForInvite(event: InviteEligibleEvent, todayIso: string): boolean {
  if (event.status !== "active" && event.status !== "completed") {
    return false;
  }

  const eventTime = Date.parse(`${event.event_date}T00:00:00Z`);
  const todayTime = Date.parse(`${todayIso}T00:00:00Z`);

  if (!Number.isFinite(eventTime) || !Number.isFinite(todayTime)) {
    return false;
  }

  const daysSince = Math.floor((todayTime - eventTime) / 86_400_000);
  return daysSince >= 1 && daysSince <= 30;
}
