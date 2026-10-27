/**
 * Envio de mensagens via Meta Graph API (Instagram Direct + Messenger).
 *
 * ⚠️ Regra da plataforma: NÃO há abordagem fria. Estes clientes só respondem a
 * quem já falou com a conta (janela de 24h). Enviar a primeira mensagem a um
 * fornecedor que não nos procurou é violação e derruba a conta. O papel de
 * prospecção NÃO é atendido por aqui (ver .context/WHATSAPP_EVOLUTION.md).
 */

export type MetaSendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string; status: number | null };

export interface MetaSendInput {
  accessToken: string;
  recipientId: string;
  text: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
}

const API_BASE = "https://graph.facebook.com";

/** Resposta (dentro da janela de 24h) a uma DM no Instagram do negócio. */
export async function sendInstagramText(input: MetaSendInput & {
  instagramBusinessId: string;
}): Promise<MetaSendResult> {
  const version = input.apiVersion ?? "v21.0";
  const url = `${API_BASE}/${version}/${input.instagramBusinessId}/messages`;
  return post(url, input.accessToken, {
    recipient: { id: input.recipientId },
    message: { text: input.text },
  }, input.fetchImpl);
}

/** Resposta (dentro da janela de 24h) a uma mensagem na Página (Messenger). */
export async function sendMessengerText(input: MetaSendInput & {
  pageId: string;
}): Promise<MetaSendResult> {
  const version = input.apiVersion ?? "v21.0";
  const url = `${API_BASE}/${version}/${input.pageId}/messages`;
  return post(url, input.accessToken, {
    recipient: { id: input.recipientId },
    messaging_type: "RESPONSE",
    message: { text: input.text },
  }, input.fetchImpl);
}

async function post(
  url: string,
  accessToken: string,
  body: unknown,
  fetchImpl: typeof fetch | undefined,
): Promise<MetaSendResult> {
  const fetcher = fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    return { ok: false, error: String(error), status: null };
  }

  const payload = (await response.json().catch(() => null)) as
    | { message_id?: string; error?: { message?: string; code?: number } }
    | null;

  if (!response.ok) {
    return {
      ok: false,
      error: payload?.error?.message ?? `HTTP ${String(response.status)}`,
      status: response.status,
    };
  }

  const messageId = payload?.message_id;
  if (messageId === undefined) {
    return { ok: false, error: "resposta sem message_id", status: response.status };
  }
  return { ok: true, messageId };
}
