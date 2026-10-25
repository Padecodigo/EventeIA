import { describe, expect, it } from "vitest";

import { ensureUserInstance, resolveInstanceName, type InstanceRow, type InstanceStore } from "@/lib/whatsapp/instance-store";
import { startPairing, type PairingDeps } from "@/lib/whatsapp/pairing-service";

/**
 * Integração: startPairing + ensureUserInstance sobre uma "tabela"
 * whatsapp_instances em memória (mesmas regras das server actions). O webhook
 * connection.update resolve o evento por whatsapp_instances.event_id — por isso
 * o vínculo precisa seguir o evento pareado.
 */
const USER = "abcdef12-3456-4789-8abc-def012345678";
const EV1 = "e1111111-1111-4111-8111-111111111111";
const EV2 = "e2222222-2222-4222-8222-222222222222";
const LEGACY = "eventeia-abcdef12";

function memoryStore(rows: (InstanceRow & { profile_id: string })[]): InstanceStore {
  return {
    findByOwner: async (userId) => rows.find((r) => r.profile_id === userId) ?? null,
    insert: async (row) => {
      rows.push({ id: `id-${String(rows.length)}`, ...row });
    },
    rebind: async (id, eventId) => {
      const r = rows.find((x) => x.id === id);
      if (r) Object.assign(r, { event_id: eventId, status: "connecting" });
    },
  };
}

function harness(initial: { event_id: string; status: string } | null) {
  const rows: (InstanceRow & { profile_id: string })[] =
    initial === null ? [] : [{ id: "id-legacy", profile_id: USER, instance_name: LEGACY, ...initial }];
  const store = memoryStore(rows);
  const deps: PairingDeps = {
    now: () => 0,
    ownsEvent: async () => true,
    ensureInstanceRow: async ({ userId, eventId }) =>
      (await ensureUserInstance(store, { userId, eventId, onBusy: "throw" })).instance,
    instanceName: (userId) => resolveInstanceName(store, userId),
    connect: async () => ({ pairingCode: "ABCD-EFGH", qrDataUrl: null, alreadyConnected: false }),
    connectionState: async () => "connecting",
  };
  return { rows, deps };
}

describe("pareamento do WhatsApp para um segundo evento", () => {
  it("revincula a instância ao evento atual (antes ficava no 1º evento)", async () => {
    const { rows, deps } = harness({ event_id: EV1, status: "disconnected" });
    const res = await startPairing(deps, { userId: USER, eventId: EV2, phone: "(11) 99876-5432" });
    expect(res.ok).toBe(true);
    expect(rows[0]?.event_id).toBe(EV2);
    expect(rows[0]?.instance_name).toBe(LEGACY);
  });

  it("não sequestra uma coleta em andamento de outro evento", async () => {
    const { rows, deps } = harness({ event_id: EV1, status: "active" });
    const res = await startPairing(deps, { userId: USER, eventId: EV2, phone: "(11) 99876-5432" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/outro evento/);
    expect(rows[0]?.event_id).toBe(EV1);
  });
});
