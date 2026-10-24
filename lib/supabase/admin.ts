import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./types";

let cached: SupabaseClient<Database> | undefined;

/**
 * Cliente administrativo (service_role) — ignora RLS.
 * Uso restrito a webhooks, workers e rotinas administrativas em código de servidor.
 * NUNCA importe este módulo em Client Components.
 */
export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (cached !== undefined) {
    return cached;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (
    url === undefined ||
    url.length === 0 ||
    serviceRoleKey === undefined ||
    serviceRoleKey.length === 0
  ) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY ausente — disponível apenas no servidor. Configure .env.local",
    );
  }

  cached = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}
