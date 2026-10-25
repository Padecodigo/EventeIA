/**
 * E-mail transacional: Resend (fetch, sem SDK) em produção; mock em dev/teste.
 */

import { logger } from "@/lib/logger";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Evento ao qual o envio é atribuído no painel de custos (não vai para o Resend). */
  eventId?: string | null;
}

export interface EmailAdapter {
  readonly mode: "resend" | "mock";
  send(message: EmailMessage): Promise<{ id: string | null }>;
}

export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  return `${user.slice(0, 2)}***@${domain}`;
}

export function createMockEmailAdapter(
  sink: EmailMessage[] | null = null,
): EmailAdapter {
  return {
    mode: "mock",
    send(message) {
      sink?.push(message);
      logger.info({ to: maskEmail(message.to), subject: message.subject }, "e-mail (mock) registrado");
      return Promise.resolve({ id: null });
    },
  };
}

export function createResendAdapter(options: {
  apiKey: string;
  from: string;
  fetchImpl?: typeof fetch;
}): EmailAdapter {
  const doFetch = options.fetchImpl ?? fetch;
  return {
    mode: "resend",
    async send(message) {
      const response = await doFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${options.apiKey}`,
        },
        body: JSON.stringify({
          from: options.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        throw new Error(`Resend HTTP ${String(response.status)}`);
      }
      // Mede o envio no painel de custos (import dinâmico: módulo server-only, best-effort).
      void import("@/lib/finance/metering").then((m) => m.meterUsage("resend", "email", { eventId: message.eventId ?? null })).catch(() => undefined);
      const body = (await response.json()) as { id?: unknown };
      return { id: typeof body.id === "string" ? body.id : null };
    },
  };
}

/** Mock em dev/teste ou sem chave; Resend apenas em produção configurada. */
export function getEmailAdapter(env: NodeJS.ProcessEnv = process.env): EmailAdapter {
  const apiKey = env.RESEND_API_KEY;
  const useMock =
    env.EMAIL_MOCK === "1" ||
    env.NODE_ENV !== "production" ||
    apiKey === undefined ||
    apiKey.length === 0;
  if (useMock || apiKey === undefined) {
    return createMockEmailAdapter();
  }
  return createResendAdapter({ apiKey, from: env.EMAIL_FROM ?? "EventeIA <nao-responda@eventeia.com>" });
}
