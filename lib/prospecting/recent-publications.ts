import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Janela usada para deslocar assunto/ângulo/paleta conforme o que já saiu. */
const WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Quantas iscas saíram na janela recente.
 * Sem credencial de servidor (testes), devolve 0 e a rotação fica a cargo da semente.
 */
export async function recentPublicationCount(): Promise<number> {
  if (
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").length === 0 ||
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").length === 0
  ) {
    return 0;
  }
  try {
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const db = getSupabaseAdmin();
    const posts = await db
      .from("prospect_posts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since);
    return posts.count ?? 0;
  } catch {
    return 0;
  }
}
