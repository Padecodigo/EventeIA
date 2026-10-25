import { describe, expect, it } from "vitest";

import {
  ensureUserInstance,
  newInstanceNameFor,
  resolveInstanceName,
  type InstanceRow,
  type InstanceStore,
} from "@/lib/whatsapp/instance-store";
import { InstanceBusyError } from "@/lib/whatsapp/pairing";

const A = "abcdef12-0000-4000-8000-000000000001";
const B = "abcdef12-ffff-4fff-8fff-ffffffffffff"; // mesmo prefixo de 8 chars que A
const EV1 = "e1111111-1111-4111-8111-111111111111";
const EV2 = "e2222222-2222-4222-8222-222222222222";

type Row = InstanceRow & { profile_id: string };
function store(rows: Row[]): InstanceStore & { rows: Row[] } {
  return {
    rows,
    findByOwner: async (u) => rows.find((r) => r.profile_id === u) ?? null,
    insert: async (r) => {
      if (rows.some((x) => x.instance_name === r.instance_name)) throw new Error("23505 unique");
      rows.push({ id: `id${String(rows.length)}`, ...r });
    },
    rebind: async (id, ev) => {
      const r = rows.find((x) => x.id === id);
      if (r) Object.assign(r, { event_id: ev, status: "connecting" });
    },
  };
}

describe("nome da instância", () => {
  it("instâncias novas usam o UUID completo", () => {
    expect(newInstanceNameFor(A)).toBe("eventeia-abcdef1200004000800000000000" + "0001");
    expect(newInstanceNameFor(A)).not.toBe(newInstanceNameFor(B));
  });

  it("regressão: usuários com o mesmo prefixo não compartilham instância", async () => {
    const s = store([{ id: "legacy", profile_id: A, instance_name: "eventeia-abcdef12", event_id: EV1, status: "active" }]);
    const res = await ensureUserInstance(s, { userId: B, eventId: EV2, onBusy: "throw" });
    expect(res.instance).toBe(newInstanceNameFor(B));
    expect(res.binding).toBe("insert");
    expect(s.rows.find((r) => r.profile_id === A)?.event_id).toBe(EV1);
  });

  it("instância legada continua com o nome antigo", async () => {
    const s = store([{ id: "legacy", profile_id: A, instance_name: "eventeia-abcdef12", event_id: EV1, status: "connected" }]);
    expect(await resolveInstanceName(s, A)).toBe("eventeia-abcdef12");
    const res = await ensureUserInstance(s, { userId: A, eventId: EV1, onBusy: "throw" });
    expect(res).toEqual({ instance: "eventeia-abcdef12", binding: "keep" });
  });
});

describe("vínculo (prospecção/descoberta)", () => {
  it("revincula ao novo evento quando livre", async () => {
    const s = store([{ id: "x", profile_id: A, instance_name: "eventeia-abcdef12", event_id: EV1, status: "disconnected" }]);
    const res = await ensureUserInstance(s, { userId: A, eventId: EV2, onBusy: "keep" });
    expect(res.binding).toBe("rebind");
    expect(s.rows[0]?.event_id).toBe(EV2);
  });

  it("ocupada: throw lança, keep preserva o evento em coleta", async () => {
    const s = store([{ id: "x", profile_id: A, instance_name: "eventeia-abcdef12", event_id: EV1, status: "draining" }]);
    await expect(ensureUserInstance(s, { userId: A, eventId: EV2, onBusy: "throw" })).rejects.toBeInstanceOf(InstanceBusyError);
    const res = await ensureUserInstance(s, { userId: A, eventId: EV2, onBusy: "keep" });
    expect(res.binding).toBe("busy");
    expect(s.rows[0]?.event_id).toBe(EV1);
  });
});
