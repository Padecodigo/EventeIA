# Canais Meta — Instagram Direct + Messenger

> Documento operacional dos canais de mensagem da EventeIA. Última revisão: 2026-10-31.
> Regras de plataforma vinculantes: [AGENTS.md](../AGENTS.md) e [.context/ARCHITECTURE.md](../.context/ARCHITECTURE.md).

## 1. Escopo

A EventeIA conversa com fornecedores **apenas** por **Instagram DM** e **Messenger**.
WhatsApp foi removido do produto (ver [WHATSAPP-REMOCAO.md](./WHATSAPP-REMOCAO.md)).

Regras de plataforma da Meta que nunca podem ser violadas:

- **Não há abordagem fria.** Só respondemos a quem falou com a conta (erro Meta #100, subcódigo 2534014).
- **Somente janelas iniciadas pelo fornecedor**:
  - links `ig.me/m/<handle>` e `m.me/<username>` com parâmetro `ref` + landing page “Seja fornecedor”;
  - private reply a comentário (1 por comentário, até 7 dias, apenas nos próprios posts);
  - anúncios Click-to-Direct.
- **Janela de resposta**: 24h após a última mensagem do fornecedor; 7 dias quando a chegada é via anúncio Click-to-Direct (`ad_7d`).
- **Nunca usar a tag `HUMAN_AGENT`** na automação.
- Respeitar opt-out e horário comercial brasileiro (dias úteis, 09:00–18:00 America/Sao_Paulo) para automação de saída.

## 2. Modelo de dados

Tabelas (migração aditiva `0063_supplier_conversations.sql`):

| Tabela | Papel |
|---|---|
| `supplier_conversations` | Conversa por `(channel, external_user_id)` — `external_user_id` é o **PSID** no Messenger e o **IGSID** no Instagram. |
| `supplier_conversation_messages` | Mensagens da conversa (`direction`, `body`, `moderated`, `external_id`). |

Colunas-chave de `supplier_conversations`:

- `channel` `instagram|messenger`;
- `external_user_id` (PSID/IGSID);
- `ref` — origem do link/anúncio (`event:<uuid>` ou `fornecedor`);
- `last_inbound_at` — última entrada do fornecedor;
- `window_expires_at` / `window_kind` (`standard_24h`|`ad_7d`);
- `status` `open|canal_fechado|opted_out`.

RLS: escrita somente `service_role`; leitura por **admin** ou pelo **dono do evento** (via
`event_id` + join com `events`). Nenhuma política permissiva.

## 3. Guarda de envio (`lib/outreach/send-guard.ts`)

`canSend(conv, now)` é pura e decide se a automação pode responder:

1. `opted_out` → bloqueia;
2. `canal_fechado` → bloqueia;
3. janela vencida (`now > window_expires_at`) → bloqueia;
4. fora do horário comercial (dia útil, 09:00–18:00 America/Sao_Paulo, feriados nacionais) → bloqueia.

`AUTOMATION_MESSAGING_TYPE = "RESPONSE"` e `isHumanAgentTag()` documentam/rejeitam a tag
`HUMAN_AGENT` — a automação nunca a usa.

## 4. Webhook (`app/api/meta/webhook`)

A rota valida a assinatura (`X-Hub-Signature-256`), normaliza mensagens/comentários, persiste
em `webhook_events` (dedup por `source + external_event_id`) e enfileira em `meta-webhooks`.

- **Mensagens (DM)**: Instagram (`changes[].field === "messages"`) e Messenger
  (`entry[].messaging`). O `referral` (`ref`/`source`) é capturado e mapeado:
  `source === "ADS"` → `ad_7d`; demais → `standard_24h`.
- **Comentários** (`changes[].field === "comments"`): private reply **1x** (dedup), **até 7 dias**
  e **apenas nos próprios posts** (o webhook de comentários do Instagram só entrega comentários
  nas mídias da conta conectada).
- O worker `meta-webhooks` ingere cada mensagem em `supplier_conversations` e
  `supplier_conversation_messages`, reabrindo a janela a cada entrada.

## 5. Varredura de janelas

O job repetível `meta-window-sweep` (a cada 15 min) marca `canal_fechado` as conversas `open`
com `window_expires_at` vencida. `runSupplierWindowSweep()` em
`lib/outreach/supplier-conversations.ts`.

## 6. Landing page

`/seja-fornecedor` (aceita `?evento=<uuid>` para vincular ao evento) mostra os links:

- Instagram: `https://ig.me/m/eventeia?ref=...`;
- Messenger: `https://m.me/eventeia?ref=...`.

`ref` default é `fornecedor`; com contexto de evento vira `event:<uuid>`.

## 7. Variáveis de ambiente

| Variável | Uso |
|---|---|
| `META_ACCESS_TOKEN` | Envio de respostas/private reply. |
| `META_APP_SECRET` | Verificação da assinatura do webhook. |
| `META_VERIFY_TOKEN` | Verificação `hub.challenge` (GET). |
| `META_PAGE_ID` | Página do Messenger (envio + webhook `object=page`). |
| `META_INSTAGRAM_BUSINESS_ID` | Conta profissional do Instagram (envio + private reply). |

> O username da Página no m.me é `MESSENGER_PAGE_USERNAME` (`lib/outreach/supplier-links.ts`) e
> deve bater com a Página conectada ao token.
