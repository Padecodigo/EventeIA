import { describe, expect, it } from "vitest";

import { decideBrowserPublishJob } from "@/lib/jobs/browser-publish-refusal";

describe("worker de publicação pelo navegador", () => {
  it("recusa qualquer job legado sem tocar na fila/API", () => {
    expect(decideBrowserPublishJob()).toEqual({
      kind: "refused",
      reason: "publicação pelo navegador desativada: exige Graph API e claim in_flight",
    });
  });
});
