import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { Card, Pill, READ_ONLY_NOTE, SearchBox, fmtDate, likeTerm } from "../ui";

export const dynamic = "force-dynamic";

const ROLES: Record<string, string> = { b2c: "Pessoa física", b2b: "Empresa", admin: "Admin" };
type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AdminClientesPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = one(sp.q);
  const role = Object.hasOwn(ROLES, one(sp.tipo)) ? one(sp.tipo) : "";
  let query = getSupabaseAdmin().from("profiles").select("id,display_name,email,phone_e164,role,created_at").order("created_at", { ascending: false }).limit(200);
  const t = likeTerm(q);
  // likeTerm remove vírgulas/parênteses: seguro dentro de or().
  if (t) query = query.or(`display_name.ilike.${t},email.ilike.${t}`);
  if (role) query = query.eq("role", role as never);
  const { data } = await query;
  const rows = data ?? [];
  const href = (r: string) => `/admin/clientes?${new URLSearchParams({ ...(q ? { q } : {}), ...(r ? { tipo: r } : {}) }).toString()}`;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="font-serif text-title-2">Clientes</h2>
        <p className="text-caption text-vinho/60">Contas cadastradas (até 200 mais recentes). {READ_ONLY_NOTE}</p>
      </header>
      <Card>
        <SearchBox action="/admin/clientes" q={q} placeholder="Buscar por nome ou e-mail" hidden={role ? { tipo: role } : undefined} />
        <nav className="mt-3 flex flex-wrap gap-2" aria-label="Filtrar por tipo">
          <Pill href={href("")} active={role === ""}>Todos</Pill>
          {Object.entries(ROLES).map(([k, v]) => <Pill key={k} href={href(k)} active={role === k}>{v}</Pill>)}
        </nav>
      </Card>
      <Card testId="clients-list">
        {rows.length === 0 ? <p className="text-caption text-vinho/70">Nenhum cliente encontrado.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm [&_td]:px-2 [&_td]:py-2 [&_th]:px-2 [&_th]:py-2 [&_th]:font-medium">
              <thead className="text-left text-caption text-vinho/60"><tr><th>Nome</th><th>E-mail</th><th>Tipo</th><th>Desde</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id} className="border-t border-line-subtle">
                  <td className="py-2"><Link className="font-semibold underline" href={`/admin/clientes/${r.id}`}>{r.display_name || "(sem nome)"}</Link></td>
                  <td>{r.email ?? "—"}</td><td>{ROLES[r.role] ?? r.role}</td><td>{fmtDate(r.created_at)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
