/** Skeleton das rotas do painel — aparece instantaneamente na navegação enquanto o servidor busca os dados. */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse motion-reduce:animate-none" aria-busy="true" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div className="h-3 w-24 rounded-full bg-vinho/10" />
      <div className="mt-4 h-10 w-2/3 max-w-md rounded-2xl bg-vinho/10" />
      <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-32 bg-white/70" />
        ))}
      </div>
      <div className="card mt-8 h-64 bg-white/70" />
    </div>
  );
}
