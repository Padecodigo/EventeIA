# FEEDS.md — Registro de Eventos do Sistema, Logs e Auditoria

> **Fonte da verdade de observabilidade de negócio.** Última revisão: 2026-10-22.
> Irmãos: [ARCHITECTURE.md](ARCHITECTURE.md) · [PAYMENTS.md](PAYMENTS.md) · [SECURITY.md](SECURITY.md) · [DATABASE_RLS.md](DATABASE_RLS.md).

---

## 1. Conceito: dois feeds, um fato

A EventeIA mantém **um registro canônico append-only** (`system_events`) de tudo o que aconteceu no domínio, e deriva dele:

| Feed | Consumidor | Natureza |
|---|---|---|
| **Feed de sistema (auditoria)** | Engenharia, suporte, conciliação, compliance | Imutável, técnico, completo, retido por obrigação |
| **Feed do usuário (timeline)** | Dashboard do anfitrião/planner | Projeção amigável sujeita a RLS, linguagem humana |

**Regra**: feeds descrevem **fatos de negócio** (`payment.confirmed`). Logs descrevem **detalhes técnicos** (pino JSON). Não confundir: um `console.log` nunca substitui um feed, e um feed nunca carrega stack trace.

---

## 2. Taxonomia e nomenclatura

Formato: `<domínio>.<ação_no_passado>` — domínios fechados; ações no passado.

| Domínio | Eventos canônicos |
|---|---|
| `auth` | `auth.signed_up`, `auth.signed_in`, `auth.deleted` |
| `profile` | `profile.updated`, `profile.role_changed` |
| `event` | `event.created`, `event.activated`, `event.completed`, `event.canceled` |
| `engine` | `engine.calculated`, `engine.version_bumped` |
| `budget` | `budget.snapshot_created` |
| `quotation` | `quotation.created`, `quotation.dispatched`, `quotation.confirmed`, `quotation.expired`, `quotation.chosen` |
| `selection` | `selection.chosen`, `selection.relayed` |
| `payment` | `payment.created`, `payment.confirmed`, `payment.refunded`, `payment.overdue`, `payment.divergence`, `payment.reconciled`, `payment.transition_rejected`, `payment.canceled` |
| `webhook` | `webhook.received`, `webhook.duplicated`, `webhook.unmapped_status`, `webhook.rejected` |
| `subscription` | `subscription.created`, `subscription.renewed`, `subscription.overdue`, `subscription.canceled` |
| `credits` | `credits.granted`, `credits.consumed`, `credits.refunded`, `credits.expired`, `credits.adjusted` |
| `vendor` | `vendor.prospected`, `vendor.opt_out`, `vendor.replied`, `vendor.escalated` |
| `consent` | `consent.opted_in`, `consent.opted_out` |
| `coupon` | `coupon.created`, `coupon.updated`, `coupon.deleted`, `coupon.redeemed` |
| `testimonial` | `testimonial.invited`, `testimonial.submitted`, `testimonial.published`, `testimonial.rejected`, `testimonial.unpublished` |
| `worker` | `worker.job_failed`, `worker.dlq_parked` |
| `admin` | `admin.export_requested`, `admin.erasure_executed` |

Novo evento: adicionar nesta tabela via PR **no mesmo commit** que o emite.

---

## 3. Envelope canônico

```ts
type SystemEvent = {
  id: string;                       // uuid v7 (ordenável no tempo)
  type: string;                     // "payment.confirmed"
  occurred_at: string;              // ISO-8601 UTC (ex.: 2026-10-22T17:12:00Z)
  actor: { type: "user" | "system" | "webhook" | "admin"; id?: string };
  aggregate: { type: "payment" | "event" | "workspace" | "quotation" | "message";
               id: string };
  payload: Record<string, unknown>; // campos mínimos por evento (§4); SEM PII desnecessária
  correlation_id: string;           // request_id / job_id — liga UI→fila→banco
  source: "app" | "worker" | "webhook";
  schema_version: number;           // ver §7
};
```

Exemplo:

```json
{
  "id": "0192f0c8-7a1b-7c3d-9e2f-4a5b6c7d8e9f",
  "type": "payment.confirmed",
  "occurred_at": "2026-10-22T17:12:00Z",
  "actor": { "type": "webhook", "id": null },
  "aggregate": { "type": "payment", "id": "pay_123" },
  "payload": { "event_id": "evt_456", "amount_cents": 4700, "billing_type": "PIX" },
  "correlation_id": "wh_evt_9f8e7d6c",
  "source": "webhook",
  "schema_version": 1
}
```

---

## 4. Payload mínimo por evento (LGPD)

