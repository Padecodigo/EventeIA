import Link from "next/link";

import { evaluateBalance } from "@/lib/finance/balances";
import { buildCostsPanel, lastMonths } from "@/lib/finance/costs-panel";
import { buildEventCosts, parseEventCostSort, type EventCostSort } from "@/lib/finance/event-costs";
import { loadFinance, PROVIDER_LABELS } from "@/lib/finance/load";
import { formatBRL } from "@/lib/money";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { BalanceForm, CheckNowButton, ConfirmDelete, FixedCostEdit } from "./forms";

export const metadata = { title: "Custos" };
export const dynamic = "force-dynamic";

const label = (p: string) => PROVIDER_LABELS[p] ?? p;
const pct = (bps: number | null) => (bps === null ? "—" : `${(bps / 100).toFixed(1)}%`);

function Card({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-card border border-line-subtle bg-off-white p-5 shadow-soft">
      <p className="text-caption uppercase tracking-wide text-vinho/60">{title}</p>
      <p className="mt-1 font-serif text-title-2 tabular-nums">{value}</p>
      {hint ? <p className="text-caption text-vinho/60">{hint}</p> : null}
    </div>
  );
}

function ProviderList({ title, rows, total }: { title: string; rows: [string, number][]; total: number }) {
  return (
    <section className="rounded-card border border-line-subtle bg-off-white p-5 shadow-soft">
      <h3 className="font-serif text-title-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-caption text-vinho/70">Sem gastos registrados.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {rows.map(([p, v]) => (
            <li key={p} className="flex justify-between gap-2">
              <span>{label(p)}</span>
              <span className="tabular-nums">{formatBRL(v)}</span>
            </li>
          ))}
          <li className="mt-1 flex justify-between gap-2 border-t border-line-subtle pt-1 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatBRL(total)}</span>
          </li>
        </ul>
      )}
    </section>
  );
}

const SORT_LABELS: Record<EventCostSort, string> = { custo: "Maior custo", margem: "Pior margem", receita: "Maior receita", recente: "Mais recente" };
const BASIS: Record<string, string> = { real: "real", estimado: "estimado", misto: "real + estimado" };

