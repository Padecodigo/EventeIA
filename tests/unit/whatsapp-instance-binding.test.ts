import { describe, expect, it } from "vitest";

import { decideInstanceBinding } from "@/lib/whatsapp/pairing";

const A = "e1111111-1111-4111-8111-111111111111";
const B = "e2222222-2222-4222-8222-222222222222";

describe("decideInstanceBinding (regressão: pareamento do 2º evento ficava preso ao 1º)", () => {
  it("sem linha ⇒ cria", () => expect(decideInstanceBinding(null, A)).toBe("insert"));
  it("mesmo evento ⇒ mantém", () => expect(decideInstanceBinding({ event_id: A, status: "connecting" }, A)).toBe("keep"));
  it("outro evento, sessão parada ⇒ revincula ao novo evento", () => {
    expect(decideInstanceBinding({ event_id: A, status: "disconnected" }, B)).toBe("rebind");
    expect(decideInstanceBinding({ event_id: A, status: "connecting" }, B)).toBe("rebind");
    expect(decideInstanceBinding({ event_id: null, status: "connecting" }, B)).toBe("rebind");
  });
  it("outro evento em coleta (active/draining) ⇒ ocupado", () => {
    expect(decideInstanceBinding({ event_id: A, status: "active" }, B)).toBe("busy");
    expect(decideInstanceBinding({ event_id: A, status: "draining" }, B)).toBe("busy");
  });
});
