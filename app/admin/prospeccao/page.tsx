import { requireAdmin } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { buildPostContent } from "@/lib/prospecting/content";
import { normalizeNeeds, planNeedPosts } from "@/lib/prospecting/plan-needs";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { Card } from "../ui";
import { PublishPostButton } from "./publish-post-button";

export const dynamic = "force-dynamic";

/** Extrai o @handle de um source_url do Instagram; null se não for perfil. */
function handleFromUrl(url: string): string | null {
  const match = /instagram\.com\/([A-Za-z0-9._]+)/i.exec(url);
  return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Prospecção: mostra o plano de posts de isca (lotes + legenda) e permite a um
 * humano aprovar e publicar cada post. O plano é derivado dos fornecedores
 * públicos do Instagram já descobertos.
 */
export default async function ProspeccaoPage() {
  await requireAdmin();
  const env = serverEnv();

  const { data } = await getSupabaseAdmin()
    .from("suppliers")
    .select("name,category,source_url")
    .like("source_url", "https://www.instagram.com/%")
    .limit(300);

  const seen = new Set<string>();
  const suppliers: { handle: string; category: string }[] = [];
  for (const row of data ?? []) {
    const handle = handleFromUrl(row.source_url);
    if (handle === null) continue;
    const key = `${row.category}:${handle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    suppliers.push({ handle, category: row.category });
  }

  const needs = normalizeNeeds(suppliers.map((supplier) => supplier.category));
  const plan = planNeedPosts(needs, suppliers, {
    maxTagsPerPost: env.MAX_TAGS_PER_POST,
    maxPostsPerDay: env.MAX_POSTS_PER_DAY,
  }).map((post) => ({
    ...post,
    ...buildPostContent({
      category: post.category,
      keyword: env.META_PROSPECT_KEYWORD,
      handles: post.handles,
      variant: post.dayIndex,
    }),
  }));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-title-2 text-vinho">Prospecção — posts de isca</h1>
        <p className="mt-1 text-caption text-vinho/70">
          {suppliers.length} fornecedor(es) do Instagram no plano · {plan.length} post(s) sugerido(s) · até{" "}
          {env.MAX_POSTS_PER_DAY} por dia, no máximo {env.MAX_TAGS_PER_POST} marcações por post.
        </p>
      </header>

      {plan.length === 0 ? (
        <Card>
          <p className="text-caption text-vinho/70">
            Nenhum fornecedor público do Instagram disponível. Rode a descoberta primeiro.
          </p>
        </Card>
      ) : (
        plan.map((post, index) => (
          <Card key={`${post.category}-${String(post.dayIndex)}-${String(index)}`}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-2xl">
                <p className="text-caption font-semibold uppercase tracking-wide text-vinho/60">
                  Dia {post.dayIndex + 1} · {post.category} · parte {post.part}/{post.totalParts}
                </p>
                <p className="mt-2 whitespace-pre-line text-body text-vinho">{post.caption}</p>
                <p className="mt-2 text-caption text-vinho/60">
                  {post.handles.length} mençõe(s) · prompt: {post.imagePrompt}
                </p>
              </div>
              <PublishPostButton
                dayIndex={post.dayIndex}
                category={post.category}
                handles={post.handles}
                imagePrompt={post.imagePrompt}
                caption={post.caption}
              />
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
