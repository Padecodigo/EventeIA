import Link from "next/link";

import { PROVIDER_LABELS } from "@/lib/finance/load";
import { formatBRL } from "@/lib/money";
import { loadUsage } from "@/lib/usage/load";
import { buildUsageReport, closedOutsideSummary, filtersToQuery, parseUsageFilters, type UsageDay } from "@/lib/usage/report";
import { CHANNEL_LABELS, PROCESS_STAGES, STAGE_LABELS, WHATSAPP_CHANNELS, type ProcessStage, type WhatsAppChannel } from "@/lib/usage/stages";

import { markClosedOutsideAction } from "./actions";

export const metadata = { title: "Consumo de tokens" };
export const dynamic = "force-dynamic";

const fmtInt = (n: number) => n.toLocaleString("pt-BR");
const usd = (micro: number) => `US$ ${(micro / 1_000_000).toFixed(4)}`;
const stageLabel = (s: ProcessStage | null) => (s === null ? "—" : STAGE_LABELS[s]);
const channelLabel = (c: WhatsAppChannel | null) => (c === null ? "—" : CHANNEL_LABELS[c]);
const input = "rounded-full border border-line-subtle bg-off-white px-3 py-2 text-sm";
const card = "rounded-card border border-line-subtle bg-off-white p-5 shadow-soft";

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className={card}>
      <p className="text-caption text-vinho/70">{label}</p>
      <p className="mt-1 font-serif text-title-1 tabular-nums">{value}</p>
      {hint ? <p className="text-caption text-vinho/70">{hint}</p> : null}
    </article>
  );
}

