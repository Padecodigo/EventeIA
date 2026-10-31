# Remoção do WhatsApp/Evolution — registro da mudança

> Data: 2026-10-31 · Produto: WhatsApp deixa de ser canal de contato.
> Canais ativos de contato com fornecedores passam a ser **Instagram e Messenger** (Meta).

Este documento registra o que foi removido, o que foi alterado e o que **permanece
intencionalmente** no banco (sem `DROP` — as migrações são *forward-only* e o histórico
é auditoria).

---

## 1. Arquivos removidos

| Arquivo | Motivo |
|---|---|
| `app/api/webhooks/evolution/route.ts` | Endpoint de webhook da Evolution (respondia 410) |
| `app/api/webhooks/whatsapp-cloud/route.ts` | Endpoint de webhook da WhatsApp Cloud (respondia 410) |
| `docs/WHATSAPP-CLOUD.md` | Manual de configuração da WhatsApp Cloud API |
| `.context/WHATSAPP_EVOLUTION.md` | Fonte da verdade da mensageria via Evolution (substituído por este doc) |
| `supabase/tests/whatsapp_dual_channel_test.sql` | Teste pgTAP do canal duplo WhatsApp (conceito encerrado) |

Não havia mais diretórios `lib/whatsapp/*`, `lib/evolution-api/*` nem workers/queues
específicos de WhatsApp no tronco: já haviam sido removidos em PRs anteriores.

---

## 2. Arquivos alterados

### Núcleo / filas
- `lib/queue.ts` — removidas as filas `whatsappSessionLifecycle`, `whatsappInstanceHealth`, `whatsappOutbound`.
- `lib/env.ts` — sem chaves `EVOLUTION_*`/`WHATSAPP_*`; comentário de `DISCOVERY_DRY_RUN` ajustado.
- `workers/index.ts` — comentário de remoção de workers WhatsApp removido (workers já não existiam).

### Descoberta / prospecção (outreach)
- `lib/discovery/pure.ts` — removido o campo `whatsappLink` do candidato.
- `lib/discovery/engine.ts` — removida a extração de telefone via `whatsappLink` e o flag `viaWhatsappLink`.
- `lib/discovery/runtime.ts` — removida a marcação de `whatsapp_verified` no upsert de fornecedor.
- `lib/discovery/providers/grok.ts`, `social.ts` — removido `whatsapp_link` do schema/prompt/mapeamento.
- `lib/discovery/providers/overpass.ts` — removidas as tags OSM `contact:whatsapp`/`whatsapp`.
- `lib/discovery/providers/deepseek.ts`, `search-fallback.ts` — comentários/query sem WhatsApp.
- `lib/prospecting/inbound.ts` — canal de contato agora tipado por `OUTREACH_CHANNELS = ["instagram", "messenger"]`.

### Financeiro (metering)
- `lib/finance/event-costs.ts` — `METERED_PROVIDERS` sem `whatsapp`/`evolution`.
- `lib/finance/metering.ts` — `PROVIDER_OF` sem `whatsapp_cloud`/`evolution`.
- `lib/finance/pricing.ts` — removidas `whatsapp_cloud.per_1k` e `evolution.per_1k` (e o `RequestPriceKind`).
- `lib/finance/load.ts` — `PROVIDER_LABELS` sem `whatsapp`/`evolution`.
- `lib/finance/balance-monitor.ts` — removido o ramo especial de `whatsapp`.

### Textos / UI / legal / SEO
- `lib/activity/pure.ts`, `lib/notifications/toast.ts`, `lib/notifications/quotations-ready.ts`.
- `lib/legal/content.ts`, `lib/legal/policies.ts` — contato agora por Instagram/Messenger/e-mail.
- `lib/seo/site.ts`, `faq.ts`, `jsonld.ts`, `bots.ts` — copy e imagem OG sem WhatsApp.
- `app/og/route.tsx`, `app/(dashboard)/eventos/...`, `components/domain/*`, `app/admin/*` — textos e
  filtros sem WhatsApp (wa.me removido do painel de escolhas).

### Infra
- `docker-compose.dev.yml` — removidos serviços `evolution-api`/`evolution-db` e volumes.
- `.env.example`, `.env.production.example` — removidas seções `EVOLUTION_*`/`WHATSAPP_*`.
- `.github/workflows/ci.yml` — removidas env `EVOLUTION_*` dos builds.
- `vitest.config.ts` — removido o exclude legado `lib/whatsapp/evolution.ts`.

### Testes
- Removidos/reparados os testes que referenciavam WhatsApp/Evolution; novo teste de regressão
  `tests/unit/no-whatsapp.test.ts`.

---

## 3. Banco: o que ficou (intencionalmente, sem `DROP`)

Nenhuma migração foi alterada. As tabelas/colunas abaixo seguem existindo como **dados
legados/auditoria**; o código continua lendo-as sem quebrar (valores antigos viram
“legado/inativo”):

| Tabela / coluna | Situação |
|---|---|
| `whatsapp_messages` | Auditoria de mensagens antigas; novas intenções canceladas são gravadas com `status=canceled`/`error=whatsapp_removed`. |
| `whatsapp_instances` (+ `credentials_encrypted`, `collection_window_minutes`) | Sessões antigas; sem nova escrita. |
| `events.whatsapp_channel`, `profiles.whatsapp_channel`, `llm_usage_events.whatsapp_channel`, `event_outcomes.whatsapp_channel` | Dimensão de report legado (`cloud`/`evolution`/`null`). |
| `webhook_events.source` | Enum ainda contém `whatsapp_cloud`; o webhook Meta grava `source='meta'` via cast até os tipos serem regenerados. |
| `suppliers.whatsapp_verified` | Flag legado; exibido como dado (telefone) sem nova escrita. |
| `consents` (`channel='whatsapp'`) | Consentimentos históricos; o opt-out legado ainda é honrado na descoberta. |
| `vendor_prospects` | Prospecção histórica (o 1º contato agora é Meta). |

---

## 4. Canais de contato ativos

- **Instagram Direct** e **Messenger** (Meta Graph API) — respostas dentro da janela de 24h.
- **E-mail** (Resend) — notificações e convites.
- Nenhuma abordagem fria: a EventeIA não dispara a primeira mensagem via Meta.
