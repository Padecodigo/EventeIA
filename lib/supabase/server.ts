import "server-only";

import { cookies } from "next/headers";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

import { sessionCookieOptions } from "./session-cookies";
import type { Database } from "./types";

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 * Propaga a sessão via cookies (RLS aplicada ao usuário autenticado).
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url === undefined || url.length === 0 || anonKey === undefined || anonKey.length === 0) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes — configure .env.local",
    );
  }

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            // Cookie de sessão: fechar o navegador desloga (ver session-cookies.ts).
            cookieStore.set(name, value, sessionCookieOptions(options));
          }
        } catch {
          // Server Component não pode gravar cookies; o middleware renova a sessão.
        }
      },
    },
  });
}
