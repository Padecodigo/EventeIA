/**
 * Fluxo de conexão do WhatsApp do cliente com dependências injetadas (testável).
 * A implementação real (Supabase/Evolution) é montada nas server actions.
 */

import {
  InstanceBusyError,
  PAIRING_CODE_TTL_SECONDS,
  instanceNameFor,
  parsePairingPhone,
  type ConnectPayload,
} from "./pairing";

export interface PairingDeps {
  now(): number;
  /** O evento pertence ao usuário (RLS)? */
  ownsEvent(eventId: string): Promise<boolean>;
  /** Garante a linha em whatsapp_instances (status connecting) vinculada a ESTE evento; InstanceBusyError se ocupada. */
  ensureInstanceRow(input: { userId: string; instance: string; eventId: string }): Promise<void>;
  connect(instance: string, numberDigits: string): Promise<ConnectPayload>;
  connectionState(instance: string): Promise<"open" | "connecting" | "close">;
}

export type PairingResult =
  | {
      ok: true;
      pairingCode: string | null;
      qrDataUrl: string | null;
      expiresAt: number;
      connected: boolean;
    }
  | { ok: false; error: string };

export async function startPairing(
  deps: PairingDeps,
  input: { userId: string; eventId: string; phone: string },
): Promise<PairingResult> {
  const digits = parsePairingPhone(input.phone);
  if (digits === null) {
    return {
      ok: false,
      error: "Número inválido. Use DDD + número (ex.: 11 99999-9999) ou +código do país.",
    };
  }
  if (!(await deps.ownsEvent(input.eventId))) return { ok: false, error: "Evento não encontrado." };

  const instance = instanceNameFor(input.userId);
  try {
    await deps.ensureInstanceRow({ userId: input.userId, instance, eventId: input.eventId });
    const payload = await deps.connect(instance, digits);
    if (!payload.alreadyConnected && payload.pairingCode === null && payload.qrDataUrl === null) {
      return {
        ok: false,
        error: "O WhatsApp não gerou o código agora. Tente novamente em instantes.",
      };
    }
    return {
      ok: true,
      pairingCode: payload.pairingCode,
      qrDataUrl: payload.qrDataUrl,
      expiresAt: deps.now() + PAIRING_CODE_TTL_SECONDS * 1000,
      connected: payload.alreadyConnected,
    };
  } catch (caught) {
    if (caught instanceof InstanceBusyError) {
      return {
        ok: false,
        error:
          "Seu WhatsApp ainda está coletando orçamentos de outro evento. Aguarde essa coleta terminar para conectar este.",
      };
    }
    return { ok: false, error: "Não foi possível falar com o WhatsApp agora. Tente novamente." };
  }
}

export async function checkPairing(
  deps: PairingDeps,
  input: { userId: string; eventId: string },
): Promise<{ state: "open" | "connecting" | "close" | "unknown" }> {
  if (!(await deps.ownsEvent(input.eventId))) return { state: "unknown" };
  try {
    return { state: await deps.connectionState(instanceNameFor(input.userId)) };
  } catch {
    return { state: "unknown" };
  }
}
