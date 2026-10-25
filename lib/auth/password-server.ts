import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { resolveHasPassword, userHasPassword } from "./password";

type User = Parameters<typeof userHasPassword>[0] & { id: string };

/** Senha de verdade no banco (0038); se a consulta falhar, cai na heurística. */
export async function accountHasPassword(user: User | null | undefined): Promise<boolean> {
  if (!user) return false;
  try {
    const { data, error } = await getSupabaseAdmin().rpc("auth_user_has_password", {
      p_user_id: user.id,
    });
    return resolveHasPassword(error === null ? data : null, user);
  } catch {
    return userHasPassword(user);
  }
}
