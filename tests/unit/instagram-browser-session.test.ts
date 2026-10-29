import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let sessionFile = "";

vi.mock("@/lib/env", () => ({
  serverEnv: () => ({ INSTAGRAM_SESSION_FILE: sessionFile }),
}));

import {
  hasInstagramSession,
  loadInstagramSession,
  saveInstagramSession,
  type InstagramStorageState,
} from "@/lib/instagram-browser/session";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "ev-ig-session-"));
  sessionFile = join(dir, "session.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("sessão do Instagram (storageState)", () => {
  it("sem arquivo, devolve null e não tem sessão", async () => {
    expect(await loadInstagramSession()).toBeNull();
    expect(await hasInstagramSession()).toBe(false);
  });

  it("salva e lê a sessão", async () => {
    const state = { cookies: [{ name: "sessionid", value: "x" }], origins: [] } as unknown as InstagramStorageState;
    await saveInstagramSession(state);

    expect(await hasInstagramSession()).toBe(true);
    expect(await loadInstagramSession()).toEqual(state);
  });

  it("arquivo inválido vira null", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(sessionFile, "{ não é json", "utf8");
    expect(await loadInstagramSession()).toBeNull();
  });
});
