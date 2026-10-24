import { getSupabaseAdmin } from "@/lib/supabase/admin";

import {
  approveTestimonialAction,
  rejectTestimonialAction,
  unpublishTestimonialAction,
} from "./actions";

export const metadata = {
  title: "Moderação de depoimentos",
  robots: { index: false, follow: false },
};

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Rejeitado",
};

function statusClasses(status: string, published: boolean): string {
  if (published) {
    return "bg-vinho text-off-white";
  }
  if (status === "approved") {
    return "bg-champagne-claro/70 text-vinho";
  }
  if (status === "rejected") {
    return "bg-semantic-error/10 text-semantic-error";
  }
  return "bg-areia-secundaria text-vinho/75";
}

export default async function AdminTestimonialsPage() {
  const admin = getSupabaseAdmin();

  const { data, error } = await admin
    .from("testimonials")
    .select(
      "id,author_name,city,event_context,audience,quote,outcome,consent_text_version,consent_at,status,published,published_at,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const items = data ?? [];
  const pendingCount = items.filter((item) => item.status === "pending").length;
  const publishedCount = items.filter((item) => item.published).length;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="eyebrow">Admin</p>
        <h1 className="mt-3 font-serif text-display-2 font-display">Moderação de depoimentos.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-vinho/75">
          Revise o texto e o consentimento antes de publicar. Aprovar publica imediatamente na home e
          em <code className="rounded bg-areia-secundaria px-1.5 py-0.5">/para-planners</code> —
          despublicar remove na hora.
        </p>
        <div className="mt-5 flex flex-wrap gap-3 text-caption">
          <span className="rounded-full bg-areia-secundaria px-3 py-1 text-vinho/75">
            {pendingCount} pendente(s)
          </span>
          <span className="rounded-full bg-vinho px-3 py-1 text-off-white">
            {publishedCount} publicado(s)
          </span>
          <span className="rounded-full bg-areia-secundaria px-3 py-1 text-vinho/75">
            {items.length} no total
          </span>
        </div>
      </header>

      {error !== null ? (
        <p className="rounded-xl bg-semantic-error/10 px-4 py-3 text-sm text-semantic-error">
          Não foi possível carregar os depoimentos: {error.message}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className="rounded-card border border-dashed border-line-strong bg-off-white p-10 text-center text-sm text-vinho/70">
          Nenhum depoimento recebido ainda. Os convites são enviados automaticamente pelo WhatsApp um
          dia após o evento (quando há consentimento).
        </p>
      ) : (
        <ul className="flex flex-col gap-5">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-card border border-line-subtle bg-off-white p-6 shadow-soft"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-pill px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${statusClasses(item.status, item.published)}`}
                  >
                    {item.published ? "Publicado" : (statusLabels[item.status] ?? item.status)}
                  </span>
                  <span className="text-caption text-vinho/60">
                    {item.audience === "b2b" ? "Planner" : "Anfitrião"} ·{" "}
                    {new Date(item.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </div>
                <span className="text-caption text-vinho/50">
                  consentimento {item.consent_text_version} em{" "}
                  {new Date(item.consent_at).toLocaleDateString("pt-BR")}
                </span>
              </div>

              <p className="mt-4 font-serif text-xl leading-snug text-vinho">“{item.quote}”</p>

              <p className="mt-3 text-sm font-semibold text-vinho">{item.author_name}</p>
              <p className="text-caption text-vinho/60">
                {item.city !== null && item.city.length > 0 ? `${item.city} · ` : ""}
                {item.event_context ?? "Evento na EventeIA"}
                {item.outcome !== null && item.outcome.length > 0 ? ` · ${item.outcome}` : ""}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                {!item.published ? (
                  <form action={approveTestimonialAction}>
                    <input type="hidden" name="testimonialId" value={item.id} />
                    <button
                      type="submit"
                      className="rounded-full bg-primaria px-4 py-2 text-sm font-semibold text-white transition hover:bg-primaria-escura"
                    >
                      Aprovar e publicar
                    </button>
                  </form>
                ) : (
                  <form action={unpublishTestimonialAction}>
                    <input type="hidden" name="testimonialId" value={item.id} />
                    <button
                      type="submit"
                      className="rounded-full border border-line-strong px-4 py-2 text-sm font-medium text-vinho/80 transition hover:bg-areia-quente"
                    >
                      Despublicar
                    </button>
                  </form>
                )}

                {item.status !== "rejected" ? (
                  <form action={rejectTestimonialAction}>
                    <input type="hidden" name="testimonialId" value={item.id} />
                    <button
                      type="submit"
                      className="rounded-full border border-semantic-error/30 px-4 py-2 text-sm font-medium text-semantic-error transition hover:bg-semantic-error/5"
                    >
                      Rejeitar
                    </button>
                  </form>
                ) : (
                  <span className="text-caption text-vinho/50">
                    Rejeitado — não aparece no site.
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
