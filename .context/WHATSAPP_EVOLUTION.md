# WHATSAPP_EVOLUTION.md — Disparos via Evolution API + BullMQ

> **Fonte da verdade de mensageria.** Última revisão: 2026-10-22.
> Irmãos: [ARCHITECTURE.md](ARCHITECTURE.md) (filas) · [COMMERCIAL_MODEL.md](COMMERCIAL_MODEL.md) (quem pode disparar) · [SECURITY.md](SECURITY.md) (consentimento/LGPD).

---

## 1. Visão geral

- **Evolution API** (self-hosted, Docker) expõe o WhatsApp da EventeIA como serviço HTTP, com uma **instância** dedicada (`EVOLUTION_INSTANCE`, ex.: `EventeIA`).
- Todo disparo passa por **fila BullMQ** (`whatsapp-outbound`) — nunca envio síncrono dentro de request HTTP.
- Todo envio é **idempotente** e **consentido** (opt-in explícito do destinatário).
- Destinatários típicos: fornecedores (cotações) e clientes finais do planner (lembretes/confirmações). **Nunca** listas compradas; nunca mensagens de marketing não solicitadas.

```
Server Action / Worker
   → lib/whatsapp/render(template, vars)         [zod nas variáveis]
   → INSERT whatsapp_messages (pending, idempotency_key)
   → enqueue whatsapp-outbound (jobId = idempotency_key)
   → Worker: rate limit → POST Evolution /message/sendText/{instance}
   → persiste external_message_id → aguardar webhook de status
   → webhook messages.upsert → atualiza status → feeds
```

---

## 1.5 Agente Orçamentista (prospecção de fornecedores) — REGRAS INVIOLÁVEIS

O fluxo usa a **instância WhatsApp do próprio cliente** (`whatsapp_instances`, uma por usuário,
nome `eventeia-<id8>`). Prioridade máxima: **proteger o número contra banimento anti-spam**.

1. **Fila assíncrona com rate limiting rigoroso**: `quotation-prospecting-queue` (BullMQ + Redis).
   Pacing **aleatório humanizado de 45–90s por instância** (chave Redis `eventeia:prospect-pace:<instância>`
   + `moveToDelayed`, sem ocupar o worker) com **piso rígido** do limiter BullMQ
   (`max: 1`, `groupKey: instance`). Config: `WHATSAPP_MIN_INTERVAL_SECONDS` (clamp 45–90).
2. **Primeiro contato leve**: APENAS texto puro (`lib/schemas/whatsapp.ts` →
   `firstContactMessageSchema`/`renderFirstContact`) — sem URLs, sem emojis, sem anexos.
