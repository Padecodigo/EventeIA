import { describe, expect, it } from "vitest";

import { readSeedPasswords } from "../../scripts/seed-demo-env";

describe("readSeedPasswords", () => {
  it("retorna as senhas quando presentes e longas o suficiente", () => {
    const env = {
      DEMO_SEED_PASSWORD: "senha-demo-1234",
      DEMO_SEED_ADMIN_PASSWORD: "senha-admin-1234",
    };
    expect(readSeedPasswords(env)).toEqual({
      demoPassword: "senha-demo-1234",
      adminPassword: "senha-admin-1234",
    });
  });

  it("lança erro quando DEMO_SEED_PASSWORD está ausente", () => {
    expect(() => readSeedPasswords({ DEMO_SEED_ADMIN_PASSWORD: "senha-admin-1234" })).toThrow(
      /DEMO_SEED_PASSWORD/,
    );
  });

  it("lança erro quando DEMO_SEED_ADMIN_PASSWORD está ausente", () => {
    expect(() => readSeedPasswords({ DEMO_SEED_PASSWORD: "senha-demo-1234" })).toThrow(
      /DEMO_SEED_ADMIN_PASSWORD/,
    );
  });

  it("lança erro quando DEMO_SEED_PASSWORD tem menos de 12 caracteres", () => {
    expect(() =>
      readSeedPasswords({
        DEMO_SEED_PASSWORD: "curta",
        DEMO_SEED_ADMIN_PASSWORD: "senha-admin-1234",
      }),
    ).toThrow(/DEMO_SEED_PASSWORD/);
  });

  it("lança erro quando DEMO_SEED_ADMIN_PASSWORD tem menos de 12 caracteres", () => {
    expect(() =>
      readSeedPasswords({
        DEMO_SEED_PASSWORD: "senha-demo-1234",
        DEMO_SEED_ADMIN_PASSWORD: "curta",
      }),
    ).toThrow(/DEMO_SEED_ADMIN_PASSWORD/);
  });

  it("aceita senha com exatamente 12 caracteres", () => {
    expect(
      readSeedPasswords({
        DEMO_SEED_PASSWORD: "123456789012",
        DEMO_SEED_ADMIN_PASSWORD: "abcdefghijkl",
      }),
    ).toEqual({ demoPassword: "123456789012", adminPassword: "abcdefghijkl" });
  });
});
