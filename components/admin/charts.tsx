import { donutSlices, polylinePoints, type DayPoint, type EventMargin, type Funnel } from "@/lib/finance/analytics";
import { formatBRL } from "@/lib/money";

/* Gráficos em SVG/CSS puros, renderizados no servidor (sem JS no cliente, sem dependências). */

const card = "rounded-card border border-line-subtle bg-off-white p-5 shadow-soft";
const empty = <p className="mt-3 text-caption text-vinho/70">Sem dados no período.</p>;

export function RevenueCostLine({ points }: { points: DayPoint[] }) {
  const W = 560;
  const H = 180;
  const max = Math.max(1, ...points.flatMap((p) => [p.revenueCents, p.costCents]));
  const rev = polylinePoints(points.map((p) => p.revenueCents), W, H, max);
  const cost = polylinePoints(points.map((p) => p.costCents), W, H, max);
  const totalRev = points.reduce((s, p) => s + p.revenueCents, 0);
  const totalCost = points.reduce((s, p) => s + p.costCents, 0);
  return (
    <section className={`${card} lg:col-span-2`}>
      <h3 className="font-serif text-title-3">Receita × custo por dia</h3>
      {points.length === 0 ? empty : (
        <figure className="mt-3">
          <svg viewBox={`-4 -4 ${String(W + 8)} ${String(H + 8)}`} className="h-48 w-full" role="img" aria-label={`Receita líquida ${formatBRL(totalRev)} e custo ${formatBRL(totalCost)} entre ${points[0]?.day ?? ""} e ${points.at(-1)?.day ?? ""}`}>
            {[0.25, 0.5, 0.75].map((f) => (
              <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} className="stroke-vinho/10" strokeWidth={1} />
            ))}
            <line x1={0} x2={W} y1={H} y2={H} className="stroke-vinho/30" strokeWidth={1} />
            <polyline points={rev} fill="none" className="stroke-primaria" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
            <polyline points={cost} fill="none" className="stroke-vinho/60" strokeWidth={2} strokeDasharray="6 4" strokeLinejoin="round" />
          </svg>
          <figcaption className="mt-2 flex flex-wrap justify-between gap-3 text-caption text-vinho/80">
            <span><span aria-hidden="true" className="mr-1 inline-block h-1 w-4 rounded bg-primaria align-middle" />Receita líquida {formatBRL(totalRev)}</span>
            <span><span aria-hidden="true" className="mr-1 inline-block h-1 w-4 rounded bg-vinho/60 align-middle" />Custo {formatBRL(totalCost)}</span>
            <span className="tabular-nums">{points[0]?.day} → {points.at(-1)?.day} · pico {formatBRL(max)}</span>
          </figcaption>
        </figure>
      )}
    </section>
  );
}

const SLICE_CLASSES = ["stroke-primaria", "stroke-champagne", "stroke-vinho", "stroke-primaria-escura", "stroke-dourado", "stroke-vinho/40"] as const;
const SWATCH_CLASSES = ["bg-primaria", "bg-champagne", "bg-vinho", "bg-primaria-escura", "bg-dourado", "bg-vinho/40"] as const;

export function CostDonut({ rows, label }: { rows: [string, number][]; label: (k: string) => string }) {
  const R = 60;
  const C = 2 * Math.PI * R;
  const slices = donutSlices(rows, C);
  const total = slices.reduce((s, x) => s + x.value, 0);
  return (
    <section className={card}>
      <h3 className="font-serif text-title-3">Custo por provedor</h3>
      {slices.length === 0 ? empty : (
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <svg viewBox="0 0 160 160" className="h-36 w-36 shrink-0 -rotate-90" role="img" aria-label={`Custo total ${formatBRL(total)} por provedor`}>
            <circle cx={80} cy={80} r={R} fill="none" className="stroke-areia-secundaria" strokeWidth={22} />
            {slices.map((s, i) => (
              <circle key={s.key} cx={80} cy={80} r={R} fill="none" className={SLICE_CLASSES[i % SLICE_CLASSES.length]} strokeWidth={22} strokeDasharray={s.dash} strokeDashoffset={s.offset} />
            ))}
          </svg>
          <ul className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            {slices.map((s, i) => (
              <li key={s.key} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className={`h-3 w-3 shrink-0 rounded-full ${SWATCH_CLASSES[i % SWATCH_CLASSES.length] ?? ""}`} /><span className="truncate">{s.key === "Outros" ? "Outros" : label(s.key)}</span></span>
                <span className="tabular-nums">{(s.fraction * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function MarginByEvent({ rows, label }: { rows: EventMargin[]; label: (id: string) => string }) {
  const list = rows.slice(0, 10);
  const max = Math.max(1, ...list.map((r) => Math.abs(r.marginCents)));
  return (
    <section className={card}>
      <h3 className="font-serif text-title-3">Margem por evento</h3>
      <p className="text-caption text-vinho/70">Piores margens primeiro.</p>
      {list.length === 0 ? empty : (
        <ul className="mt-3 flex flex-col gap-2">
          {list.map((r) => {
            const pct = Math.max(2, Math.round((Math.abs(r.marginCents) / max) * 50));
            const neg = r.marginCents < 0;
            return (
              <li key={r.eventId} className="text-sm">
                <div className="flex justify-between gap-2">
                  <span className="truncate">{label(r.eventId)}</span>
                  <span className={`tabular-nums ${neg ? "text-semantic-error" : ""}`}>{formatBRL(r.marginCents)}</span>
                </div>
                <div className="relative mt-1 h-2 rounded-full bg-areia-secundaria" aria-hidden="true">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-vinho/30" />
                  <div className={`absolute inset-y-0 rounded-full ${neg ? "bg-semantic-error" : "bg-primaria"}`} style={neg ? { right: "50%", width: `${String(pct)}%` } : { left: "50%", width: `${String(pct)}%` }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function CountBars({ title, rows, label = (k: string) => k }: { title: string; rows: [string, number][]; label?: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <section className={card}>
      <h3 className="font-serif text-title-3">{title}</h3>
      {rows.length === 0 ? empty : (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.slice(0, 10).map(([k, v]) => (
            <li key={k} className="text-sm">
              <div className="flex justify-between gap-2"><span className="truncate">{label(k)}</span><span className="tabular-nums">{v}</span></div>
              <div className="mt-1 h-2 rounded-full bg-areia-secundaria" aria-hidden="true">
                <div className="h-2 rounded-full bg-champagne" style={{ width: `${String(Math.max(2, Math.round((v / max) * 100)))}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function FunnelChart({ funnel }: { funnel: Funnel }) {
  const steps = [
    { label: "Criados", value: funnel.created },
    { label: "Pagos", value: funnel.paid },
    { label: "Entregues", value: funnel.delivered },
  ];
  const max = Math.max(1, funnel.created);
  return (
    <section className={card}>
      <h3 className="font-serif text-title-3">Funil de eventos</h3>
      <ol className="mt-3 flex flex-col gap-3">
        {steps.map((s, i) => {
          const prev = i > 0 ? steps[i - 1].value : null;
          const conv = prev ? `${Math.round((s.value / prev) * 100)}% da etapa anterior` : "";
          return (
            <li key={s.label}>
              <div className="flex justify-between text-sm"><span>{s.label}</span><span className="tabular-nums">{s.value}</span></div>
              <div className="mx-auto mt-1 h-6 rounded-md bg-primaria" style={{ width: `${String(Math.max(4, Math.round((s.value / max) * 100)))}%`, opacity: 1 - i * 0.2 }} aria-hidden="true" />
              {conv ? <p className="mt-0.5 text-caption text-vinho/70">{conv}</p> : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