export default async function CustosPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = (await searchParams) ?? {};
  const sort = parseEventCostSort(sp.ordem);
  const now = new Date();
  const months = lastMonths(now, 6);
  const from = `${months[0] ?? ""}-01`;
  const to = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  const [finance, supabase] = await Promise.all([loadFinance({ from, to }), createSupabaseServerClient()]);
  const panel = buildCostsPanel(finance.costs, finance.revenue, now);
  const [{ data: balances }, { data: fixed }, { data: alerts }] = await Promise.all([
    supabase.from("provider_balances").select("*").order("provider"),
    supabase
      .from("cost_entries")
      .select("id,occurred_at,provider,cost_brl_cents,note")
      .eq("kind", "fixed")
      .is("deleted_at", null)
      .gte("occurred_at", `${months[months.length - 2] ?? from}-01T00:00:00Z`)
      .order("occurred_at", { ascending: false })
      .limit(100),
    supabase.from("finance_alerts").select("id,provider,kind,balance_brl_cents,emailed,created_at").is("deleted_at", null).order("created_at", { ascending: false }).limit(10),
  ]);
  const m = panel.month;
  const eventCosts = buildEventCosts(finance.costs, finance.revenue, finance.eventTitles, sort);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-title-1">Custos e saúde financeira</h1>
          <p className="text-sm text-vinho/70">
            Gasto por provedor (hoje/mês), receita × custos, margem e saldos. Detalhes por evento em{" "}
            <Link href="/admin/financeiro" className="underline">Financeiro</Link>.
          </p>
        </div>
        <CheckNowButton />
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Gasto hoje" value={formatBRL(panel.todayTotalCents)} />
        <Card title="Gasto no mês" value={formatBRL(panel.monthTotalCents)} hint="inclui fixos e taxas Asaas" />
        <Card title="Receita líquida no mês" value={formatBRL(m.revenueNetCents)} hint={`margem bruta ${pct(m.marginBps)}`} />
        <Card title="Custo por evento (mês)" value={formatBRL(m.costPerEventCents)} hint={`${String(m.events)} eventos com custo`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ProviderList title="Hoje por provedor" rows={panel.todayByProvider} total={panel.todayTotalCents} />
        <ProviderList title="Mês por provedor" rows={panel.monthByProvider} total={panel.monthTotalCents} />
      </div>

      <section className="rounded-card border border-line-subtle bg-off-white p-5 shadow-soft">
        <h3 className="font-serif text-title-3">Tendência mensal</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm" data-testid="monthly-trend">
            <thead className="text-left text-caption text-vinho/60">
              <tr><th>Mês</th><th>Receita líq.</th><th>Custos</th><th>Margem</th><th>%</th><th>Custo/evento</th></tr>
            </thead>
            <tbody className="tabular-nums">
              {panel.trend.map((t) => (
                <tr key={t.month} className="border-t border-line-subtle">
                  <td>{t.month}</td>
                  <td>{formatBRL(t.revenueNetCents)}</td>
                  <td>{formatBRL(t.costCents)}</td>
                  <td className={t.marginCents < 0 ? "text-semantic-error" : ""}>{formatBRL(t.marginCents)}</td>
                  <td>{pct(t.marginBps)}</td>
                  <td>{formatBRL(t.costPerEventCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-card border border-line-subtle bg-off-white p-5 shadow-soft" data-testid="event-costs">
        <h3 className="font-serif text-title-3">Custo por evento (últimos 6 meses)</h3>
        <p className="text-caption text-vinho/60">
          Custo total, receita (valor pago pelo cliente) e margem de cada evento. Toque em um evento para ver onde o dinheiro foi gasto, por ferramenta.
          <strong> Real</strong> = DeepSeek (tokens informados pela API) e taxa Asaas devolvida pelo webhook. <strong>Estimado</strong> = nº de chamadas × preço de referência
          (Serper, Google Places, Resend, WhatsApp) e taxa Asaas ainda não informada (Pix R$ 0,99; cartão R$ 0,49 + 1,99%).
        </p>
        <nav className="mt-3 flex flex-wrap gap-2 text-sm" aria-label="Ordenar eventos">
          {(Object.keys(SORT_LABELS) as EventCostSort[]).map((k) => (
            <Link key={k} href={`/admin/custos?ordem=${k}#custo-por-evento`} aria-current={k === sort ? "true" : undefined}
              className={`rounded-full border px-3 py-1 ${k === sort ? "border-primaria bg-primaria text-white" : "border-line-subtle"}`}>
              {SORT_LABELS[k]}
            </Link>
          ))}
        </nav>
        {eventCosts.length === 0 ? (
          <p className="mt-3 text-caption text-vinho/70">Nenhum custo atribuído a eventos no período.</p>
        ) : (
          <ul id="custo-por-evento" className="mt-3 flex flex-col divide-y divide-line-subtle">
            {eventCosts.map((e) => (
              <li key={e.eventId} data-event-id={e.eventId}>
                <details>
                  <summary className="grid cursor-pointer grid-cols-2 gap-x-3 gap-y-1 py-2 text-sm sm:grid-cols-[1fr_7rem_7rem_7rem]">
                    <span className="col-span-2 font-semibold sm:col-span-1">{e.title} <span className="text-caption font-normal text-vinho/50">{e.eventId.slice(0, 8)}</span></span>
                    <span className="tabular-nums">Custo {formatBRL(e.costCents)}</span>
                    <span className="tabular-nums">Receita {formatBRL(e.revenueCents)}</span>
                    <span className={`tabular-nums ${e.marginCents < 0 ? "text-semantic-error" : ""}`}>Margem {formatBRL(e.marginCents)}{e.marginBps === null ? "" : ` (${pct(e.marginBps)})`}</span>
                  </summary>
                  <div className="overflow-x-auto pb-3">
                    <table className="w-full text-sm">
                      <thead className="text-left text-caption text-vinho/60"><tr><th>Ferramenta</th><th>Chamadas</th><th>Valor</th><th>Tipo</th></tr></thead>
                      <tbody className="tabular-nums">
                        {e.tools.map((t) => (
                          <tr key={t.provider} className="border-t border-line-subtle">
                            <td>{label(t.provider)}</td><td>{t.calls}</td><td>{formatBRL(t.cents)}</td><td>{BASIS[t.basis]}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-line-subtle font-semibold"><td>Total</td><td>{e.calls}</td><td>{formatBRL(e.costCents)}</td><td>{e.estimatedCents > 0 ? `${formatBRL(e.estimatedCents)} estimado` : "real"}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-card border border-line-subtle bg-off-white p-5 shadow-soft">
        <h3 className="font-serif text-title-3">Saldos dos provedores</h3>
        <p className="text-caption text-vinho/60">
          DeepSeek, Asaas e Serper são consultados pela API (diário às 08:00 e no botão acima). Google Places não tem API de saldo: defina um orçamento mensal e o saldo = orçamento − gasto do mês. Os demais: informe o saldo manualmente.
          Alerta (banner + e-mail) quando o saldo fica abaixo do limite ou o fôlego projetado é menor que os dias definidos.
        </p>
        <dl className="mt-2 grid gap-x-4 gap-y-1 text-caption text-vinho/70 sm:grid-cols-2" data-testid="balance-legend">
          <div><dt className="inline font-semibold">Saldo:</dt> <dd className="inline">crédito restante no provedor (pela API ou informado por você).</dd></div>
          <div><dt className="inline font-semibold">Gasto/dia:</dt> <dd className="inline">média diária recente de gasto neste provedor.</dd></div>
          <div><dt className="inline font-semibold">Fôlego:</dt> <dd className="inline">quantos dias o saldo dura nesse ritmo (saldo ÷ gasto/dia).</dd></div>
          <div><dt className="inline font-semibold">Atualizado:</dt> <dd className="inline">quando a API do provedor foi consultada pela última vez.</dd></div>
          <div><dt className="inline font-semibold">Selo “baixo”:</dt> <dd className="inline">saldo abaixo do limite de alerta ou fôlego menor que o mínimo.</dd></div>
        </dl>
        <ul className="mt-3 flex flex-col divide-y divide-line-subtle">
          {(balances ?? []).map((b) => {
            const ev = evaluateBalance({ provider: b.provider, label: b.label, balanceBrlCents: b.balance_brl_cents, thresholdBrlCents: b.threshold_brl_cents, runwayAlertDays: b.runway_alert_days, dailyBurnBrlCents: b.daily_burn_brl_cents, lastAlertAt: null });
            return (
              <li key={b.provider} className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="text-sm">
                  <p className="font-semibold">
                    {b.label} <span className="text-caption font-normal text-vinho/60">({b.source === "api" ? "API" : b.source === "budget" ? `orçamento ${b.monthly_budget_brl_cents === null ? "não definido" : formatBRL(b.monthly_budget_brl_cents)}/mês` : "manual"})</span>
                    {ev.kind !== null ? <span title="Saldo abaixo do limite de alerta ou fôlego menor que o mínimo definido" className="ml-2 rounded-full bg-semantic-error/15 px-2 text-caption text-semantic-error">baixo</span> : null}
                  </p>
                  <p className="text-caption text-vinho/70 tabular-nums">
                    Saldo {b.balance_brl_cents === null ? "—" : formatBRL(b.balance_brl_cents)}
                    {b.raw_currency === "credits" && b.raw_balance !== null ? ` (${String(b.raw_balance)} créditos)` : ""}
                    {" · "}gasto/dia {b.daily_burn_brl_cents === null ? "—" : formatBRL(b.daily_burn_brl_cents)}
                    {" · "}fôlego {ev.runwayDays === null ? "—" : `${ev.runwayDays.toFixed(1)} dias`}
                    {b.fetched_at ? ` · atualizado ${new Date(b.fetched_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}
                    {b.last_error ? ` · erro: ${b.last_error}` : ""}
                  </p>
                </div>
                <BalanceForm provider={b.provider} manual={b.source === "manual"} budget={b.source === "budget"} budgetCents={b.monthly_budget_brl_cents} balanceCents={b.balance_brl_cents} thresholdCents={b.threshold_brl_cents} runwayDays={b.runway_alert_days} note={b.note} />
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-card border border-line-subtle bg-off-white p-5 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-title-3">Custos fixos (mês atual e anterior)</h3>
          <ConfirmDelete target="fixed" testId="clear-fixed" label="Limpar histórico" title="Excluir todos os custos fixos listados?"
            items={(fixed ?? []).map((f) => ({ id: f.id, label: `${f.occurred_at.slice(0, 7)} · ${label(f.provider)} · ${formatBRL(f.cost_brl_cents)}` }))} />
        </div>
        <p className="text-caption text-vinho/60">
          Lance novos custos fixos (VPS, Supabase, domínio…) em <Link href="/admin/financeiro" className="underline">Financeiro</Link>; corrija valores aqui.
          <strong> Valor</strong> = quanto o custo fixo custou naquele mês (R$); <strong>Observação</strong> = nota livre (ex.: nº da fatura, motivo da correção).
        </p>
        {(fixed ?? []).length === 0 ? (
          <p className="mt-3 text-caption text-vinho/70">Nenhum custo fixo lançado.</p>
        ) : (
          <ul className="mt-3 flex flex-col divide-y divide-line-subtle">
            {(fixed ?? []).map((f) => (
              <li key={f.id} className="flex flex-col gap-2 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{f.occurred_at.slice(0, 7)} · {label(f.provider)}</span>
                  <ConfirmDelete target="fixed" testId={`delete-fixed-${f.id}`} label="Excluir" title="Excluir este custo fixo?"
                    items={[{ id: f.id, label: `${f.occurred_at.slice(0, 7)} · ${label(f.provider)} · ${formatBRL(f.cost_brl_cents)}` }]} />
                </div>
                <FixedCostEdit id={f.id} cents={f.cost_brl_cents} note={f.note} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {(alerts ?? []).length > 0 ? (
        <section className="rounded-card border border-line-subtle bg-off-white p-5 shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-serif text-title-3">Alertas recentes</h3>
            <ConfirmDelete target="alert" testId="clear-alerts" label="Limpar histórico" title="Excluir os alertas listados?"
              items={(alerts ?? []).map((a) => ({ id: a.id, label: `${new Date(a.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · ${label(a.provider)}` }))} />
          </div>
          <p className="text-caption text-vinho/60">Últimos 10 avisos gerados pelo cheque de saldos (diário às 08:00 de Brasília ou pelo botão). Horários em Brasília. “saldo baixo” = abaixo do limite; “fôlego curto” = acaba antes dos dias mínimos; “erro” = a API do provedor não respondeu.</p>
          <ul className="mt-2 flex flex-col divide-y divide-line-subtle text-sm">
            {(alerts ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                {new Date(a.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · {label(a.provider)} · {a.kind === "low_balance" ? "saldo baixo" : a.kind === "low_runway" ? "fôlego curto" : "erro"}
                {a.balance_brl_cents !== null ? ` · ${formatBRL(a.balance_brl_cents)}` : ""}{a.emailed ? " · e-mail enviado" : ""}
                </span>
                <ConfirmDelete target="alert" testId={`delete-alert-${a.id}`} label="Excluir" title="Excluir este alerta?"
                  items={[{ id: a.id, label: `${new Date(a.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · ${label(a.provider)}` }]} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
