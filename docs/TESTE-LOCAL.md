# Teste local ponta a ponta — EventeIA

Guia para rodar o fluxo completo (evento → prospecção WhatsApp → extração → cenários → pagamento → notificação) **sem custo** e sem tocar produção.

> Regras: nunca commite `.env.local`; nunca aponte o Asaas para produção em testes; migrations só no banco **local**.

## 1. Pré-requisitos

- Node 20+, pnpm, Docker.
- Supabase CLI (`supabase start`) para o banco local (porta 54322) — ou um projeto Supabase de desenvolvimento.

## 2. Variáveis

```bash
cp .env.example .env.local   # preencha os valores (nomes listados no .env.example)
```

Mínimo para o teste local:

| Variável | Valor local sugerido |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` | saída de `supabase status` |
| `REDIS_URL` | `redis://localhost:6379` |
| `ASAAS_ENVIRONMENT` | `sandbox` (chave do painel **sandbox** do Asaas) |
| `ASAAS_WEBHOOK_TOKEN` | qualquer string longa e aleatória |
| `EVOLUTION_API_URL` / `EVOLUTION_API_KEY` / `EVOLUTION_WEBHOOK_TOKEN` | `http://localhost:8080` + strings aleatórias |
| `DEEPSEEK_API_KEY` | vazio ⇒ extrator **mock** (custo zero). Com chave ⇒ API real |
| `RESEND_API_KEY` | vazio ⇒ e-mail **mock** (aparece no log com e-mail mascarado) |

## 3. Infra (Redis + Evolution API)

```bash
docker compose -f docker-compose.dev.yml --env-file .env.local up -d
docker compose -f docker-compose.dev.yml ps   # redis e evolution-api "healthy"/"running"
```

## 4. Banco local

```bash
supabase start
supabase migration up        # aplica migrations pendentes (ex.: 0013) SÓ no banco local
```

## 5. App e workers

Em dois terminais:

```bash
pnpm dev        # Next.js em http://localhost:3000
pnpm workers    # BullMQ: prospecção, ciclo de sessão, webhooks, extração
```

## 6. Roteiro de teste

1. **Cadastro/login** em `/entrar` e criação de um evento (ex.: festa infantil, 30 convidados).
2. **Pagamento (sandbox simulado)** — sem cartão real:
   ```bash
   curl -X POST http://localhost:3000/api/dev/simulate-payment \
     -H 'Content-Type: application/json' \
     -d '{"asaasPaymentId":"<asaas_payment_id do evento>","webhookEventId":"evt_teste_1"}'
   ```
   Resposta esperada: `webhookStatus: 200` e `result` (pagamento `paid`, tíquete ativo).
   Rode **de novo com o mesmo `webhookEventId`** ⇒ `duplicated: true` (idempotência).
   A rota só existe com `NODE_ENV=development` (404 em produção).
3. **WhatsApp** — conecte a instância pelo QR Code no painel do evento. Ao ficar `open`, a sessão é ativada e a prospecção começa (ritmo por instância, com jitter). Ao fim da janela (`WHATSAPP_COLLECTION_WINDOW_MINUTES`, padrão 45) a instância é **desconectada por segurança**.
4. **Respostas de fornecedor** — responda pelo celular de teste. A extração usa o mock (sem chave) ou DeepSeek. Mensagens "parar", "sair", "não tenho interesse" marcam opt-out.
5. **Cenários** — no painel do evento, confira econômico/equilibrado/premium (valores em centavos, arredondamento half-up).
6. **Notificação** — ao encerrar a janela aparece o toast *"Busca finalizada e conexão do WhatsApp encerrada por segurança"* (polling a cada 20 s) e o e-mail é enviado (ou logado no mock).

## 7. Verificações automáticas

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/next lint
./node_modules/.bin/vitest run
supabase test db             # pgTAP (RLS + idempotência de pagamento)
```

## 8. Encerrar

```bash
docker compose -f docker-compose.dev.yml down     # mantém volumes (dados)
```

Não use `down -v` se quiser preservar as instâncias do WhatsApp e o Redis.

## Notas

- **Porta 6379 ocupada?** Se já houver um Redis no host, não suba o serviço `redis` (`docker compose ... up -d evolution-db evolution-api`) e mantenha `REDIS_URL` apontando para o existente — ou troque o mapeamento para `127.0.0.1:6380:6379` e use `REDIS_URL=redis://localhost:6380`.
- `EVOLUTION_API_KEY` precisa estar preenchida no `.env.local` (gere com `openssl rand -hex 24`).
- Sem plugin compose via dnf/sudo: baixe o binário em `~/.docker/cli-plugins/docker-compose` (releases do docker/compose).
- Consumo aproximado: Redis ~10 MB, Evolution ~250–400 MB, Postgres da Evolution ~50 MB.
