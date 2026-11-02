import type { EmailAdapter } from "@/lib/notifications/email";

import type { Channel } from "./supplier-conversations";

/**
 * Aviso ao dono quando um fornecedor responde (IG/Messenger), por e-mail.
 *
 * Anti-spam: a primeira mensagem de uma conversa dentro da janela dispara o
 * e-mail; as seguintes só incrementam o contador. Quando a janela expira, a
 * próxima mensagem dispara um novo e-mail com o total acumulado (digest).
 */

export interface SupplierReplyNotice {
  conversationId: string;
  channel: Channel;
  eventId: string | null;
  supplierKnown: boolean;
  text: string;
  at: Date;
}

/** Contador com expiração por chave (Redis em produção; memória nos testes). */
export interface NotifyThrottle {
  /** Marca a chave se livre (TTL em s). true = pode enviar agora. */
  acquire(key: string, ttlSeconds: number): Promise<boolean>;
  /** Soma 1 às mensagens pendentes da chave e devolve o total; `take` zera. */
  bump(key: string): Promise<number>;
  take(key: string): Promise<number>;
}

export interface OwnerNotifyDeps {
  to: string | null;
  throttleMinutes: number;
  email: EmailAdapter;
  throttle: NotifyThrottle;
  appUrl: string;
}

const CHANNEL_LABEL: Record<Channel, string> = { instagram: "Instagram", messenger: "Messenger" };

export function buildSupplierReplyEmail(
  notice: SupplierReplyNotice,
  pendingBefore: number,
  appUrl: string,
): { subject: string; text: string } {
  const channel = CHANNEL_LABEL[notice.channel];
  const snippet = notice.text.length > 300 ? `${notice.text.slice(0, 300)}…` : notice.text;
  const link = notice.eventId !== null ? `${appUrl}/admin/eventos/${notice.eventId}` : `${appUrl}/admin`;
  const lines = [
    `Um fornecedor respondeu pelo ${channel}.`,
    notice.supplierKnown ? "Fornecedor identificado no cadastro." : "Fornecedor ainda não identificado.",
    notice.eventId !== null ? `Evento: ${notice.eventId}` : "Conversa ainda sem evento vinculado.",
    "",
    `Mensagem: "${snippet}"`,
  ];
  if (pendingBefore > 0) {
    lines.push("", `Além desta, ${String(pendingBefore)} mensagem(ns) desta conversa chegaram desde o último aviso.`);
  }
  lines.push("", `Abrir: ${link}`);
  return { subject: `Resposta de fornecedor no ${channel}`, text: lines.join("\n") };
}

/** Nunca lança: falha de aviso não pode derrubar o processamento do webhook. */
export async function notifyOwnerOfSupplierReply(
  deps: OwnerNotifyDeps,
  notice: SupplierReplyNotice,
): Promise<{ sent: boolean; reason?: "no_recipient" | "throttled" | "error" }> {
  if (deps.to === null || deps.to.length === 0) return { sent: false, reason: "no_recipient" };
  const lockKey = `notify:supplier-reply:lock:${notice.conversationId}`;
  const pendingKey = `notify:supplier-reply:pending:${notice.conversationId}`;
  try {
    const free = await deps.throttle.acquire(lockKey, deps.throttleMinutes * 60);
    if (!free) {
      await deps.throttle.bump(pendingKey);
      return { sent: false, reason: "throttled" };
    }
    const pending = await deps.throttle.take(pendingKey);
    const message = buildSupplierReplyEmail(notice, pending, deps.appUrl);
    await deps.email.send({ to: deps.to, ...message, eventId: notice.eventId });
    return { sent: true };
  } catch {
    return { sent: false, reason: "error" };
  }
}

/** Throttle em memória (testes e fallback). */
export function createMemoryThrottle(now: () => number = () => Date.now()): NotifyThrottle {
  const locks = new Map<string, number>();
  const counts = new Map<string, number>();
  return {
    acquire(key, ttlSeconds) {
      const until = locks.get(key);
      if (until !== undefined && until > now()) return Promise.resolve(false);
      locks.set(key, now() + ttlSeconds * 1000);
      return Promise.resolve(true);
    },
    bump(key) {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return Promise.resolve(n);
    },
    take(key) {
      const n = counts.get(key) ?? 0;
      counts.delete(key);
      return Promise.resolve(n);
    },
  };
}

/** Subconjunto do ioredis usado aqui. */
export interface ThrottleRedis {
  set(key: string, value: string, mode: "EX", ttl: number, flag: "NX"): Promise<string | null>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  getdel(key: string): Promise<string | null>;
}

export function createRedisThrottle(redis: ThrottleRedis): NotifyThrottle {
  return {
    async acquire(key, ttlSeconds) {
      return (await redis.set(key, "1", "EX", ttlSeconds, "NX")) === "OK";
    },
    async bump(key) {
      const n = await redis.incr(key);
      await redis.expire(key, 7 * 24 * 3600);
      return n;
    },
    async take(key) {
      const raw = await redis.getdel(key);
      return raw === null ? 0 : Number.parseInt(raw, 10) || 0;
    },
  };
}
