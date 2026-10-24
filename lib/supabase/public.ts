import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

let cached: SupabaseClient<Database> | undefined;

/**
 * Cliente público (anon, sem cookies) para dados que podem ser lidos por
 * qualquer visitante — ex.: depoimentos publicados. Não confundir com o
 * cliente de sessão (lib/supabase/server.ts) nem com o administrativo.
 */
export function getSupabasePublic(): SupabaseClient<Database> {
  if (cached !== undefined) {
    return cached;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url === undefined || url.length === 0 || anonKey === undefined || anonKey.length === 0) {
    throw new Error("Supabase público não configurado (NEXT_PUBLIC_SUPABASE_*).");
  }

  cached = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}
