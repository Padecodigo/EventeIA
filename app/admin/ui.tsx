import Link from "next/link";

import { cleanQuery } from "@/lib/admin/search";

/** Peças visuais compartilhadas das telas somente leitura do admin. */
export function Card({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <section className="rounded-card border border-line-subtle bg-off-white p-5 shadow-soft" data-testid={testId}>
      {children}
    </section>
  );
}

export function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-current={active ? "true" : undefined}
      className={`rounded-full border px-3 py-1 text-sm ${active ? "border-primaria bg-primaria text-white" : "border-line-subtle"}`}>
      {children}
    </Link>
  );
}

export function SearchBox({ action, q, placeholder, hidden }: { action: string; q: string; placeholder: string; hidden?: Record<string, string> }) {
  return (
    <form action={action} method="get" className="flex flex-wrap gap-2" role="search">
      {Object.entries(hidden ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input name="q" defaultValue={q} placeholder={placeholder} aria-label={placeholder}
        className="min-w-[16rem] flex-1 rounded-input border border-line-subtle bg-white px-3 py-2 text-sm" />
      <button type="submit" className="rounded-full bg-primaria px-4 py-2 text-sm font-semibold text-white">Buscar</button>
    </form>
  );
}

export const READ_ONLY_NOTE = "Somente leitura: aqui não dá para editar nem excluir.";

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${d[2]}/${d[1]}/${d[0]}` : iso;
}

/** Texto para filtro ilike seguro (sem curingas/sintaxe PostgREST). */
export function likeTerm(q: string): string | null {
  const s = cleanQuery(q);
  return s === null ? null : `%${s}%`;
}

export const EVENT_STATUS_LABELS: Record<string, string> = {
  draft: "Rascunho",
  awaiting_payment: "Aguardando pagamento",
  active: "Ativo",
  completed: "Concluído",
  canceled: "Cancelado",
};
