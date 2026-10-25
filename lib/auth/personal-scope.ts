/**
 * Escopo "pessoal" das telas do painel do usuário.
 *
 * Desde a migração 0035 um admin lê TODAS as linhas via RLS (`is_admin()`), então as
 * listagens do painel (/painel, /eventos, notificações) não podem mais depender só do RLS:
 * sem filtro explícito, o admin via os eventos/cotações/notificações de todos os usuários
 * como se fossem dele. Aqui reproduzimos o que o RLS de não-admin já permitia:
 * eventos próprios + eventos dos workspaces de que o usuário é dono/membro.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filtro PostgREST (`.or(...)`) para os eventos do próprio usuário. */
export function personalEventsOrFilter(userId: string, workspaceIds: readonly string[]): string {
  if (!UUID_RE.test(userId)) throw new Error("userId inválido");
  const ids = [...new Set(workspaceIds.filter((id) => UUID_RE.test(id)))];
  const own = `owner_profile_id.eq.${userId}`;
  return ids.length > 0 ? `${own},workspace_id.in.(${ids.join(",")})` : own;
}