3. **Opt-out imediato**: respostas do fornecedor casam `detectOptOut` ("sair", "parar", "não
   tenho interesse"; "não" sozinho conta como recusa) → `vendor_prospects.status = 'opt_out'`
   + feed `vendor.opt_out`; envios param na hora.
4. **Sessão desconectada**: erro de sessão/sessão inválida → status da instância
   `disconnected` no banco + **fila pausada** + banner no painel pedindo reconexão; o job
   **não martela** a API. O job de saúde (a cada 5 min) consulta o `connectionState`, atualiza
   o status e **retoma a fila** quando a sessão volta (`whatsapp.instance_reconnected`).
5. **Credenciais criptografadas**: token/sessão da instância em `whatsapp_instances.credentials_encrypted`
   (**AES-256-GCM**, `lib/crypto/aes.ts`), chave via `WHATSAPP_CREDENTIALS_KEY` — leitura/escrita
   apenas no servidor.

Arquivos: `lib/queue/whatsapp-worker.ts` (worker), `lib/evolution-api/client.ts` (cliente tipado),
`lib/schemas/whatsapp.ts` (Zod). Tabelas: `whatsapp_instances`, `vendor_prospects` (0011).

---

## 2. Filas

| Fila | Papel | Configuração |
|---|---|---|
| `whatsapp-outbound` | Envio de mensagens | `attempts: 5`, backoff exponencial 30s→30min com jitter, `limiter` global + espaçamento por número |
| `whatsapp-inbound` | Processa respostas (inclusive opt-out “SAIR”) | `attempts: 3` |
| `whatsapp-outbound-failed` (DLQ) | Após esgotar tentativas | Leitura manual/alertas |

Rate limiting (padrão conservador anti-banimento):

```ts
// workers/queues.ts (referência)
new Queue("whatsapp-outbound", {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 30_000 },
    removeOnComplete: 1000,
    removeOnFail: false,
  },
  limiter: { max: 15, duration: 60_000 },   // 15 msgs/min por instância
});
```

- **Espaçamento por destinatário**: repetição para o mesmo `phone_e164` só após ≥ 60s (`delay` calculado no enqueue: `last_sent_at + 60s`).
- Worker com `concurrency: 1` (ordem e ritmo humano); o paralelismo vem de múltiplas instâncias somente após estabilidade.

---

## 3. Modelo `whatsapp_messages`

```sql
create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid null references public.workspaces(id),
  event_id uuid null references public.events(id),
  direction text not null check (direction in ('outbound','inbound')),
  template text not null,               -- quote_delivery | payment_reminder | event_ready | opt_in
  to_number_e164 text not null,
  body text not null,
  status text not null default 'pending'
    check (status in ('pending','queued','sent','delivered','read','failed','canceled')),
  idempotency_key text not null unique, -- template:recipient:aggregate:version
  external_message_id text unique,      -- retorno da Evolution
  scheduled_for timestamptz,
  sent_at timestamptz, delivered_at timestamptz, read_at timestamptz, failed_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
```

`idempotency_key` canônica: `{template}:{to_number}:{aggregate_type}:{aggregate_id}:{version}` — reenviar a mesma cotação duas vezes **não** gera duas mensagens.

---

## 4. Templates (voz editorial, sem emojis)

| Template | Quando | Variáveis |
|---|---|---|
| `quote_delivery` | Cotação gerada/atualizada | `{{nome_destinatario}}`, `{{evento}}`, `{{data_evento}}`, `{{total}}`, `{{link}}` |
| `payment_reminder` | Pix pendente perto do vencimento | `{{nome}}`, `{{valor}}`, `{{link_pagamento}}`, `{{expira_em}}` |
| `event_ready` | Orçamento liberado após pagamento | `{{nome}}`, `{{evento}}`, `{{link}}` |
| `opt_in` | Confirmação de consentimento | `{{nome}}`, `{{resposta}}` |

Regras:

1. Toda mensagem outbound (exceto transacionais solicitadas pelo próprio destinatário) termina com: *“Responda SAIR para não receber mais mensagens.”*
2. Variáveis são interpoladas **no servidor** com escape de conteúdo; nunca concatenar input do usuário diretamente no corpo sem template.
3. Limite de tamanho: 1.000 caracteres; links sempre curtos e do domínio `NEXT_PUBLIC_APP_URL`.
4. Renderização determinística (testes golden por template).

---

## 5. Consentimento e LGPD

- Registro `consents(profile_id?, phone_e164, channel='whatsapp', status='opted_in'|'opted_out', source, updated_at)`.
- **Antes de enfileirar**: verifica `consents.status='opted_in'`; sem consentimento → job nem entra na fila (status `blocked` + feed `whatsapp.skipped_no_consent`).
- **Opt-out**: resposta inbound contendo “SAIR”/“PARAR”/“CANCELAR” (case-insensitive, trim) → `opted_out` imediato + cancela jobs pendentes com `jobId` conhecido + feed `consent.opted_out`.
- Remoção de dados (LGPD): exclusão/anonimização do número em `whatsapp_messages` após 180 dias; logs nunca contêm número completo (mascarar `+55 11 *****1234`).
- Nenhum disparo em massa para números sem histórico de consentimento. Listas de convidados do anfitrião exigem aceite explícito no momento do envio.

---

## 6. Status e webhooks da Evolution

### 6.1 Envio

```ts
// lib/whatsapp/send.ts (referência)
await fetch(`${EVOLUTION_API_URL}/message/sendText/${EVOLUTION_INSTANCE}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: EVOLUTION_API_KEY },
  body: JSON.stringify({ number: toNumberE164, text: body }),
});
```

- Resposta com `key.id` (ou equivalente) → `external_message_id`; falha HTTP 4xx definitiva → `failed` (sem retry); 5xx/timeout → retry com backoff.
- Erro 401/403 (instância desconectada) → **circuit breaker**: pausa a fila, feed `whatsapp.instance_disconnected`, alerta.

### 6.2 Status (webhook `app/api/webhooks/evolution`)

| Evento Evolution | `whatsapp_messages.status` |
|---|---|
| `messages.set` (enviada) | `sent` |
| `messages.update` com status `DELIVERED` | `delivered` |
| `messages.update` com status `READ` | `read` |
| `messages.update` com status `ERROR`/`FAILED` | `failed` |
| `messages.upsert` (inbound) | cria registro `direction='inbound'` |

- Rota valida `EVOLUTION_WEBHOOK_TOKEN` (header/query) em tempo constante e responde 200 sempre que o payload for autenticado — processamento em fila (`whatsapp-inbound/status`).
- Deduplicação: `external_message_id` UNIQUE + estado monótono (`sent → delivered → read`; falhas nunca regridem estados finais).
- Transições inválidas (ex.: `read` após `failed`) são registradas como `whatsapp.status_ignored` e não alteram o estado.

---

## 7. Resiliência

1. **Retry** com backoff exponencial + jitter (evita thundering herd ao reconectar).
2. **Circuit breaker** por instância: 10 falhas 5xx/timeout consecutivas → aberto por 5 min → half-open com 1 job teste.
3. **Health check** de instância (job repeatable 5 min): `GET /instance/connectionState/{instance}`; `close` → feed + alerta.
4. **Cancelamento**: mensagens agendadas (`scheduled_for`) podem ser canceladas antes do envio (remove job + `canceled`).
5. **Reconexão**: nunca automatizar pareamento de QR em produção sem operador; alerta humano quando a sessão cair.

---

## 8. Segurança

- `EVOLUTION_API_KEY` e `EVOLUTION_WEBHOOK_TOKEN` são segredos **server-only**; jamais no client.
- Evolution exposta apenas em rede privada/porta restrita; allowlist de IP do webhook quando possível.
- Corpo de mensagens nunca contém dados sensíveis além do necessário (sem CPF completo, sem dados bancários).
- Logs com `correlation_id`; mascaramento de telefone conforme §5.

---

## 9. Testes obrigatórios

| Cenário | Expectativa |
|---|---|
| Disparo idempotente (mesmo `idempotency_key`) | 1 mensagem; segundo enqueue vira no-op |
| Sem consentimento | Nenhum envio; feed `whatsapp.skipped_no_consent` |
| “SAIR” inbound | `opted_out`; jobs pendentes cancelados |
| Evolution 500 | Retry com backoff; DLQ após 5 tentativas |
| Duplicata de webhook de status | Estado aplicado 1× |
| Status fora de ordem (`read` antes de `sent`) | Ignorado + feed |
| Template com variável ausente | Falha de render no enqueue (nunca envia corpo quebrado) |

Mocks: servidor fake Evolution (MSW) com fixtures de eventos reais anonimizados.

## Ciclo de sessão efêmera (revisão 2026-10)

- Estados da instância: `pending_qr → active → draining → ended` (ou `lost`). `connection.update open` ativa; `close` marca perdida e pausa só os jobs daquele evento (flag Redis `eventeia:event-paused:<eventId>`), sem `queue.pause()` global.
- Ritmo por instância (Redis `SET NX PX` + jitter) em `lib/queue/prospecting-pacing.ts`; concorrência global via `WHATSAPP_PROSPECTING_CONCURRENCY`.
- Fim da janela (`WHATSAPP_COLLECTION_WINDOW_MINUTES`, job `window-end-<inst>-<event>`): logout da instância, notificação `quotations_ready` (idempotente) + e-mail (Resend ou mock).
- Opt-out unificado em `detectOptOut` (frases + comandos curtos), sempre marca o fornecedor.
