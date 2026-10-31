import { isWithinBusinessWindow, OUTREACH_WINDOW } from "@/lib/business-days";
import { canSend, type SupplierConversationStatus } from "@/lib/outreach/send-guard";
import { supplierRef } from "@/lib/outreach/supplier-links";

/**
 * Repasse do contato do usuário ao fornecedor escolhido (puro e determinístico).
 *
 * Regra de produto: a EventeIA só revela o contato do usuário depois de um
 * consentimento LGPD explícito e específico daquele fornecedor. Sem esse aceite
 * nenhuma mensagem/payload com dados pessoais pode sair para o fornecedor.
 *
 * O envio segue as regras da Meta: só dentro da janela da conversa
 * (24h / 7 dias de anúncio), nunca em opt-out e só em horário comercial.
 * Fora disso, o contato não é enviado: o usuário recebe um link ig.me de
 * fallback (ou o fornecedor recebe e-mail, quando há e-mail público).
 */

/** Versão canônica do texto de consentimento (mude ao alterar o texto). */
export const CONTACT_HANDOFF_CONSENT_VERSION = "2026-10-31-v1";

export interface HandoffProfile {
  displayName: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagramHandle: string | null;
}

export interface HandoffContact {
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  instagramHandle: string | null;
}

export interface HandoffConversation {
  id: string;
  channel: "instagram" | "messenger";
  externalUserId: string;
  status: SupplierConversationStatus;
  windowExpiresAt: string | null;
}

export type HandoffPlan =
  | { mode: "meta"; conversation: HandoffConversation }
  | { mode: "email"; to: string }
  | { mode: "link"; url: string }
  | { mode: "unavailable"; reason: "opted_out" | "sem_canal" };

const EMAIL = /^[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}$/iu;
const PHONE_ONLY = /^\+?\d[\d\s().-]{9,}$/;

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed !== undefined && trimmed.length > 0 ? trimmed : null;
}

/** Texto do checkbox exibido ao usuário — explícito e específico do fornecedor. */
export function contactHandoffConsentText(vendorName: string): string {
  const vendor = clean(vendorName)?.slice(0, 80) ?? "este fornecedor";
  return (
    `Autorizo a EventeIA a compartilhar meu nome e os dados de contato do meu perfil ` +
    `(e-mail, telefone/WhatsApp e Instagram) com ${vendor} para que ele continue o ` +
    `atendimento do meu evento. Entendo que, a partir do repasse, o contato acontece ` +
    `diretamente entre mim e o fornecedor.`
  );
}

/** True apenas quando existe consentimento aceito e registrado. */
export function isContactHandoffConsentValid(
  consent: { acceptedAt: string | null } | null,
): boolean {
  if (consent === null || consent.acceptedAt === null) return false;
  return !Number.isNaN(new Date(consent.acceptedAt).getTime());
}

/** Monta o contato que será compartilhado (somente campos preenchidos). */
export function buildHandoffContact(profile: HandoffProfile): HandoffContact {
  return {
    name: clean(profile.displayName)?.slice(0, 120) ?? "Cliente",
    email: normalizePublicEmail(profile.email),
    phone: clean(profile.phone)?.slice(0, 32) ?? null,
    whatsapp: clean(profile.whatsapp)?.slice(0, 32) ?? null,
    instagramHandle: normalizeInstagramHandle(profile.instagramHandle),
  };
}

