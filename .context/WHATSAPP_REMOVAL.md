# Remoção do WhatsApp/Evolution — plano

> Status: **pendente de duas decisões** (abaixo). Aplicar só depois que o canal
> Meta estiver recebendo **e respondendo** (o inbound Meta ainda não interpreta).

## Decisões que bloqueiam a execução

1. **Prospecção fria** — Instagram/Messenger não permitem mandar a 1ª mensagem.
   Manter a WhatsApp Cloud API (oficial, template) só para abordar, ou remover
   100% e depender do fornecedor nos procurar primeiro?
2. **Associação DM → evento** — a extração de cotação é `event_id`-escoped. A DM
   no Instagram não carrega evento. Escolher: (a) caixa de entrada com vínculo
   manual, ou (b) registrar `vendor_prospect` no momento do clique no link de DM.

## Inventário (agrupado)

| Área | Arquivos |
|---|---|
| Núcleo WhatsApp | `lib/whatsapp/*` (channel, inbound, session-manager/runtime/lifecycle, first-contact, templates, opt-out, pairing, instance-store, panel-status) |
| Cloud API | `lib/whatsapp/cloud/*` (client, template, webhook) |
| Evolution | `lib/evolution-api/client.ts` |
| Jobs/worker | `lib/queue/whatsapp-worker.ts`, `lib/jobs/whatsapp-outbound.ts`, `lib/jobs/whatsapp-instance-health.ts`, `lib/queue/prospecting-pacing.ts` |
| Webhooks | `app/api/webhooks/evolution/route.ts`, `app/api/webhooks/whatsapp-cloud/route.ts` |
| UI | `components/domain/whatsapp-connect.tsx`, `whatsapp-setup.tsx`, `prospecting-panel.tsx`, `profile-form.tsx` |
| Envs | `EVOLUTION_*`, `WHATSAPP_*` em `lib/env.ts`, `docker-compose.prod.yml`, `.env.production.example` |
| Compose | serviços `evolution-api`, `evolution-db` + volumes |
| DB | `whatsapp_messages`, `whatsapp_instances`, `vendor_prospects` (prospecção), tabelas de sessão |

## Sequência de PRs (cada um mantém main implantável)

1. Feature flag `CHANNEL=meta` — desativa o worker WhatsApp em runtime, sem apagar.
2. Meta inbound completo (receber → resolver → interpretar → salvar cotação → responder 24h).
3. Remover a UI de conexão WhatsApp (whatsapp-connect/setup) — já órfã após o 2.
4. Remover Evolution (client, webhook, instance-health, pairing) e o serviço no compose.
5. Remover WhatsApp Cloud (client, template, webhook) — só se a decisão 1 for "remover 100%".
6. Remover o núcleo `lib/whatsapp/*` e os jobs/worker; migrações forward-only para desativar
   (nunca `DROP`) as tabelas que ficam órfãs.
7. Remover envs e limpar `.context/*` (FEEDS, DATABASE_RLS, ARCHITECTURE, WHATSAPP_EVOLUTION).

## Regras

- Migrações **forward-only**: desativar/deixar tabelas, nunca `DROP`.
- RLS preservada; nada de apagar histórico (whatsapp_messages é auditoria).
- Cada PR passa por CI; nada entra no tronco sem verde.
