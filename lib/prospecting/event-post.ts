import { EVENT_TYPE_LABELS } from "@/lib/catalog/v1";
import { artForEventType } from "@/lib/prospecting/photos";

/**
 * Conteúdo do post de prospecção por evento.
 *
 * Regra de privacidade: a legenda e os parâmetros de imagem carregam apenas
 * dados públicos do evento (tipo, data, cidade/região e código). Nunca entram
 * nome do cliente, título do evento, e-mail, telefone, documento, endereço ou
 * qualquer outro dado pessoal. As funções são puras e determinísticas: a mesma
 * entrada produz sempre a mesma saída.
 */

export const EVENT_POST_CTA =
  "Estamos buscando fornecedores — se você está livre nessa data, chama no Direct";

const EVENT_CODE_PREFIX = "EVT-";
const EVENT_CODE_PREFIXED_RE = /\bEVT-[A-Z0-9]{6,10}\b/gi;
/**
 * Código "cru" digitado sem o prefixo EVT-. Exige ao menos um dígito para não
 * confundir palavras comuns (ex.: "evento", "fornecedor") com um código.
 */
const EVENT_CODE_BARE_RE = /\b(?=[A-Z0-9]{6,12}\b)[A-Z0-9]*\d[A-Z0-9]*\b/gi;

export interface EventPostSource {
  eventId: string;
  eventType: string;
  /** Data do evento no formato `YYYY-MM-DD` (sem horário). */
  eventDate: string;
  city?: string | null;
  /** UF ou região pública do evento (ex.: `SP`). */
  region?: string | null;
  /**
   * Itens livres que procuramos: nome canônico + termos (sinônimos/regionais).
   * Já limpos na entrevista (sem URL/e-mail/telefone); não carregam PII.
   */
  lookingFor?: readonly { canonical: string; terms: readonly string[] }[] | null;
}

export interface EventPostImageParams {
  eventType: string;
  eventDate: string;
  city: string | null;
  region: string | null;
  eventCode: string;
  /** Arte da marca por tipo de evento (asset público, sem PII). */
  artPath: string;
}

export interface EventPostContent {
  eventCode: string;
  caption: string;
  imagePrompt: string;
  imageParams: EventPostImageParams;
}

/** Código público e determinístico do evento (`EVT-XXXXXXXX`). */
export function eventCodeFromId(eventId: string): string {
  const compact = eventId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const body = compact.slice(0, 8).padEnd(8, "0");
  return `${EVENT_CODE_PREFIX}${body}`;
}

/**
 * Extrai todos os candidatos a código de evento de um texto de DM. Códigos com
 * prefixo têm prioridade; na ausência deles, aceita tokens alfanuméricos com
 * ao menos um dígito. A resolução final é feita contra `prospecting_posts`.
 */
export function eventCodesFromText(text: string): string[] {
  const prefixed = [...text.matchAll(EVENT_CODE_PREFIXED_RE)].map((match) =>
    match[0].toUpperCase(),
  );
  if (prefixed.length > 0) return [...new Set(prefixed)];
  const bare = [...text.matchAll(EVENT_CODE_BARE_RE)].map((match) => match[0].toUpperCase());
  return [...new Set(bare)];
}

/** Extrai o código do evento de um texto de DM (ou null quando ausente). */
export function eventCodeFromText(text: string): string | null {
  return eventCodesFromText(text)[0] ?? null;
}

/** Converte `YYYY-MM-DD` em `DD/MM/YYYY` sem depender de fuso. */
export function formatEventDate(eventDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(eventDate.trim());
  return match === null ? eventDate.trim() : `${match[3]}/${match[2]}/${match[1]}`;
}

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatRegion(region: string | null): string | null {
  if (region === null) return null;
  return region.length === 2 ? region.toUpperCase() : region;
}

/** Rótulo público do tipo de evento (texto livre quando não catalogado). */
export function eventTypeLabel(eventType: string): string {
  return EVENT_TYPE_LABELS[eventType as keyof typeof EVENT_TYPE_LABELS] ?? eventType.trim();
}

/** Cidade/região no formato seguro para exibição (`Taubaté/SP`). */
export function eventLocationLabel(input: EventPostSource): string {
  const city = clean(input.city);
  const region = formatRegion(clean(input.region));
  if (city !== null && region !== null) return `${city}/${region}`;
  if (city !== null) return city;
  if (region !== null) return region;
  return "Brasil";
}

/** Parâmetros de imagem: somente dados públicos (sem PII do cliente). */
export function buildEventPostImageParams(input: EventPostSource): EventPostImageParams {
  return {
    eventType: input.eventType,
    eventDate: input.eventDate,
    city: clean(input.city),
    region: formatRegion(clean(input.region)),
    eventCode: eventCodeFromId(input.eventId),
    artPath: artForEventType(input.eventType),
  };
}

/** Prompt visual seguro: usa apenas o tipo do evento (sem título/nome/PII). */
export function buildEventPostImagePrompt(input: EventPostSource): string {
  const typeLabel = eventTypeLabel(input.eventType);
  const location = eventLocationLabel(input);
  return `arte editorial da EventeIA para evento do tipo ${typeLabel}, referência visual de ${location}, sem texto, sem números, sem nomes, sem logotipos de terceiros e sem marca d'água`;
}

/** Legenda exata da prospecção por evento + dados públicos + código. */
const MAX_HASHTAGS = 30;
const MAX_CAPTION = 2200;

/** `pula-pula` → `#pulapula`; `cama elástica` → `#camaelastica`. */
export function hashtagFor(term: string): string | null {
  const body = term
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 30);
  return body.length >= 3 && !/^\d+$/.test(body) ? `#${body}` : null;
}

function safeTerm(term: string): string {
  return term
    .replace(/[#@<>\n\r]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

export function buildEventPostCaption(input: EventPostSource): string {
  const typeLabel = eventTypeLabel(input.eventType);
  const date = formatEventDate(input.eventDate);
  const location = eventLocationLabel(input);
  const code = eventCodeFromId(input.eventId);
  const base = `${EVENT_POST_CTA}.\n\n${typeLabel} · ${date} · ${location}\nCódigo do evento: ${code}`;
  const items = (input.lookingFor ?? []).slice(0, 10);
  if (items.length === 0) return base;
  const names = items.map((i) => safeTerm(i.canonical)).filter((n) => n.length > 0);
  const tags: string[] = [];
  for (const term of items.flatMap((i) => [i.canonical, ...i.terms])) {
    const tag = hashtagFor(term);
    if (tag !== null && !tags.includes(tag) && tags.length < MAX_HASHTAGS) tags.push(tag);
  }
  let caption = names.length > 0 ? `${base}\n\nProcuramos: ${names.join(", ")}` : base;
  for (let n = tags.length; n > 0; n--) {
    const withTags = `${caption}\n\n${tags.slice(0, n).join(" ")}`;
    if (withTags.length <= MAX_CAPTION) return withTags;
  }
  if (caption.length > MAX_CAPTION) caption = base;
  return caption;
}

export function buildEventPostContent(input: EventPostSource): EventPostContent {
  return {
    eventCode: eventCodeFromId(input.eventId),
    caption: buildEventPostCaption(input),
    imagePrompt: buildEventPostImagePrompt(input),
    imageParams: buildEventPostImageParams(input),
  };
}
