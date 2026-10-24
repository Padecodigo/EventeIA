import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** Garante a hierarquia visual: festa infantil primeiro, casamento secundário. */
const source = readFileSync(join(process.cwd(), "app/(marketing)/page.tsx"), "utf8");

describe("landing — ordem das fotos", () => {
  it("festa infantil é a primeira imagem (priority) e casamento vem depois", () => {
    const infantil = source.indexOf('src="/festa-infantil.jpg"');
    const casamento = source.indexOf('src="/EventeIA-wedding.png"');
    expect(infantil).toBeGreaterThan(-1);
    expect(casamento).toBeGreaterThan(infantil);
    expect(source.indexOf("<Image")).toBe(source.lastIndexOf("<Image", infantil));
    expect(source.slice(infantil, infantil + 300)).toContain("priority");
  });
  it("nenhuma imagem anterior à festa infantil", () => {
    const firstSrc = /src="([^"]+)"/.exec(source)?.[1];
    expect(firstSrc).toBe("/festa-infantil.jpg");
  });
});
