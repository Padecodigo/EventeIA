# PAYMENTS.md — Integração Asaas, Webhooks Idempotentes e Fluxos Financeiros

> **Fonte da verdade de pagamentos.** Última revisão: 2026-10-22.
> Irmãos: [COMMERCIAL_MODEL.md](COMMERCIAL_MODEL.md) (regras de preço/créditos) · [DATABASE_RLS.md](DATABASE_RLS.md) (DDL e RLS) · [SECURITY.md](SECURITY.md) · [FEEDS.md](FEEDS.md).
> ⚠️ Identificadores de status/eventos refletem a referência da API Asaas v3 vigente em out/2026. **Confirme sempre contra a documentação oficial** (https://docs.asaas.com) antes de alterar o mapeamento.

---

## 1. Visão geral

- **Gateway único**: Asaas (`ASAAS_API_URL`, ex. sandbox `https://api-sandbox.asaas.com/v3`).
- **Meios**: **Pix dinâmico** e **cartão de crédito** (parcelamento inicialmente à vista; antecipado/parcelado conforme plano comercial).
- **Documentação fiscal da conta**: hoje **CPF**; migração planejada para **CNPJ ME/SLU** (seção 9).
- **Princípios**:
  1. O cliente **nunca** envia valores — todo valor nasce no servidor (`B2C_TICKET_PRICE_CENTS` ou tabela `plans`).
  2. Todo webhook é **idempotente** por design: registrar → deduplicar → processar em fila.
  3. Todo efeito financeiro (liberar tíquete, conceder créditos) acontece em **uma transação atômica** com a atualização do pagamento.
  4. Dinheiro é sempre inteiro em **centavos** (ver [AGENTS.md](../AGENTS.md) §3.2).

---

## 2. Entidades e tabelas (resumo; DDL completo em DATABASE_RLS.md)

```sql
-- Cliente Asaas espelhado localmente
profiles.asaas_customer_id  -- 1 profile ↔ 1 customer Asaas

-- Cobranças avulsas (tíquete B2C, top-up B2B)
payments (
  id uuid pk,
  profile_id uuid not null references profiles(id),
  purpose text not null check (purpose in ('event_ticket','credit_topup','subscription_invoice')),
  event_id uuid null,               -- quando purpose = event_ticket
  asaas_payment_id text not null unique,
  billing_type text not null check (billing_type in ('PIX','CREDIT_CARD')),
  amount_cents bigint not null,
  status text not null default 'pending',  -- §5
  workspace_id uuid null,                  -- top-up / assinatura B2B
  credits_granted integer null,            -- pacote de créditos concedido no pagamento
  coupon_code text null,                    -- cupom aplicado (tíquete B2C)
  discount_cents integer not null default 0,-- desconto aplicado (0010)
  created_at, confirmed_at, refunded_at
);

-- Assinaturas B2B (franquia de créditos)
subscriptions (
  id uuid pk,
  workspace_id uuid not null references workspaces(id),
  plan_code text not null references plans(code),
  asaas_subscription_id text not null unique,
  status text not null default 'pending',
  current_period_start date, current_period_end date
);

-- Âncora de idempotência dos webhooks (por fonte + id externo)
webhook_events (
  id uuid pk,
  source text not null check (source in ('asaas','evolution')),
  external_event_id text not null,
  payload jsonb not null,
  status text not null default 'received',  -- received|processing|processed|failed
  attempts int not null default 0,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  unique (source, external_event_id)        -- ← deduplicação
);
```

---

## 3. Fluxo B2C — Tíquete por evento único

```
1. Server Action `checkoutEventTicket(eventId)`:
   a. Valida sessão + posse do evento (RLS) + zod.
   b. Lê preço do servidor: B2C_TICKET_PRICE_CENTS (env) — nunca do request.
   c. Garante customer Asaas (createCustomer com CPF, se ainda não existir).
   d. POST /payments { customer, billingType: PIX|CREDIT_CARD,
      value: preço em reais (centavos/100, 2 casas), description: "EventeIA — Tíquete de evento" }.
   e. Persiste payments(status=pending) + event_tickets(status=pending) na mesma transação.
   f. PIX: retorna { encodedImage, payload } (QR copia-e-cola) + expiração (padrão: 30 min).
      CARTÃO: retorna link/inline de checkout conforme integração; 3DS quando aplicável.
2. Usuário paga → Asaas envia webhook PAYMENT_RECEIVED.
3. Fila `asaas-webhooks` processa (§4): transação única
   { payments→paid · event_tickets→active · feeds payment.confirmed + event.activated }.
4. Pós-confirmação: motor calcula orçamento completo; cotações e disparos seguem seus fluxos.
```

- **Expiração do Pix**: vencimento curto (30 min). Vencido sem pagamento → webhook/status `OVERDUE` → libera a pendência (`event_tickets` volta a `available`), permite novo checkout com novo `asaas_payment_id`.
- **Tíquetes pendentes por evento**: no máximo **1 payment pendente** por evento (constraint lógica na aplicação).

---

## 4. Webhooks — protocolo idempotente (obrigatório)

### 4.1 Rota receptora (`app/api/webhooks/asaas/route.ts`)

```
POST /api/webhooks/asaas
1. Validar origem: header `asaas-access-token` (ou token na URL) deve igualar
   ASAAS_WEBHOOK_TOKEN (comparação em tempo constante). Falha → 401.
2. Parse+validação zod do envelope { event, dateCreated?, payment? }.
   Formato desconhecido → 400 (logado, sem reprocessar).
3. INSERT em webhook_events com external_event_id = <event>.id (ou payment.id + tipo),
   ON CONFLICT (source, external_event_id) DO NOTHING:
   • Inseriu   → enfileira job em `asaas-webhooks` (jobId = external_event_id) → 200.
   • Conflito  → já visto: emite feed `webhook.duplicated` e responde 200 (NUNCA erro).
4. Sempre responder 2xx rápido (<1s): o processamento pesado é da fila, não da rota.
```

### 4.2 Worker de processamento (`workers/`)

```
job(external_event_id):
1. SELECT ... FOR UPDATE em webhook_events (status: received→processing).
2. Se status='processed' → return (idempotência de reentrega).
3. Mapear status (§5) e aplicar TRANSIÇÃO (§6) em UMA transação:
     a. UPDATE payments SET status=..., confirmed_at/refunded_at=...
     b. Efeitos: ativar tíquete OU conceder créditos (ledger +grant idempotente)
     c. INSERT feeds (outbox transacional)
     d. UPDATE webhook_events SET status='processed'
4. Falha → status='failed', attempts++ , throw p/ retry BullMQ
   (5 tentativas, backoff exponencial 30s→15min com jitter).
5. Esgotadas as tentativas → DLQ + feed `worker.job_failed` + alerta.
```

**Invariante**: efeitos colaterais só existem junto do pagamento atualizado, na mesma transação. Um webhook processado duas vezes produz **um** efeito — garantido por `(source, external_event_id)` UNIQUE + estado `processed`.

---

## 5. Mapeamento de status (Asaas → interno)

| Asaas `status` | Evento webhook típico | `payments.status` | Ação automática |
|---|---|---|---|
| `CREATED` | `PAYMENT_CREATED` | `pending` | Registrar cobrança |
| (aguardando) | — | `pending` | Pix aguardando pagamento |
| `RECEIVED` | `PAYMENT_RECEIVED` | `paid` | **Confirma**: ativar tíquete / conceder créditos |
| `CONFIRMED` | `PAYMENT_CONFIRMED` | `confirmed` | Confirmação manual/baixa conciliada (sem novo efeito se já `paid`) |
| `OVERDUE` | `PAYMENT_OVERDUE` | `overdue` | Expirou: liberar reserva/tíquete pendente |
| `REFUNDED` | `PAYMENT_REFUNDED` | `refunded` | Reverter tíquete/créditos conforme [COMMERCIAL_MODEL.md](COMMERCIAL_MODEL.md) §6 |
| `AWAITING_RISK_ANALYSIS` | idem | `risk_review` | **Não concede nada**; aguardar resolução Asaas |
| Chargeback (disputa) | evento de chargeback | `chargeback` | Congela efeitos; tratar caso a caso |

- `RECEIVED_IN_CASH` não é utilizado (a EventeIA não opera caixa físico).
- Desconhecido/mapeado a `unmapped_status`: grava feed `webhook.unmapped_status` e **não altera** estado financeiro.

---

## 6. Máquina de estados de `payments`

```
pending ──► paid ──────► refunded
   │           │
   ├─► overdue  └─► confirmed (conciliação; idempotente a paid)
   │
   └─► risk_review ──► paid | refunded (resolução)

Transições permitidas (guarda):
pending → paid · pending → overdue · pending → risk_review
overdue → paid (renegociação/retry raro) · overdue → pending (novo checkout)
paid → refunded · paid → chargeback · risk_review → paid | refunded
QUALQUER outra transição → ignorar + feed payment.transition_rejected
```

Webhooks podem chegar **fora de ordem** (ex.: `OVERDUE` após `RECEIVED` em trânsito): a guarda bloqueia regressões — um pagamento `paid` nunca volta a `pending`.

---

## 7. Assinaturas B2B (franquia de créditos)

1. **Contratação**: Server Action cria `subscriptions` no Asaas (`POST /subscriptions`, billing `CREDIT_CARD`), grava `subscriptions.status=pending`.
2. **Ciclo**: a cada cobrança recorrente confirmada (`PAYMENT_RECEIVED` da fatura da assinatura):
   - `payments(purpose='subscription_invoice')` → `paid`
   - `subscriptions.current_period_*` atualizados
   - **Concessão de créditos** do plano no ledger do workspace (`+grant`, `idempotency_key = subscription_id:ciclo`).
3. **Inadimplência** (`OVERDUE`/falha): sem concessão no ciclo; workspace entra em `grace` (apenas leitura de disparos; ver [COMMERCIAL_MODEL.md](COMMERCIAL_MODEL.md) §5).
4. **Renovação programática**: além do webhook, um job repeatable diário (`asaas-reconcile`, 09:30) compara o ciclo local com o Asaas — defesa contra webhook perdido.
5. **Implementado (0009)**: faturas da assinatura bootstrapam o pagamento local e concedem a franquia automaticamente (`grant:sub:<id>:pay:<fatura>`, expira em 2 meses). Conciliação diária em `lib/jobs/asaas-reconcile.ts`.
5. **Upgrade/downgrade**: mudanças de plano aplicam pro-rata calculado no **servidor** (regra em [COMMERCIAL_MODEL.md](COMMERCIAL_MODEL.md) §4).

---

## 8. Conciliação diária (job `asaas-reconcile`)

```
1. Listar payments em (pending, overdue, risk_review) com > 24h e subscriptions ativas.
2. GET /payments/{id} no Asaas para cada um; idem cobranças da assinatura do ciclo.
3. Divergência (Asaas diz RECEIVED, local diz pending):
   → aplicar mesma transação do worker (§4.2), idempotente.
4. Divergência irrecuperável → feed `payment.divergence` + alerta humano.
5. Emitir feed `payment.reconciled` com resumo do lote.
```

---

## 9. Migração CPF → CNPJ ME/SLU (plano)

A conta Asaas atual é de **pessoa física (CPF)**. Quando a EventeIA constituir ME/SLU:

1. **Criar nova conta Asaas PJ** (contas Asaas são por CPF/CNPJ — não há “upgrade” in-place).
2. **Fase dual (2 ciclos)**: novos customers criados na conta PJ; antigos continuam cobráveis na PF até migrados.
3. **Migração de customers**: recriar por `profiles.asaas_customer_id` (novo ID na PJ), preservando `document_number` (o CPF do usuário final não muda — muda o recebedor).
4. **Assinaturas ativas**: recriar em lote na PJ com o mesmo plano; pausar a antiga só após confirmação da nova cobrança.
5. **Modelo já preparado**: `profiles.document_type` (`cpf`|`cnpj`) + `asaas_account` implícito via env permitem a troca **sem mudança de schema**.
6. Concluir com sunset da PF: emissão de NF e conciliação passam a sair da conta PJ.

---

## 10. Testes obrigatórios (integração)

| Cenário | Expectativa |
|---|---|
| Webhook legítimo | 200; job processado; efeito aplicado 1× |
| Replay exato do mesmo `event.id` | 200; `webhook.duplicated`; **zero** efeito duplicado |
| `PAYMENT_RECEIVED` duas vezes | Tíquete ativo 1×; créditos concedidos 1× |
| Ordem invertida (`OVERDUE` depois de `RECEIVED`) | Sem regressão de estado (guarda §6) |
| Token ausente/incorreto | 401; nada persistido além de log de segurança |
| Payload malformado | 400; sem crash; sem reprocessamento |
| Valor retornado pela API diverge do esperado | `payment.divergence`; sem efeito automático |
| Worker cai no meio do processamento | Retomada por `processing`+attempts; efeito atômico ou nenhum |
| Expiração de Pix (30 min) | Novo checkout gera novo `asaas_payment_id`; antigo → `overdue` |

Mocks de API: servidor fake Asaas (MSW/nock) com fixtures versionados em `tests/integration/fixtures/asaas/`.

## Ambiente e teste local (revisão 2026-10)

- `ASAAS_ENVIRONMENT=sandbox|production` seleciona a base (`https://sandbox.asaas.com/api/v3` ou `https://api.asaas.com/v3`); `ASAAS_API_URL` é override opcional. Ver `lib/asaas/environment.ts`.
- O webhook `/api/webhooks/asaas` agora chama `process_payment_webhook` **inline** (atômico e idempotente em SQL); a fila BullMQ é apenas fallback quando o RPC falha.
- `POST /api/dev/simulate-payment` (`{ "asaasPaymentId": "...", "webhookEventId"?: "..." }`) existe só com `NODE_ENV=development` (404 caso contrário) e envia `PAYMENT_RECEIVED` ao webhook real com o token. Repetir o mesmo `webhookEventId` retorna `duplicated: true`.
- Testes: `tests/unit/asaas-webhook-route.test.ts` e `supabase/tests/payment_webhook_idempotency_test.sql`.
