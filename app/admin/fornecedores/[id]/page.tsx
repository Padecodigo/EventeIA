import Link from "next/link";
import { notFound } from "next/navigation";

import { isUuid } from "@/lib/admin/search";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { Card, fmtDate } from "../../ui";
import { DeleteSupplier } from "../delete-supplier";

export const dynamic = "force-dynamic";

export default async function AdminFornecedorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const admin = getSupabaseAdmin();
  const { data: s } = await admin.from("suppliers").select("*").eq("id", id).maybeSingle();
  if (!s) notFound();
  const { data: links } = await admin.from("vendor_prospects").select("id,event_id,status,last_message_at,created_at").eq("supplier_id", id).order("created_at", { ascending: false }).limit(100);
  const evIds = [...new Set((links ?? []).map((l) => l.event_id))];
  const { data: evs } = evIds.length ? await admin.from("events").select("id,title,event_date").in("id", evIds) : { data: [] };
  const title = new Map((evs ?? []).map((e) => [e.id, `${e.title} (${fmtDate(e.event_date)})`]));

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-caption"><Link className="underline" href="/admin/fornecedores">← Fornecedores</Link></p>
        <h2 className="font-serif text-title-2">{s.name}</h2>
        {s.deleted_at ? (
          <p className="text-caption text-semantic-error" data-testid="supplier-in-trash">Na Lixeira desde {fmtDate(s.deleted_at)}: fora da busca e dos contatos. Restaure pela <Link className="underline" href="/admin/lixeira">Lixeira</Link>.</p>
        ) : (
          <div className="mt-2"><DeleteSupplier supplierId={s.id} name={s.name} /></div>
        )}
      </header>
      <Card testId="supplier-info">
        <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-caption text-vinho/60">Categoria</dt><dd>{s.category}</dd></div>
          <div><dt className="text-caption text-vinho/60">Cidade</dt><dd>{s.city ?? "—"}</dd></div>
          <div><dt className="text-caption text-vinho/60">Telefone</dt><dd>{s.phone_e164 ?? "—"}</dd></div>
          <div><dt className="text-caption text-vinho/60">Site</dt><dd>{s.website_url && /^https?:\/\//i.test(s.website_url) ? <a className="underline" href={s.website_url} rel="noopener noreferrer nofollow" target="_blank">{s.website_url}</a> : "—"}</dd></div>
          <div><dt className="text-caption text-vinho/60">Origem</dt><dd>{s.source_provider}</dd></div>
          <div><dt className="text-caption text-vinho/60">Visto pela 1ª vez</dt><dd>{fmtDate(s.first_seen_at)}</dd></div>
          <div><dt className="text-caption text-vinho/60">Pediu para sair</dt><dd>{s.opt_out_at ? fmtDate(s.opt_out_at) : "não"}</dd></div>
        </dl>
      </Card>
      <Card testId="supplier-events">
        <h3 className="font-serif text-title-3">Eventos em que foi contatado ({(links ?? []).length})</h3>
        {(links ?? []).length === 0 ? <p className="text-caption text-vinho/70">Nenhum evento.</p> : (
          <ul className="text-sm">{(links ?? []).map((l) => <li key={l.id} className="border-t border-line-subtle py-1"><Link className="underline" href={`/admin/eventos/${l.event_id}`}>{title.get(l.event_id) ?? "evento"}</Link> · {l.status} · {fmtDate(l.last_message_at ?? l.created_at)}</li>)}</ul>
        )}
      </Card>
    </div>
  );
}
