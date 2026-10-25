import Link from "next/link";

import { searchAdmin, type SearchDb, type SearchHit } from "@/lib/admin/search";
import { requireAdmin } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

import { Card, SearchBox } from "../ui";

export const dynamic = "force-dynamic";

const GROUPS: { kind: SearchHit["kind"]; label: string }[] = [
  { kind: "cliente", label: "Clientes" },
  { kind: "evento", label: "Eventos" },
  { kind: "chamado", label: "Chamados" },
  { kind: "fornecedor", label: "Fornecedores" },
];

export default async function AdminBuscaPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await requireAdmin();
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  // Tipagem genérica do PostgREST é profunda demais; a interface mínima basta aqui.
  const db = getSupabaseAdmin() as unknown as SearchDb;
  const hits = await searchAdmin(db, q);
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="font-serif text-title-2">Busca geral</h2>
        <p className="text-caption text-vinho/60">Procura em clientes (nome ou e-mail), eventos, chamados (assunto) e fornecedores. Também aceita o código completo (ID).</p>
      </header>
      <Card><SearchBox action="/admin/busca" q={q} placeholder="Digite pelo menos 2 letras" /></Card>
      {q.trim().length >= 2 && hits.length === 0 ? <Card><p className="text-caption text-vinho/70">Nada encontrado para “{q}”.</p></Card> : null}
      {GROUPS.map((g) => {
        const list = hits.filter((h) => h.kind === g.kind);
        if (list.length === 0) return null;
        return (
          <Card key={g.kind} testId={`busca-${g.kind}`}>
            <h3 className="font-serif text-title-3">{g.label} ({list.length})</h3>
            <ul className="text-sm">{list.map((h) => <li key={h.id} className="border-t border-line-subtle py-1"><Link className="font-semibold underline" href={h.href}>{h.title}</Link> <span className="text-caption text-vinho/60">{h.subtitle}</span></li>)}</ul>
          </Card>
        );
      })}
    </div>
  );
}