| Evento | Campos obrigatórios | Proibido |
|---|---|---|
| `payment.confirmed` / `refunded` / `overdue` | `event_id`, `amount_cents`, `billing_type` | nome do cliente, CPF, e-mail |
| `coupon.redeemed` | `coupon`, `discount_cents` | e-mail, telefone |
| `credits.*` | `workspace_id`, `amount`, `entry_type` | telefone, nome |
| `quotation.*` | `quotation_id`, `event_id`, `category` | valores de terceiros além de `amount_cents` |
| `selection.*` | `event_id`, `option_id`, `status`, `price_cents` | nome do fornecedor, telefone |
| `event.*` | `event_id`, `event_type`, `status` | convidados, endereço |
| `auth.signed_up` | `user_id_hash` (sha256 com pepper) | e-mail, telefone |

---

## 5. Armazenamento

```sql
create table public.system_events (
  id uuid primary key,
  type text not null,
  occurred_at timestamptz not null,
  actor_type text not null,
  actor_id uuid null,
  aggregate_type text not null,
  aggregate_id text not null,
  payload jsonb not null default '{}'::jsonb,
  correlation_id text not null,
  source text not null,
  schema_version int not null default 1
) partition by range (occurred_at);

-- Partições mensais via pg_partman (ou cron de criação).
create index system_events_type_time_idx on public.system_events (type, occurred_at desc);
create index system_events_aggregate_idx on public.system_events (aggregate_type, aggregate_id);
create index system_events_correlation_idx on public.system_events (correlation_id);
```

- **Append-only**: `INSERT` via `service_role`/função `security definer`; sem `UPDATE`/`DELETE` para usuários. Correções são novos eventos.
- **Retenção**: 180 dias *hot* (consultas de suporte); depois, exportação para storage frio e remoção da partição. Dados financeiros: retenção de 5 anos em forma **anonimizada/agregada** (obrigações fiscais/contábeis).
- **Particionamento**: por mês; `drop partition` apenas após exportação bem-sucedida (script auditável).

---

## 6. Emissão — outbox transacional

1. Toda transação de domínio grava seu(s) feed(s) na **mesma transação** (tabela `system_events` é o outbox por si só, ou `feed_outbox` dedicado).
2. Um dispatcher (`feeds-dispatch`) publica pós-commit: timeline do usuário, integrações futuras (webhooks de saída, BI).
3. `lib/feeds/emit(tx, event)` — sempre recebe a transação; **proibido** emitir feed fora de transação com efeito financeiro.
4. Reexecução: dispatcher idempotente por `id` (no-op se já projetado).

```ts
// lib/feeds/index.ts (referência)
export async function emit(tx: Tx, e: SystemEvent): Promise<void> {
  await tx.insert(systemEvents).values({ ...e, id: uuidv7() });
}
```

---

## 7. Evolução de schema

- `schema_version` inteiro; mudanças aditivas → mesma versão; remoção/renomeação → nova versão + período de leitura dual.
- O consumidor (timeline) tolera campos extras e ausentes (nunca `switch` exaustivo que quebra com campo novo).

---

## 8. Timeline do usuário (projeção)

- `GET /api/feeds?aggregate=event:<id>&limit=50&before=<cursor>` — autenticado, paginado por cursor (`occurred_at,id`).
- Autorização: usuário só vê eventos de agregados que ele possui/acessa (mesma lógica de RLS; consulta via função `security definer` que valida posse).
- Linguagem humana mapeada no cliente (`payment.confirmed` → “Pagamento confirmado”).
- Nunca expor `payload` técnico cru na timeline (whitelist por tipo).

---

## 9. Observabilidade técnica (logs)

- **pino** JSON em app e workers; campos: `level`, `time`, `correlation_id`, `job_id`, `queue`, `duration_ms`.
- Logs **não** são feeds: logs podem ser descartados; feeds são auditáveis.
- Taxa de erro > limiar → alerta (ex.: `worker.job_failed` > 1% em 15 min).
- `correlation_id` propagado: request → server action → job → worker → feeds.

---

## 10. LGPD e auditoria

- **Consulta do titular**: export de feeds/eventos que o citam (executado por `admin` via `service_role`, com feed `admin.export_requested`).
- **Erasure**: anonimização dos campos PII nos payloads (substituir por hash) mantendo o esqueleto do evento para auditoria financeira; feed `admin.erasure_executed`.
- **Acesso a dados de outro usuário** (suporte): somente com justificativa registrada em feed `admin.access_granted` (break-glass).
- `system_events` não contém segredos, tokens ou números de cartão — nunca.

---

## 11. Testes

- Emissão atômica: falha no efeito → **nenhum** feed (transação desfeita).
- Dispatcher idempotente: publicar 2× não duplica projeção.
- Retenção/partição: script de arquivamento não apaga partição sem export válido.
- Autorização da API de feed: agregação alheia retorna vazio/403.
- Payload schema: fixtures validam `zod` por tipo (schema_version × payload).
