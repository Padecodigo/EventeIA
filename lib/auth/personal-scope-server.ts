import "server-only";

import type { createSupabaseServerClient } from "@/lib/supabase/server";

import { personalEventsOrFilter } from "./personal-scope";

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/** Workspaces de que o usuário é dono ou membro (não todos — admin lê tudo via RLS). */
export async function personalWorkspaceIds(supabase: ServerClient, userId: string): Promise<string[]> {
  const [members, owned] = await Promise.all([
    supabase.from("workspace_members").select("workspace_id").eq("profile_id", userId),
    supabase.from("workspaces").select("id").eq("owner_id", userId),
  ]);
  return [
    ...(members.data ?? []).map((row) => row.workspace_id),
    ...(owned.data ?? []).map((row) => row.id),
  ];
}

export async function personalEventsFilter(supabase: ServerClient, userId: string): Promise<string> {
  return personalEventsOrFilter(userId, await personalWorkspaceIds(supabase, userId));
}
