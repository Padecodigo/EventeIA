# Teste local ponta a ponta — EventeIA (guia verificado)

Roteiro **executado de verdade** em 24/10/2026 (Fedora, 7,7 GB RAM) contra Supabase local + Redis/Evolution via Docker.
Cada passo tem o comando, a **saída esperada (✅ checkpoint)** e o que fazer se falhar.

> Regras: nunca commite nem imprima o `.env.local`; Asaas só **sandbox**; migrations só no banco **local**; sem deploy.

---

## 0. Pré-requisitos

Node 20+, pnpm, Docker + plugin compose, Supabase CLI (`~/.local/bin/supabase`).

```bash
supabase status          # ✅ API URL: http://127.0.0.1:54321 · DB: postgresql://...:54322
supabase migration up    # ✅ "Migrations applied" (ou "Local database is up to date")
```

## 1. Configuração dos serviços

### 1.1 Variáveis do `.env.local` (sem expor segredos)

Mostra só nomes, URLs e o **tamanho** dos segredos:

```bash
grep -vE '^\s*(#|$)' .env.local | while IFS='=' read -r k v; do
  case "$k" in *URL*|*ENABLED*) echo "$k=$v";; *) echo "$k=<${#v} chars>";; esac
done
```

✅ Esperado (valores reais mascarados):

```
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"   ← tem que ser LOCAL
NEXT_PUBLIC_SUPABASE_ANON_KEY=<155 chars>
SUPABASE_SERVICE_ROLE_KEY=<166 chars>
REDIS_URL="redis://localhost:6379"
ASAAS_API_URL="https://api-sandbox.asaas.com/v3"     ← sandbox, nunca produção
ASAAS_WEBHOOK_TOKEN=<29 chars>                       ← obrigatório p/ simulate-payment
EVOLUTION_API_URL="http://localhost:8080"
EVOLUTION_API_KEY=<50 chars>  EVOLUTION_INSTANCE=<..>  EVOLUTION_WEBHOOK_TOKEN=<..>
```

- Chaves do Supabase local: `supabase status -o env` (copie ANON/SERVICE_ROLE para o `.env.local`, sem colar em chat/log).
- `ASAAS_API_KEY` vazio/curto ⇒ checkout real não funciona, mas **o fluxo local usa o pagamento simulado** (passo 3) e não precisa dela.
- `DEEPSEEK_API_KEY` vazio ⇒ extrator **mock**; `RESEND_API_KEY` vazio ⇒ e-mail **mock** (logado com e-mail mascarado).

### 1.2 Redis (BullMQ + ritmo 45–90 s) e Evolution via Docker

```bash
docker compose -f docker-compose.dev.yml --env-file .env.local up -d
docker compose -f docker-compose.dev.yml ps
docker exec eventeia-dev-redis-1 redis-cli ping                          # ✅ PONG
docker exec eventeia-dev-redis-1 redis-cli config get maxmemory-policy   # ✅ noeviction (BullMQ exige)
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080                 # ✅ 200 (Evolution no ar)
```

- `noeviction` é obrigatório: com outra política o Redis pode apagar jobs/locks do BullMQ sob pressão de memória.
- O **ritmo humanizado de 45–90 s** é reservado atomicamente no Redis **por instância** na chave
  `eventeia:prospect-pace:<instância>` (`lib/queue/prospecting-pacing.ts`). A chave só aparece depois do 1º envio real.

## 2. App, workers e testes

Use **um** terminal para cada (máquina fraca: só dev server + 1 processo de workers):

```bash
pnpm dev                                   # Next em http://localhost:3000
pnpm workers > /tmp/eventeia-workers.log 2>&1 &   # BullMQ (tsx + .env.local)
```

✅ Log dos workers:

```
"queues":["asaas-webhooks","whatsapp-outbound",...,"quotation-prospecting-queue","whatsapp-session-lifecycle"],"msg":"workers da EventeIA online"
```

✅ Filas registradas no Redis:

```bash
docker exec eventeia-dev-redis-1 redis-cli --scan --pattern 'bull:*' | cut -d: -f2 | sort | uniq -c
```