function DayChart({ days }: { days: UsageDay[] }) {
  const W = 720;
  const H = 160;
  const max = Math.max(1, ...days.map((d) => d.inputTokens + d.outputTokens));
  const bw = W / Math.max(1, days.length);
  return (
    <section className={card}>
      <h3 className="font-serif text-title-3">Tokens por dia</h3>
      <svg viewBox={`0 0 ${String(W)} ${String(H)}`} className="mt-3 h-40 w-full" role="img" aria-label="Tokens de entrada e saída por dia">
        {days.map((d, i) => {
          const hin = (d.inputTokens / max) * (H - 10);
          const hout = (d.outputTokens / max) * (H - 10);
          const x = i * bw + 1;
          const w = Math.max(1, bw - 2);
          return (
            <g key={d.day}>
              <title>{`${d.day}: ${fmtInt(d.inputTokens)} in · ${fmtInt(d.outputTokens)} out · ${usd(d.costMicroUsd)}`}</title>
              <rect x={x} y={H - hin} width={w} height={hin} className="fill-primaria" />
              <rect x={x} y={H - hin - hout} width={w} height={hout} className="fill-champagne" />
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-caption text-vinho/70">Barra escura = entrada · clara = saída.</p>
    </section>
  );
}

type SP = Record<string, string | string[] | undefined>;

export default async function UsagePage({ searchParams }: { searchParams: Promise<SP> }) {
  const filters = parseUsageFilters(await searchParams);
  const data = await loadUsage(filters);
  const r = buildUsageReport(data.rows, filters);
  const closed = closedOutsideSummary(data.closedOutside);
  const user = (id: string | null) => (id === null ? "—" : data.userLabels[id] || `usuário ${id.slice(0, 8)}`);
  const event = (id: string) => data.eventTitles[id] ?? `evento ${id.slice(0, 8)}`;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <div>
          <p className="text-overline uppercase tracking-[0.14em] text-vinho/70">Administração</p>
          <h1 className="font-serif text-display-2">Consumo de tokens</h1>
          <p className="text-sm text-vinho/70">Uso de LLM por operação, usuário e estágio do processo.</p>
        </div>
        <form className="flex flex-wrap items-end gap-2" method="get">
          <label className="text-caption">De<input type="date" name="from" defaultValue={filters.from} className={`ml-1 ${input}`} /></label>
          <label className="text-caption">Até<input type="date" name="to" defaultValue={filters.to} className={`ml-1 ${input}`} /></label>
          <select name="task" defaultValue={filters.task ?? ""} className={input} aria-label="Operação">
            <option value="">Todas as operações</option>
            {r.tasks.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input name="user" defaultValue={filters.user ?? ""} placeholder="ID do usuário" className={input} aria-label="Usuário" />
          <select name="stage" defaultValue={filters.stage ?? ""} className={input} aria-label="Estágio">
            <option value="">Todos os estágios</option>
            {PROCESS_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
            <option value="none">Sem estágio</option>
          </select>
          <select name="channel" defaultValue={filters.channel ?? ""} className={input} aria-label="Canal WhatsApp">
            <option value="">Todos os canais</option>
            {WHATSAPP_CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
            <option value="none">Sem canal</option>
          </select>
          <select name="provider" defaultValue={filters.provider ?? ""} className={input} aria-label="Provedor">
            <option value="">Todos os provedores</option>
            {["deepseek", "grok", "nim"].map((p) => <option key={p} value={p}>{PROVIDER_LABELS[p] ?? p}</option>)}
          </select>
          <button className="rounded-full bg-vinho px-4 py-2 text-sm font-semibold text-off-white">Filtrar</button>
          <Link href={`/admin/consumo/csv?${filtersToQuery(filters)}`} className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold" prefetch={false}>Exportar CSV</Link>
        </form>
      </header>

      {data.truncated ? <p role="alert" className="text-caption text-semantic-error">Período muito grande: limitado a 20 mil chamadas. Reduza o intervalo.</p> : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Chamadas" value={fmtInt(r.totals.calls)} />
        <Card label="Tokens de entrada" value={fmtInt(r.totals.inputTokens)} />
        <Card label="Tokens de saída" value={fmtInt(r.totals.outputTokens)} />
        <Card label="Custo" value={formatBRL(r.totals.costBrlCents)} hint={usd(r.totals.costMicroUsd)} />
      </section>

      <DayChart days={r.byDay} />

      <section>
        <h2 className="font-serif text-title-1">Por operação, usuário e estágio</h2>
        <div className="mt-3 overflow-x-auto rounded-card border border-line-subtle bg-off-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-caption text-vinho/70">
                <th className="px-3 py-2">Operação</th><th className="px-3 py-2">Usuário</th><th className="px-3 py-2">Estágio</th>
                <th className="px-3 py-2 text-right">Chamadas</th><th className="px-3 py-2 text-right">Tokens in</th>
                <th className="px-3 py-2 text-right">Tokens out</th><th className="px-3 py-2 text-right">US$</th><th className="px-3 py-2 text-right">R$</th>
              </tr>
            </thead>
            <tbody>
              {r.groups.length === 0 ? (
                <tr><td colSpan={8} className="px-3 py-4 text-caption text-vinho/70">Sem consumo para estes filtros.</td></tr>
              ) : (
                r.groups.slice(0, 200).map((g) => (
                  <tr key={`${g.task}|${g.profileId ?? ""}|${g.stage ?? ""}`} className="border-t border-line-subtle">
                    <td className="px-3 py-2">{g.task}</td>
                    <td className="px-3 py-2">{user(g.profileId)}</td>
                    <td className="px-3 py-2">{stageLabel(g.stage)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtInt(g.calls)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtInt(g.inputTokens)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtInt(g.outputTokens)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{usd(g.costMicroUsd)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatBRL(g.costBrlCents)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-title-1">Fechamentos por fora</h2>
        <p className="text-sm text-vinho/70">
          Clientes que fecharam direto com o fornecedor (ex.: pelo próprio WhatsApp via Evolution) antes de consolidarmos a proposta.
        </p>
        <ul className="flex flex-wrap gap-2 text-sm">
          {closed.length === 0 ? <li className="text-caption text-vinho/70">Nenhum no período.</li> : closed.map((c) => (
            <li key={`${c.stage ?? ""}|${c.channel ?? ""}`} className="rounded-full border border-line-subtle bg-off-white px-3 py-1">
              {stageLabel(c.stage)} · {channelLabel(c.channel)}: <strong className="tabular-nums">{c.count}</strong>
            </li>
          ))}
        </ul>
        {data.closedOutside.length > 0 ? (
          <ul className="text-sm">
            {data.closedOutside.slice(0, 100).map((c) => (
              <li key={c.eventId}>{c.at.slice(0, 10)} — {event(c.eventId)} · {stageLabel(c.stage)} · {channelLabel(c.channel)}</li>
            ))}
          </ul>
        ) : null}
        <form action={markClosedOutsideAction} className="flex flex-wrap items-end gap-2">
          <input name="eventId" required placeholder="ID do evento" className={input} aria-label="ID do evento" />
          <select name="stage" defaultValue="" className={input} aria-label="Estágio do fechamento">
            <option value="">Estágio atual do evento</option>
            {PROCESS_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
          </select>
          <select name="channel" defaultValue="" className={input} aria-label="Canal do fechamento">
            <option value="">Canal do evento</option>
            {WHATSAPP_CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABELS[c]}</option>)}
          </select>
          <button className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold">Marcar fechamento por fora</button>
        </form>
      </section>
    </div>
  );
}