/** Mensagem enviada ao fornecedor. Só deve ser chamada APÓS o consentimento. */
export function renderContactHandoffMessage(input: {
  vendorName: string;
  eventTitle: string;
  optionName?: string | null;
  contact: HandoffContact;
}): string {
  const vendor = clean(input.vendorName)?.slice(0, 80) ?? "tudo bem";
  const eventTitle = clean(input.eventTitle)?.slice(0, 120) ?? "seu evento";
  const optionName = clean(input.optionName)?.slice(0, 120) ?? null;

  const lines = [
    `Olá, ${vendor}! A escolha do cliente foi registrada${optionName !== null ? ` para a opção "${optionName}"` : ""} no evento "${eventTitle}".`,
    "",
    "O cliente autorizou o compartilhamento dos dados de contato abaixo (consentimento LGPD):",
    `Nome: ${input.contact.name}`,
  ];

  if (input.contact.email !== null) lines.push(`E-mail: ${input.contact.email}`);
  if (input.contact.phone !== null) lines.push(`Telefone: ${input.contact.phone}`);
  if (input.contact.whatsapp !== null) lines.push(`WhatsApp: ${input.contact.whatsapp}`);
  if (input.contact.instagramHandle !== null) {
    lines.push(`Instagram: @${input.contact.instagramHandle}`);
  }

  lines.push(
    "",
    "A partir daqui, o atendimento segue diretamente entre vocês.",
    "",
    "Equipe EventeIA",
  );
  return lines.join("\n");
}

/** Normaliza e-mail público (do fornecedor). Inválido ⇒ null. */
export function normalizePublicEmail(value: string | null | undefined): string | null {
  const email = clean(value);
  if (email === null) return null;
  return EMAIL.test(email) ? email.toLowerCase() : null;
}

/**
 * Normaliza @handle do Instagram a partir do contato livre do fornecedor.
 * Aceita `@handle`, `handle`, `instagram.com/handle` e URLs do ig.me.
 * Telefone/número puro não vira handle.
 */
export function normalizeInstagramHandle(value: string | null | undefined): string | null {
  const raw = clean(value);
  if (raw === null || PHONE_ONLY.test(raw)) return null;

  const fromUrl = /instagram\.com\/([a-z0-9._]{1,30})/i.exec(raw)?.[1] ?? null;
  const candidate = fromUrl ?? raw.replace(/^@/, "");
  if (!/^[a-z0-9._]{1,30}$/i.test(candidate)) return null;
  if (PHONE_ONLY.test(candidate)) return null;
  return candidate.toLowerCase();
}

/** Link ig.me para o usuário falar direto com o fornecedor (fallback). */
export function contactHandoffFallbackUrl(input: {
  eventId: string;
  supplierHandle: string | null;
}): string | null {
  const handle = normalizeInstagramHandle(input.supplierHandle);
  if (handle === null) return null;
  const ref = encodeURIComponent(supplierRef(input.eventId));
  return `https://ig.me/m/${handle}?ref=${ref}`;
}

/**
 * Decide por qual caminho o contato será repassado AGORA.
 * - janela Meta aberta + horário comercial ⇒ mensagem no IG/Messenger;
 * - fora da janela ⇒ e-mail público (se houver e em horário comercial);
 * - sem janela/e-mail ⇒ link ig.me para o usuário;
 * - opt-out ⇒ nada é enviado.
 */
export function planContactHandoff(input: {
  now: Date;
  eventId: string;
  conversation: HandoffConversation | null;
  supplierEmail: string | null;
  supplierHandle: string | null;
}): HandoffPlan {
  if (input.conversation?.status === "opted_out") {
    return { mode: "unavailable", reason: "opted_out" };
  }

  if (input.conversation !== null) {
    const decision = canSend(
      {
        status: input.conversation.status,
        windowExpiresAt: input.conversation.windowExpiresAt,
      },
      input.now,
    );
    if (decision.ok) {
      return { mode: "meta", conversation: input.conversation };
    }
  }

  const email = normalizePublicEmail(input.supplierEmail);
  if (email !== null && isWithinBusinessWindow(input.now, OUTREACH_WINDOW)) {
    return { mode: "email", to: email };
  }

  const url = contactHandoffFallbackUrl({
    eventId: input.eventId,
    supplierHandle: input.supplierHandle,
  });
  if (url !== null) return { mode: "link", url };

  return { mode: "unavailable", reason: "sem_canal" };
}