### 2.1 Testes — foco no motor financeiro (`lib/engine/`)

```bash
pnpm test                                                                   # ✅ 29 files · 187 tests passed
pnpm vitest run tests/unit/engine.test.ts tests/unit/engine-scenarios.test.ts   # ✅ 22 passed (motor + cenários)
pnpm vitest run tests/unit/engine-scenarios.test.ts -t "taxas ocultas"     # ✅ 5 passed (taxas ocultas e deduções/abatimento)
pnpm typecheck && pnpm lint                                                 # ✅ sem erros/avisos
supabase test db                                                            # ✅ pgTAP: Files=2, Tests=12, PASS
```

O bloco *"effectiveCost — taxas ocultas e deduções"* cobre: soma só taxas fora do preço base; ignora taxa marcada como
desnecessária (abatimento); sem base + com taxas ⇒ dado faltante (não estima); total como base quando não há taxas;
taxa sem valor nem percentual ⇒ faltante. Valores sempre em **centavos inteiros**.

## 3. Simulação de fluxo: pagamento → tíquete → agente orçamentista

### 3.1 Criar um evento com pagamento pendente (banco LOCAL)

Opção A — dados demo: `pnpm demo:seed` (usuária `ana@eventeia.com`, eventos de exemplo).
Opção B — SQL direto (o que foi usado na validação):

```bash
P="docker exec -i supabase_db_eventeia psql -U postgres -d postgres -At"
ANA=$($P -c "select id from auth.users where email='ana@eventeia.com'")
$P <<SQL
with e as (insert into events(owner_profile_id,title,event_type,event_date,region_code,guest_count,status)
  select '$ANA','Validação local — Festa da Lia','festa_infantil',current_date+40,
         (select region_code from events limit 1),30,'awaiting_payment' returning id),
p as (insert into payments(profile_id,purpose,event_id,asaas_payment_id,billing_type,amount_cents,status)
  select '$ANA','event_ticket',e.id,'pay_local_val_001','PIX',9700,'pending' from e returning id,event_id)
insert into event_tickets(event_id,status,payment_id) select event_id,'pending',id from p returning event_id;
SQL
```

✅ Imprime o `event_id` (guarde: `EV=<uuid>`).

### 3.2 Simular o PAYMENT_RECEIVED do Asaas

```bash
curl -s -X POST localhost:3000/api/dev/simulate-payment -H 'Content-Type: application/json' \
  -d '{"asaasPaymentId":"pay_local_val_001","webhookEventId":"evt_val_001"}'
```

✅ 1ª chamada: `"webhookStatus":200,"webhook":{"ok":true,"result":"processed"}`
✅ 2ª chamada **com o mesmo** `webhookEventId`: `{"ok":true,"duplicated":true}` (idempotência)

Conferir no banco:

```bash
$P -F'|' -c "select p.status,t.status,t.activated_at is not null,e.status from payments p
  join event_tickets t on t.payment_id=p.id join events e on e.id=p.event_id
  where p.asaas_payment_id='pay_local_val_001'"
```

✅ `paid|active|t|active` — pagamento pago, tíquete ativo e **evento ativo** (migration `0014`).

> A rota só responde com `NODE_ENV=development` (404 em produção) e exige `ASAAS_WEBHOOK_TOKEN`.

### 3.3 Disparar o agente orçamentista

O agente é acionado ao **cadastrar um fornecedor** no evento (server action `addVendorProspectAction`):

1. Login demo (só local): `http://localhost:3000/demo/entrar?secret=<DEMO_LOGIN_SECRET>&user=ana`
   (use `localhost`, não `127.0.0.1` — o cookie da sessão é por host).
2. Abra `/eventos/<EV>` → **Prospectar fornecedor** → nome, categoria e WhatsApp (ex.: `12 99999-0001`).

✅ Mensagem: *"Fornecedor na fila de prospecção. O disparo respeita o intervalo humanizado."*

Conferir job no BullMQ e no banco:

```bash
R="docker exec eventeia-dev-redis-1 redis-cli"
$R --scan --pattern 'bull:quotation-prospecting-queue:prospect-*'          # ✅ 1 job prospect-<id>
$R zcard bull:quotation-prospecting-queue:delayed                           # ✅ 1 (aguardando sessão)
$P -c "select vendor_name,status from vendor_prospects where event_id='$EV'"    # ✅ Buffet ...|pending
$P -c "select instance_name,status from whatsapp_instances order by created_at desc limit 1"  # ✅ eventeia-xxxx|connecting
```

### 3.4 Comportamento do worker sem celular pareado (verificado)

| Situação | O que o worker faz | Checkpoint |
| --- | --- | --- |
| Instância `connecting` (QR ainda não lido) | adia o job 60 s **sem gastar tentativa** | job em `delayed`, `attemptsMade` vazio |
| Instância marcada ativa, mas inexistente na Evolution (HTTP 404 *"instance does not exist"*) | trata como **sessão perdida**: desconecta a instância, pausa o evento, cria notificação `quotations_ready` (motivo `session_lost`) e envia e-mail (mock) | log `notificação quotations_ready ... "reason":"session_lost"`; `whatsapp_instances.status = disconnected`; job volta a `delayed` sem queimar tentativas |
| Celular pareado (estado `open`) | reserva o slot 45–90 s, envia texto puro, marca `vendor_prospects.status = sent` | log `prospecção enviada ao fornecedor` + chave `eventeia:prospect-pace:*` |

Para simular a sessão ativa sem celular (apenas local): `$P -c "update whatsapp_instances set status='active' where instance_name='eventeia-xxxx'"` e observe o log dos workers.

**Envio real** (precisa de você): conecte o WhatsApp de teste pelo QR Code no painel do evento (ou Evolution Manager em `http://localhost:8080/manager`). Ao ficar `open` a prospecção começa; ao fim da coleta (5 cotações por categoria ou 48h, o que vier primeiro) as cotações são entregues e só então a instância é desconectada por segurança e aparece o toast *"Busca finalizada..."*.

## 4. Encerrar

```bash
pkill -f "workers/index.ts"                         # para os workers
docker compose -f docker-compose.dev.yml stop       # pausa a infra (mantém volumes)
```

Não use `down -v` se quiser manter as instâncias do WhatsApp e os dados do Redis.

## 5. Troubleshooting

| Sintoma | Causa provável | Correção |
| --- | --- | --- |
| `simulate-payment` → 404 | não está em `next dev` | rode `pnpm dev` (rota é só de desenvolvimento) |
| `{"error":"ASAAS_WEBHOOK_TOKEN ausente"}` | variável vazia | gere com `openssl rand -hex 24` e reinicie o `pnpm dev` |
| `result: "processed"` mas tíquete `pending` | `asaasPaymentId` não bate com `payments.asaas_payment_id` | confira o id; o webhook marca `last_error='pagamento não encontrado'` em `webhook_events` |
| Evento continua "Aguardando pagamento" após pagar | migration `0014` não aplicada | `supabase migration up` |
| Demo login volta para `/entrar` | acesso por `127.0.0.1` | use `http://localhost:3000` |
| "A fila de disparos está indisponível" | Redis fora do ar / `REDIS_URL` errado | `docker compose ... up -d redis` e `redis-cli ping` |
| Job de prospecção falha 5× com `Evolution HTTP 404` | versão anterior ao fix desta PR | atualize; agora vira pausa graciosa (sessão perdida) |
| Porta 6379 ocupada | Redis já rodando no host | suba só `evolution-db evolution-api` ou mapeie `127.0.0.1:6380:6379` + `REDIS_URL=redis://localhost:6380` |
| CSS/tema antigo após mudar Tailwind | cache do dev server | pare o `next dev`, `rm -rf .next/cache .next/static/css` e suba de novo |
| `Watchpack Error ... ENOTDIR /tmp/.mount_*` no log | AppImage montado em /tmp | inofensivo, ignore |

Consumo aproximado: Redis ~10 MB, Evolution ~250–400 MB, Postgres da Evolution ~50 MB, workers ~200 MB, `next dev` ~1–1,5 GB.
