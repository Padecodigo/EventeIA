import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { personalEventsOrFilter } from "@/lib/auth/personal-scope";

const U = "977013fd-8d1c-4cb5-8390-299666b2fb82";
const W1 = "11111111-1111-4111-8111-111111111111";

describe("personalEventsOrFilter", () => {
  it("sem workspace: só eventos do próprio usuário", () => {
    expect(personalEventsOrFilter(U, [])).toBe(`owner_profile_id.eq.${U}`);
  });
  it("inclui workspaces do usuário (dedup) e ignora ids inválidos", () => {
    expect(personalEventsOrFilter(U, [W1, W1, "x),owner_profile_id.neq.(y"])).toBe(
      `owner_profile_id.eq.${U},workspace_id.in.(${W1})`,
    );
  });
  it("rejeita userId que não é uuid (evita injeção no filtro)", () => {
    expect(() => personalEventsOrFilter("a,b", [])).toThrow();
  });
});

// Regressão: após 0035 (admin lê tudo via RLS) o /painel do admin listava eventos,
// tíquetes, cotações e notificações de TODOS os usuários.
describe("telas pessoais filtram explicitamente pelo usuário", () => {
  const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
  it("/painel", () => {
    const s = src("app/(dashboard)/painel/page.tsx");
    expect(s).toContain("personalEventsFilter(supabase, user.id)");
    expect(s.match(/\.or\(scope\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(s.match(/\.in\("event_id", ownEventIds/g)?.length ?? 0).toBe(2);
  });
  it("/eventos", () => {
    expect(src("app/(dashboard)/eventos/page.tsx")).toContain(".or(scope)");
  });
  it("GET /api/notifications", () => {
    expect(src("app/api/notifications/route.ts")).toContain('.eq("profile_id", auth.user.id)');
  });
  it("sem texto vazio condicional no perfil (hydration #418)", () => {
    expect(src("components/domain/password-form.tsx")).not.toMatch(/: ""\}/);
    expect(src("app/(dashboard)/perfil/page.tsx")).not.toMatch(/: ""\}/);
  });
});
