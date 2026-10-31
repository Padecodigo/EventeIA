import { requireAdmin } from "@/lib/auth";

/**
 * Cadastros recentes para o admin (somente leitura) — usado para seguir de volta no Instagram.
 * Lê apenas colunas existentes em profiles/events; e-mail e telefone nunca entram na consulta.
 * `instagram_handle` vem da migração 0064 (campo opcional do perfil).
 */
type Row = Record<string, unknown>;
type Result = { data: Row[] | null; error?: { message: string } | null };

export interface SignupQuery extends PromiseLike<Result> {
  order(column: string, options: { ascending: boolean }): SignupQuery;
  limit(count: number): SignupQuery;
  in(column: string, values: string[]): SignupQuery;
}

export interface SignupDb {
  from(table: "profiles" | "events"): { select(columns: string): SignupQuery };
}

/** Adapta o cliente service-role sem inferir o tipo profundo gerado pelo Supabase. */
export function signupDbFrom(client: { from: unknown }): SignupDb {
  return { from: client.from as SignupDb["from"] };
}

export interface SignupRow {
  id: string;
  displayName: string;
  createdAt: string;
  instagramHandle: string | null;
  latestEvent: { id: string; title: string } | null;
}

const str = (value: unknown): string => (typeof value === "string" ? value : "");

const BRAZIL_DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "short",
});

/** Data/hora do cadastro no fuso de Brasília (ou "—" quando ausente/inválida). */
export function formatSignupDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : BRAZIL_DATE_TIME.format(date);
}

/** Coluna Instagram: aceita o campo opcional (ausente em main) e mostra "—" quando não houver handle. */
export function instagramLabel(handle?: string | null): string {
  const clean = (handle ?? "").trim().replace(/^@+/, "");
  return clean.length > 0 ? `@${clean}` : "—";
}

/** Junta perfis e eventos (mais recente por dono) sem depender da ordem devolvida pelo banco. */
export function buildRecentSignups(profiles: readonly Row[], events: readonly Row[]): SignupRow[] {
  const latest = new Map<string, { id: string; title: string }>();
  const byDate = [...events].sort((a, b) => str(b.created_at).localeCompare(str(a.created_at)));
  for (const event of byDate) {
    const owner = str(event.owner_profile_id);
    if (owner.length === 0 || latest.has(owner)) continue;
    latest.set(owner, { id: str(event.id), title: str(event.title) || "Sem título" });
  }

  return profiles.map((profile) => {
    const id = str(profile.id);
    return {
      id,
      displayName: str(profile.display_name) || "(sem nome)",
      createdAt: str(profile.created_at),
      instagramHandle: typeof profile.instagram_handle === "string" ? profile.instagram_handle : null,
      latestEvent: latest.get(id) ?? null,
    };
  });
}

function rows(result: Result, what: string): Row[] {
  if (result.error) throw new Error(`Falha ao carregar ${what}: ${result.error.message}`);
  return result.data ?? [];
}

/** Últimos 100 cadastros (mais novos primeiro) + evento mais recente de cada perfil. Somente admin. */
export async function loadRecentSignups(db: SignupDb): Promise<SignupRow[]> {
  await requireAdmin();

  const profiles = rows(
    await db.from("profiles").select("id,display_name,instagram_handle,created_at").order("created_at", { ascending: false }).limit(100),
    "cadastros",
  );
  if (profiles.length === 0) return [];

  const ids = profiles.map((profile) => str(profile.id)).filter((id) => id.length > 0);
  if (ids.length === 0) return [];

  const events = rows(
    await db
      .from("events")
      .select("id,owner_profile_id,title,created_at")
      .in("owner_profile_id", ids)
      .order("created_at", { ascending: false }),
    "eventos",
  );

  return buildRecentSignups(profiles, events);
}
