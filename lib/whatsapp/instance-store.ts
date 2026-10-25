/**
 * Instância Evolution do usuário (uma por usuário) — resolução de nome e
 * vínculo com o evento, compartilhados por pareamento, prospecção manual,
 * descoberta automática e preferências do número.
 *
 * - Linhas existentes são localizadas por `profile_id` (nunca pelo nome): o
 *   nome legado `eventeia-<8 chars>` pode colidir entre usuários diferentes.
 * - Instâncias NOVAS usam o UUID completo (sem hífens): sem colisão.
 * - Instâncias legadas mantêm o nome atual (sessões já pareadas seguem funcionando).
 */

import { decideInstanceBinding, InstanceBusyError, type InstanceBinding } from "./pairing";

export interface InstanceRow {
  id: string;
  instance_name: string;
  event_id: string | null;
  status: string;
}

export interface InstanceStore {
  /** Linha mais antiga do usuário (profile_id), ou null. */
  findByOwner(userId: string): Promise<InstanceRow | null>;
  insert(row: { profile_id: string; instance_name: string; status: "connecting"; event_id: string | null }): Promise<void>;
  rebind(id: string, eventId: string): Promise<void>;
}

/** Nome para instâncias NOVAS: UUID completo, à prova de colisão. */
export function newInstanceNameFor(userId: string): string {
  return `eventeia-${userId.replace(/-/g, "").toLowerCase()}`;
}

/** Política quando a instância está coletando para OUTRO evento. */
export type BusyPolicy = "throw" | "keep";

/**
 * Garante a instância do usuário vinculada a `eventId` (insert/keep/rebind).
 * busy + "throw" ⇒ InstanceBusyError; busy + "keep" ⇒ não mexe no vínculo.
 */
export async function ensureUserInstance(
  store: InstanceStore,
  input: { userId: string; eventId: string; onBusy: BusyPolicy },
): Promise<{ instance: string; binding: InstanceBinding }> {
  const row = await store.findByOwner(input.userId);
  const binding = decideInstanceBinding(row, input.eventId);
  if (row === null) {
    const instance = newInstanceNameFor(input.userId);
    await store.insert({ profile_id: input.userId, instance_name: instance, status: "connecting", event_id: input.eventId });
    return { instance, binding };
  }
  if (binding === "busy") {
    if (input.onBusy === "throw") throw new InstanceBusyError();
    return { instance: row.instance_name, binding };
  }
  if (binding === "rebind") await store.rebind(row.id, input.eventId);
  return { instance: row.instance_name, binding };
}

/** Nome da instância já existente do usuário (ou o nome que uma nova teria). */
export async function resolveInstanceName(store: Pick<InstanceStore, "findByOwner">, userId: string): Promise<string> {
  const row = await store.findByOwner(userId);
  return row?.instance_name ?? newInstanceNameFor(userId);
}
