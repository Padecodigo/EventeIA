import Link from "next/link";

import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { Card, fmtDate, likeTerm } from "../ui";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function AdminFornecedoresPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const q = one(sp.q);
  const cat = one(sp.categoria).slice(0, 60);
  const city = one(sp.cidade);
  let query = getSupabaseAdmin().from("suppliers").select("id,name,category,city,phone_e164,whatsapp_verified,opt_out_at,last_contacted_at,first_seen_at").is("deleted_at", null).order("last_seen_at", { ascending: false }).limit(200);
  const t = likeTerm(q);
  if (t) query = query.ilike("name", t);
  if (cat) query = query.eq("category", cat);
  const c = likeTerm(city);
  if (c) query = query.ilike("city", c);
  const { data } = await query;
  const rows = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="font-serif text-title-2">Fornecedores</h2>
        <p className="text-caption text-vinho/60">Fornecedores encontrados pela busca automática (até 200 mais recentes). Para tirar um fornecedor da busca e dos contatos, abra-o e use “Excluir fornecedor” (vai para a Lixeira e dá para restaurar).</p>
      </header>
      <Card>
        <form action="/admin/fornecedores" method="get" className="flex flex-wrap gap-2" role="search">
          <input name="q" defaultValue={q} placeholder="Nome do fornecedor" aria-label="Nome do fornecedor" className="min-w-[12rem] flex-1 rounded-input border border-line-subtle bg-white px-3 py-2 text-sm" />
          <input name="categoria" defaultValue={cat} placeholder="Categoria (ex.: buffet)" aria-label="Categoria" className="w-48 rounded-input border border-line-subtle bg-white px-3 py-2 text-sm" />
          <input name="cidade" defaultValue={city} placeholder="Cidade" aria-label="Cidade" className="w-40 rounded-input border border-line-subtle bg-white px-3 py-2 text-sm" />
          <button type="submit" className="rounded-full bg-primaria px-4 py-2 text-sm font-semibold text-white">Filtrar</button>
        </form>
      </Card>
      <Card testId="suppliers-list">
        {rows.length === 0 ? <p className="text-caption text-vinho/70">Nenhum fornecedor encontrado.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-sm [&_td]:px-2 [&_td]:py-2 [&_th]:px-2 [&_th]:py-2 [&_th]:font-medium">
              <thead className="text-left text-caption text-vinho/60"><tr><th>Nome</th><th>Categoria</th><th>Cidade</th><th>WhatsApp</th><th>Último contato</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id} className="border-t border-line-subtle">
                  <td className="py-2"><Link className="font-semibold underline" href={`/admin/fornecedores/${r.id}`}>{r.name}</Link>{r.opt_out_at ? <span className="ml-1 text-caption text-semantic-error">pediu para sair</span> : null}</td>
                  <td><Link className="underline" href={`/admin/fornecedores?categoria=${encodeURIComponent(r.category)}`}>{r.category}</Link></td>
                  <td>{r.city ?? "—"}</td>
                  <td>{r.whatsapp_verified ? "verificado" : r.phone_e164 ? "não verificado" : "sem número"}</td>
                  <td>{fmtDate(r.last_contacted_at)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
