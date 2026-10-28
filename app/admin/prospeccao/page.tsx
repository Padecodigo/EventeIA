import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { EVENT_TYPE_LABELS } from "@/lib/catalog/v1";
import { getDeepSeekClient } from "@/lib/deepseek/client";
import { serverEnv } from "@/lib/env";
import { buildPostContent } from "@/lib/prospecting/content";
import { generatePlanContent, type PlanContentEvent } from "@/lib/prospecting/content-llm";
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
 * Prospecção: plano de posts por NECESSIDADE.
 * Sem `?evento=`: necessidades = categorias do acervo de fornecedores.
 * Com `?evento=<id>`: necessidades = categorias da entrevista do evento e a LLM
 * escreve o prompt visual + a legenda de cada post.
 */
export default async function ProspeccaoPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string | string[] }>;
}) {
  await requireAdmin();
  const env = serverEnv();
  const rawEvento = (await searchParams).evento;
  const eventId = typeof rawEvento === "string" && rawEvento.length > 0 ? rawEvento : undefined;
  const admin = getSupabaseAdmin();

  const [suppliersResult, eventsResult] = await Promise.all([
    admin
      .from("suppliers")
      .select("name,category,source_url")
      .like("source_url", "https://www.instagram.com/%")
      .limit(300),
    admin.from("events").select("id,title,event_type,guest_count").order("created_at", { ascending: false }).limit(20),
  ]);

  const seen = new Set<string>();
  let suppliers: { handle: string; category: string }[] = [];
  for (const row of suppliersResult.data ?? []) {
    const handle = handleFromUrl(row.source_url);
    if (handle === null) continue;
    const key = `${row.category}:${handle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    suppliers.push({ handle, category: row.category });
  }

  let needs: string[];
  let eventInfo: PlanContentEvent | null = null;
  if (eventId !== undefined) {
    const { data: requirements } = await admin
      .from("event_requirements")
      .select("category")
      .eq("event_id", eventId)
      .eq("selected", true);
    needs = normalizeNeeds((requirements ?? []).map((row) => row.category));

    const selected = eventsResult.data?.find((event) => event.id === eventId) ?? null;
    if (selected !== null) {
      eventInfo = {
        title: selected.title,
        typeLabel: EVENT_TYPE_LABELS[selected.event_type as keyof typeof EVENT_TYPE_LABELS] ?? selected.event_type,
        guestCount: selected.guest_count,
      };
    }
    const needSet = new Set(needs);
    suppliers = suppliers.filter((supplier) => needSet.has(supplier.category));
  } else {
    needs = normalizeNeeds(suppliers.map((supplier) => supplier.category));
  }

  const posts = planNeedPosts(needs, suppliers, {
    maxTagsPerPost: env.MAX_TAGS_PER_POST,
    maxPostsPerDay: env.MAX_POSTS_PER_DAY,
  });

  const llmContent =
    eventInfo !== null && posts.length > 0
      ? await generatePlanContent(
          {
            event: eventInfo,
            posts: posts.map((post, index) => ({ ...post, index })),
            keyword: env.META_PROSPECT_KEYWORD,
          },
          getDeepSeekClient(),
        )
      : null;

  const plan = posts.map((post, index) => {
    const generated = llmContent?.find((item) => item.index === index);
    const template = buildPostContent({
      category: post.category,
      guestCount: eventInfo?.guestCount,
      keyword: env.META_PROSPECT_KEYWORD,
      handles: post.handles,
      variant: post.dayIndex,
    });
    return {
      ...post,
      imagePrompt: generated?.imagePrompt ?? template.imagePrompt,
      caption: generated?.caption ?? template.caption,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-serif text-title-2 text-vinho">Prospecção — posts de isca</h1>
        <p className="mt-1 text-caption text-vinho/70">
          {suppliers.length} fornecedor(es) no plano · {plan.length} post(s) sugerido(s) · até{" "}
          {env.MAX_POSTS_PER_DAY} por dia, no máximo {env.MAX_TAGS_PER_POST} marcações por post.
          {eventInfo !== null ? ` · Evento: ${eventInfo.title}` : ""}
        </p>
      </header>

      <nav className="flex flex-wrap gap-2 text-caption" aria-label="Escolher evento">
        <Link
          href="/admin/prospeccao"
          className={`rounded-full border px-3 py-1.5 ${eventId === undefined ? "border-vinho bg-vinho text-off-white" : "border-line-strong text-vinho"}`}
        >
          Acervo geral
        </Link>
        {(eventsResult.data ?? []).map((event) => (
          <Link
            key={event.id}
            href={`/admin/prospeccao?evento=${event.id}`}
            className={`rounded-full border px-3 py-1.5 ${eventId === event.id ? "border-vinho bg-vinho text-off-white" : "border-line-strong text-vinho"}`}
          >
            {event.title}
          </Link>
        ))}
      </nav>

      {plan.length === 0 ? (
        <Card>
          <p className="text-caption text-vinho/70">
            {eventId !== undefined
              ? "Este evento não tem necessidades com fornecedores do Instagram no acervo."
              : "Nenhum fornecedor público do Instagram disponível. Rode a descoberta primeiro."}
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
                eventId={eventId}
              />
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
