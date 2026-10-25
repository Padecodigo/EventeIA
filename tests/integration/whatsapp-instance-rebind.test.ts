import { describe, expect, it } from "vitest";

import { decideInstanceBinding, InstanceBusyError, instanceNameFor } from "@/lib/whatsapp/pairing";
import { startPairing, type PairingDeps } from "@/lib/whatsapp/pairing-service";

/**
 * Integração: startPairing + "tabela" whatsapp_instances em memória com a mesma
 * regra das server actions. O webhook connection.update resolve o evento por
 * whatsapp_instances.event_id — por isso o vínculo precisa seguir o evento pareado.
 */
const USER = "abcdef12-3456-4789-8abc-def012345678";
const EV1 = "e1111111-1111-4111-8111-111111111111";
const EV2 = "e2222222-2222-4222-8222-222222222222";

function harness(initial: { event_id: string; status: string } | null) {
  const table = new Map<string, { event_id: string | null; status: string }>();
  if (initial !== null) table.set(instanceNameFor(USER), { ...initial });
  const deps: PairingDeps = {
    now: () => 0,
    ownsEvent: async () => true,
    async ensureInstanceRow({ instance, eventId }) {
      const row = table.get(instance) ?? null;
      const binding = decideInstanceBinding(row, eventId);
      if (binding === "busy") throw new InstanceBusyError();
      if (binding !== "keep") table.set(instance, { event_id: eventId, status: "connecting" });
    },
    connect: async () => ({ pairingCode: "ABCD-EFGH", qrDataUrl: null, alreadyConnected: false }),
    connectionState: async () => "connecting",
  };
  return { table, deps };
}

describe("pareamento do WhatsApp para um segundo evento", () => {
  it("revincula a instância ao evento atual (antes ficava no 1º evento)", async () => {
    const { table, deps } = harness({ event_id: EV1, status: "disconnected" });
    const res = await startPairing(deps, { userId: USER, eventId: EV2, phone: "(11) 99876-5432" });
    expect(res.ok).toBe(true);
    expect(table.get(instanceNameFor(USER))?.event_id).toBe(EV2);
  });

  it("não sequestra uma coleta em andamento de outro evento", async () => {
    const { table, deps } = harness({ event_id: EV1, status: "active" });
    const res = await startPairing(deps, { userId: USER, eventId: EV2, phone: "(11) 99876-5432" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/outro evento/);
    expect(table.get(instanceNameFor(USER))?.event_id).toBe(EV1);
  });
});
