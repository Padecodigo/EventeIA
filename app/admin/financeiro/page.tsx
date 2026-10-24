import Link from "next/link";

import { CostDonut, CountBars, FunnelChart, MarginByEvent, RevenueCostLine } from "@/components/admin/charts";
import { EVENT_TYPE_LABELS } from "@/lib/catalog/v1";
import { eventFunnel, eventsByCity, eventsByType, marginByEvent, revenueCostSeries } from "@/lib/finance/analytics";
import { loadEventStats, loadFinance, PROVIDER_LABELS } from "@/lib/finance/load";
import { DEFAULT_FINANCE_PRICES, PRICE_KEYS } from "@/lib/finance/pricing";
import { buildReport, resolvePeriod } from "@/lib/finance/report";
import { formatBRL } from "@/lib/money";

import { FinanceForms } from "./forms";

export const metadata = { title: "Financeiro" };
export const dynamic = "force-dynamic";

const REASON_LABELS: Record<string, string> = {
  discovery: "Descoberta",
  discovery_search: "Descoberta (busca)",
  extraction: "Extração de cotação",
  quotation_extraction: "Extração de cotação",
  first_reply: "1ª resposta",
  first_reply_parsing: "1ª resposta",
  hidden_fees: "Taxas ocultas",
  hidden_fee_scan: "Taxas ocultas",
  followup: "Follow-up",
  optout_intent: "Opt-out",
  classification: "Classificação",
  negotiation: "Negociação",
  fixed_monthly: "Custo fixo mensal",
};

