import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const doc = readFileSync(
  join(process.cwd(), "docs/proposals/event-social-lifecycle-migration.md"),
  "utf8",
);

describe("proposta de migração do lifecycle social", () => {
  it("é apenas proposta e não cria coluna de estado em prospecting_posts", () => {
    expect(doc).toContain("NÃO APLICADA");
    expect(doc).not.toContain("prospecting_posts\n  add column if not exists publication");
    expect(doc).not.toContain("prospecting_posts\n  add column if not exists deleted_at");
    expect(doc).not.toContain("merge_prospecting_post_publication");
  });

  it("fixtures usam auth.users/profiles, eventos ativos e trigger real", () => {
    expect(doc).toContain("insert into auth.users");
    expect(doc).toContain("owner_profile_id");
    expect(doc).toContain("set status = 'completed'");
    expect(doc).toContain("where id in (");
    expect(doc).toContain("closed_at is not null");
  });

  it("fixture não usa hash de senha e escopa o closed_at aos 3 eventos", () => {
    expect(doc).not.toContain("crypt(");
    expect(doc).not.toContain("gen_salt(");
    expect(doc).toContain("'a0901111-0000-4000-8000-000000000001'");
    expect(doc).toContain("'trigger de encerramento rodou nos 3 fixtures'");
  });

  it("predicado SQL cobre error legado e o purge preserva refs", () => {
    expect(doc).toContain("p_error text");
    expect(doc).toContain("like 'manual_removal_required:%'");
    expect(doc).toContain("p.image_params->'publication', p.error");
    expect(doc).toContain("p.publication, p.error");
    expect(doc).toContain("create unique index if not exists prospect_posts_reservation_uniq");
    expect(doc).toContain("raise exception");
    expect(doc).toContain("nunca apaga/deduplica");
  });
});
