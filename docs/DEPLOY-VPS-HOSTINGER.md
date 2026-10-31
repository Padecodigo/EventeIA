# Plano de deploy — VPS Hostinger (Coolify) — NÃO EXECUTADO

> Preparado em 24/10/2026. Nada foi implantado; nenhuma migration aplicada. Requer aprovação humana.
> Complementa `docs/DEPLOY-PRODUCAO.md` (escrito para Hetzner; a arquitetura é a mesma).

## Infra
- Hostinger KVM 2 (2 vCPU / 8 GB), Ubuntu 24.04, IP `200.141.28.13`, Coolify v4.5.0 (UI :8000).
- Estado em 24/10 16:28 (BRT): coolify, coolify-db, coolify-redis `healthy`; admin do Coolify já registrado (`/register` → `/login`).
- KVM 2 tem 2 vCPU: os limites de CPU do compose (app 2.0, worker 1.5) são tetos, não reservas — ok, mas observar carga.

## Serviços (`docker-compose.prod.yml`, recurso *Docker Compose* no Coolify)
app (Next.js standalone) · worker (`node workers.cjs`, mesma imagem) · redis 7 (AOF, senha, noeviction).

## Cloudflare DNS (zona `eventeia.com.br`, hoje **pending** — trocar NS no registro.br para `todd.ns.cloudflare.com` / `zainab.ns.cloudflare.com`)
| Tipo | Nome | Conteúdo | Proxy |
|---|---|---|---|
| A | `@` | 200.141.28.13 | Proxied |
| CNAME | `www` | eventeia.com.br | Proxied (redirect 301 → apex) |
| A | `painel` | 200.141.28.13 | Proxied (UI do Coolify; configurar domínio em Settings) |
| — | registros Resend (SPF/DKIM/MX `send`) | conforme painel Resend | DNS only |

`APP_DOMAIN=eventeia.com.br`, `NEXT_PUBLIC_APP_URL=NEXT_PUBLIC_SITE_URL=https://eventeia.com.br`.

## Variáveis de ambiente (nomes)
Obrigatórias: NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, APP_DOMAIN, REDIS_PASSWORD, ASAAS_API_KEY, ASAAS_WEBHOOK_TOKEN, WELCOME_HASH_SALT.
Opcionais/recomendadas: ASAAS_ENVIRONMENT (`production`), ASAAS_API_URL, B2C_TICKET_PRICE_CENTS, ENGINE_TIMEZONE, DEEPSEEK_*, XAI_API_KEY, NVIDIA_NIM_API_KEY, NVIDIA_NIM_BASE_URL, RESEND_API_KEY, EMAIL_FROM, EMAIL_MOCK, META_ACCESS_TOKEN, META_APP_SECRET, META_VERIFY_TOKEN, META_INSTAGRAM_BUSINESS_ID, DISCOVERY_INGEST_SECRET, FINANCE_FX_BRL_PER_USD_MICRO, FINANCE_PRICES_JSON, INDEXNOW_KEY, TRAEFIK_CERTRESOLVER, LOG_LEVEL.

Ainda faltando (sem valor de produção conhecido):
- Gerar (`openssl rand -hex 32`): REDIS_PASSWORD, WELCOME_HASH_SALT, DISCOVERY_INGEST_SECRET.
- Do usuário: ASAAS_API_KEY de **produção** + ASAAS_WEBHOOK_TOKEN (local é sandbox), DEEPSEEK_API_KEY, EMAIL_FROM (ex. `EventeIA <no-reply@eventeia.com.br>`, após Resend verificar), INDEXNOW_KEY.
- Supabase Auth: Site URL/redirects para `https://eventeia.com.br`; Google OAuth redirect URI.

## Migrações aditivas (revisar antes)
- `0024_whatsapp_dual_channel.sql`: colunas novas em profiles/events/whatsapp_messages; troca o CHECK `webhook_events_source_check`.
- `0025_lucky_coupons.sql`: 2 colunas nullable em welcome_offers, função `welcome_offer_touch_visit`, tabela `lucky_coupons` + índices.
- Não existe 0023 (lacuna de numeração, ok para o CLI).
Passos (após aprovação): 1) backup/PITR confirmado no Supabase; 2) `supabase link --project-ref <ref>`; 3) `supabase migration list` (confirmar que só 0024/0025 estão pendentes); 4) `supabase db push --dry-run`; 5) `supabase db push`; 6) `pnpm gen:types` se mudou; 7) smoke: `/api/health` e fluxo de cupom.
Aplicar as migrations **antes** de subir a imagem que depende delas.

## Ordem de execução (cada passo exige aprovação)
1. NS da zona → Cloudflare; aguardar `active`; criar DNS acima; SSL Full (strict); regras de cache bypass `/api/*` e skip WAF `/api/webhooks/*`.
2. Coolify: domínio `https://painel.eventeia.com.br`, fechar :8000 no firewall depois.
3. Coolify: GitHub App → `Padecodigo/EventeIA`, recurso Docker Compose, branch `main`, arquivo `docker-compose.prod.yml`, colar envs.
4. Migrations 0024/0025 (acima).
5. Deploy; validar healthchecks; cadastrar webhook Asaas `https://eventeia.com.br/api/webhooks/asaas` e o webhook Meta.
6. Backups (seção 7 do DEPLOY-PRODUCAO.md) e uptime monitor.