function Bars({ title, rows, label = (k: string) => k }: { title: string; rows: [string, number][]; label?: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r[1])));
  return (
    <section className="rounded-card border border-line-subtle bg-off-white p-5 shadow-soft">
      <h3 className="font-serif text-title-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-caption text-vinho/70">Sem dados no período.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.slice(0, 12).map(([k, v]) => (
            <li key={k} className="text-sm">
              <div className="flex justify-between gap-2">
                <span className="truncate">{label(k)}</span>
                <span className="tabular-nums">{formatBRL(v)}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-areia-quente">
                <div className="h-2 rounded-full bg-primaria" style={{ width: `${String(Math.max(2, Math.round((Math.abs(v) / max) * 100)))}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="rounded-card border border-line-subtle bg-off-white p-5 shadow-soft">
      <p className="text-caption text-vinho/70">{label}</p>
      <p className="mt-1 font-serif text-title-1 tabular-nums">{value}</p>
      {hint ? <p className="text-caption text-vinho/70">{hint}</p> : null}
    </article>
  );
}

export default async function FinancePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const period = resolvePeriod(sp.from, sp.to);
  const [data, stats] = await Promise.all([loadFinance(period), loadEventStats(period)]);
  const r = buildReport(data.costs, data.revenue);
  const qs = `from=${period.from}&to=${period.to}`;
  const eventLabel = (id: string) => data.eventTitles[id] ?? `evento ${id.slice(0, 8)}`;
  const reason = (k: string) => REASON_LABELS[k] ?? k;
  const provider = (k: string) => PROVIDER_LABELS[k] ?? k;
  const eventType = (k: string) => (EVENT_TYPE_LABELS as Record<string, string>)[k] ?? k;
  const usd = (micro: number) => `US$ ${(micro / 1_000_000).toFixed(4)}`;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-overline uppercase tracking-[0.14em] text-vinho/70">Administração</p>
          <h1 className="font-serif text-display-2">Financeiro</h1>
          <p className="text-sm text-vinho/70">Quanto gastou, onde, por quê — e quanto entrou, de quem.</p>
        </div>
        <form className="flex flex-wrap items-end gap-2" method="get">
          <label className="text-caption">De<input type="date" name="from" defaultValue={period.from} className="ml-1 rounded-full border border-line-subtle bg-off-white px-3 py-2 text-sm" /></label>
          <label className="text-caption">Até<input type="date" name="to" defaultValue={period.to} className="ml-1 rounded-full border border-line-subtle bg-off-white px-3 py-2 text-sm" /></label>
          <button className="rounded-full bg-vinho px-4 py-2 text-sm font-semibold text-off-white">Filtrar</button>
          <Link href={`/admin/financeiro/csv?${qs}`} className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold" prefetch={false}>Exportar CSV</Link>
        </form>
      </header>

      {data.truncated ? <p role="alert" className="text-caption text-semantic-error">Período muito grande: lista limitada a 20 mil linhas por fonte. Reduza o intervalo.</p> : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Receita líquida" value={formatBRL(r.netCents)} hint={`Bruto ${formatBRL(r.grossCents)} · taxas Asaas ${formatBRL(r.feeCents)}`} />
        <Card label="Custos totais" value={formatBRL(r.costBrlCents)} hint={`Variável ${formatBRL(r.variableBrlCents)} · fixo ${formatBRL(r.fixedBrlCents)} · ${usd(r.costMicroUsd)}`} />
        <Card label="Lucro" value={formatBRL(r.profitCents)} hint={r.marginBps === null ? "Sem receita no período" : `Margem ${(r.marginBps / 100).toFixed(1)}%`} />
        <Card label="Custo médio por evento" value={formatBRL(r.avgCostPerEventCents)} hint={`${String(r.eventsWithCost)} eventos · ${String(r.paymentsCount)} pagamentos · estornos ${formatBRL(r.refundedCents)}`} />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <RevenueCostLine points={revenueCostSeries(r.revenueByDay, r.costByDay)} />
        <CostDonut rows={r.byProvider} label={provider} />
        <MarginByEvent rows={marginByEvent(data.costs, data.revenue)} label={eventLabel} />
        <FunnelChart funnel={eventFunnel(stats.events, stats.paidEventIds)} />
        <CountBars title="Eventos por tipo" rows={eventsByType(stats.events)} label={eventType} />
        <CountBars title="Eventos por cidade" rows={eventsByCity(stats.events)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Bars title="Gasto por provedor" rows={r.byProvider} label={provider} />
        <Bars title="Gasto por motivo" rows={r.byReason} label={reason} />
        <Bars title="Eventos mais caros" rows={r.byEvent} label={eventLabel} />
        <Bars title="Gasto por dia" rows={r.costByDay} />
        <Bars title="Receita por cliente" rows={r.revenueByClient} />
        <Bars title="Receita por plano" rows={r.revenueByPlan} />
        <Bars title="Receita por dia" rows={r.revenueByDay} />
      </div>

      <section>
        <h2 className="font-serif text-title-1">Lançamentos</h2>
        <div className="mt-3"><FinanceForms month={period.to.slice(0, 7)} today={period.to} /></div>
        <p className="mt-2 text-caption text-vinho/70">
          Preços padrão (US$/1M tokens; Search/Fetch por 1000 req.):{" "}
          {PRICE_KEYS.map((k) => `${k} ${(DEFAULT_FINANCE_PRICES[k] / 1_000_000).toString()}`).join(" · ")}. Pico DeepSeek: seg–sex 01–04 e 06–10 UTC.
        </p>
      </section>

      <section>
        <h2 className="font-serif text-title-1">Detalhamento</h2>
        <div className="mt-3 overflow-x-auto rounded-card border border-line-subtle bg-off-white">
          <table className="w-full text-sm">
            <thead className="bg-areia-quente/60 text-left">
              <tr><th className="px-3 py-2">Data (UTC)</th><th>Tipo</th><th>Provedor/Plano</th><th>Motivo/Cliente</th><th>Evento</th><th>Detalhe</th><th className="px-3 text-right">Valor</th></tr>
            </thead>
            <tbody>
              {[
                ...data.costs.slice(0, 200).map((c, i) => (
                  <tr key={`c${String(i)}`} className="border-t border-line-subtle/60">
                    <td className="px-3 py-1.5 tabular-nums">{c.at.slice(0, 16).replace("T", " ")}</td><td>Custo</td><td>{provider(c.provider)}</td><td>{reason(c.reason)}</td>
                    <td>{c.eventId ? eventLabel(c.eventId) : "—"}</td><td className="text-caption text-vinho/70">{c.detail}{c.inputTokens + c.outputTokens > 0 ? ` · ${String(c.inputTokens)}/${String(c.outputTokens)} tok` : ""}</td>
                    <td className="px-3 text-right tabular-nums text-semantic-error">−{formatBRL(c.costBrlCents)}</td>
                  </tr>
                )),
                ...data.revenue.slice(0, 200).map((p) => (
                  <tr key={p.paymentId} className="border-t border-line-subtle/60">
                    <td className="px-3 py-1.5 tabular-nums">{p.at.slice(0, 16).replace("T", " ")}</td><td>Receita</td><td>{p.plan}</td><td>{p.clientLabel}</td>
                    <td>{p.eventId ? eventLabel(p.eventId) : "—"}</td><td className="text-caption text-vinho/70">{p.status}{p.refunded ? " · estornado" : ""} · taxa {formatBRL(p.feeCents)}</td>
                    <td className="px-3 text-right tabular-nums">{formatBRL(p.netCents)}</td>
                  </tr>
                )),
              ]}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-caption text-vinho/70">Tabela mostra até 200 linhas de cada tipo; o CSV traz tudo.</p>
      </section>
    </div>
  );
}
