import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { Card, EVENT_STATUS_LABELS, Pill, READ_ONLY_NOTE, SearchBox, fmtDate, likeTerm } from "../ui";

export const dynamic = "force-dynamic";


type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AdminEventosPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = one(sp.q);
  const status = Object.hasOwn(EVENT_STATUS_LABELS, one(sp.status)) ? one(sp.status) : "";
  const admin = getSupabaseAdmin();
  let query = admin.from("events").select("id,title,event_type,event_date,status,city,city_uf,guest_count,owner_profile_id,created_at").order("created_at", { ascending: false }).limit(200);
  const t = likeTerm(q);
  if (t) query = query.ilike("title", t);
  if (status) query = query.eq("status", status as never);
  const { data } = await query;
  const events = data ?? [];
  const ownerIds = [...new Set(events.map((e) => e.owner_profile_id))];
  const { data: owners } = ownerIds.length ? await admin.from("profiles").select("id,display_name").in("id", ownerIds) : { data: [] };
  const ownerName = new Map((owners ?? []).map((o) => [o.id, o.display_name]));
  const href = (s: string) => `/admin/eventos?${new URLSearchParams({ ...(q ? { q } : {}), ...(s ? { status: s } : {}) }).toString()}`;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="font-serif text-title-2">Eventos</h2>
        <p className="text-caption text-vinho/60">Todos os eventos criados pelos clientes (até 200 mais recentes). {READ_ONLY_NOTE}</p>
      </header>
      <Card>
        <SearchBox action="/admin/eventos" q={q} placeholder="Buscar pelo nome do evento" hidden={status ? { status } : undefined} />
        <nav className="mt-3 flex flex-wrap gap-2" aria-label="Filtrar por situação">
          <Pill href={href("")} active={status === ""}>Todos</Pill>
          {Object.entries(EVENT_STATUS_LABELS).map(([k, v]) => <Pill key={k} href={href(k)} active={status === k}>{v}</Pill>)}
        </nav>
      </Card>
      <Card testId="events-list">
        {events.length === 0 ? <p className="text-caption text-vinho/70">Nenhum evento encontrado.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm [&_td]:px-2 [&_td]:py-2 [&_th]:px-2 [&_th]:py-2 [&_th]:font-medium">
              <thead className="text-left text-caption text-vinho/60"><tr><th>Evento</th><th>Data</th><th>Cidade</th><th>Situação</th><th>Cliente</th></tr></thead>
              <tbody>
                {events.map((e) => (
                  <tr key={e.id} className="border-t border-line-subtle">
                    <td className="py-2"><Link className="font-semibold underline" href={`/admin/eventos/${e.id}`}>{e.title}</Link> <span className="text-caption text-vinho/50">{e.event_type}</span></td>
                    <td>{fmtDate(e.event_date)}</td>
                    <td>{e.city ? `${e.city}${e.city_uf ? `/${e.city_uf}` : ""}` : "—"}</td>
                    <td>{EVENT_STATUS_LABELS[e.status] ?? e.status}</td>
                    <td><Link className="underline" href={`/admin/clientes/${e.owner_profile_id}`}>{ownerName.get(e.owner_profile_id) ?? "ver cliente"}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
