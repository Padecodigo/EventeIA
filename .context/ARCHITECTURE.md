# ARCHITECTURE.md — Arquitetura da EventeIA

> **Fonte da verdade arquitetural.** Última revisão: 2026-10-22.
> Documentos irmãos: [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) · [PAYMENTS.md](PAYMENTS.md) · [DATABASE_RLS.md](DATABASE_RLS.md) · [WHATSAPP_EVOLUTION.md](WHATSAPP_EVOLUTION.md) · [COMMERCIAL_MODEL.md](COMMERCIAL_MODEL.md) · [FEEDS.md](FEEDS.md) · [SECURITY.md](SECURITY.md)

---

## 1. Visão geral

A EventeIA é um SaaS de **inteligência de custos e cotações para eventos** com dois públicos:

- **B2C (Anfitriões)** — compram um **tíquete único por evento** e recebem clareza financeira (orçamento determinístico, cotações, disparos via WhatsApp).
- **B2B (Planners/Cerimonialistas)** — assinam uma **franquia de créditos mensal** e gerenciam múltiplos eventos de seus clientes dentro de _workspaces_.

### 1.1 Diagrama de contexto

```
                ┌─────────────────────────────────────────────┐
                │        Navegador (Next.js RSC)               │
                │        WhatsApp do cliente final             │
                └────────────┬────────────────────┬───────────┘
                             │ HTTPS               │ mensagens
                             ▼                     ▼
   ┌─────────────────────────────────┐   ┌──────────────────────┐
   │  Next.js (App Router)           │   │  Evolution API       │
   │  app/ · RSC · Server Actions    │◄──┤  (WhatsApp, self-    │
   │  app/api/webhooks/{asaas,       │   │   hosted)            │
   │              evolution}          │   └──────────────────────┘
   └───────┬──────────────┬──────────┘
           │              │ eventos de sistema + jobs
           ▼              ▼
   ┌─────────────────────────────────┐   ┌──────────────────────┐
   │  BullMQ (Redis)                 │──►│  Workers (processo    │
   │  asaas-webhooks · whatsapp-*    │   │  separado: workers/)  │
   │  feeds-*                       │   └──────────┬───────────┘
   └───────┬─────────────────────────┘              │
           │                                         │
           ▼                                         ▼
   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
   │ Supabase         │  │ Asaas API        │  │ Redis             │
   │ Auth · RLS ·      │  │ Pix dinâmico ·  │  │ filas BullMQ      │
   │ PostgreSQL        │  │ cartão · webhooks│  │                   │
   └──────────────────┘  └──────────────────┘  └──────────────────┘
```

**Princípio central**: o Next.js é a superfície HTTP fina; toda a lógica de domínio vive em `lib/`; todo trabalho pesado/assíncrono vive em `workers/`; todo evento de negócio é registrado em **feeds** (ver [FEEDS.md](FEEDS.md)).

---

## 2. Estrutura de diretórios (canônica)

```
EventeIA/
├── AGENTS.md                        # Governança do repositório (vinculante)
├── README.md                        # Visão geral + guia de instalação
├── .context/                        # ← ESTA pasta: fonte da verdade
├── .github/workflows/ci.yml          # Pipeline de validação contínua
├── .eslintrc.json                   # Linter estrito (TS + Next)
├── knip.json                        # Análise de dependências não utilizadas
├── lighthouserc.json                # Métricas de performance e acessibilidade
├── tailwind.config.ts               # Tokens do Design System
│
├── public/
│   └── logo-e.png                   # Monograma "E" (acabamento metálico)
│
├── app/                             # Next.js App Router (somente superfície HTTP)
│   ├── layout.tsx                   #   Raiz: fontes (next/font), metadados
│   ├── globals.css                  #   Variáveis CSS do Design System
│   ├── (marketing)/                 #   Público: /, /planos, /precos
│   ├── (auth)/                      #   /entrar, /registrar
│   ├── (dashboard)/                 #   Logado: /eventos, /cotas, /creditos
│   │   ├── layout.tsx               #     Autenticação + sidebar editorial
│   │   └── ...
│   └── api/
│       └── webhooks/
│           ├── asaas/route.ts       #   Entrada única de webhooks Asaas
│           └── evolution/route.ts   #   Entrada única de webhooks Evolution
│
├── components/                      # Componentes React
│   ├── ui/                          #   Primitivos (Button, Input, Card…)
│   ├── sections/                    #   Blocos de página (marketing)
│   └── domain/                      #   Orçamento, cotações, timeline
│
├── lib/                             # Lógica de domínio (sem React, sem Next)
│   ├── engine/                      # ★ MOTOR FINANCEIRO DETERMINÍSTICO
│   │   ├── index.ts                 #   calculate(): função pura exportada
│   │   ├── params/                  #   Tabelas de custo por ENGINE_VERSION
│   │   └── types.ts                 #   EngineInput / EngineResult
│   ├── asaas/                       # Cliente REST + conciliação + status
│   ├── whatsapp/                    # Templates + montagem de mensagens
│   ├── credits/                     # Ledger de créditos (B2B)
│   ├── feeds/                       # emit(): registro de eventos de sistema
│   └── supabase/                    # server.ts · admin.ts · public.ts
│
├── workers/                         # Processo separado (fora do Next)
│   ├── index.ts                     #   Boot de todos os workers
│   └── queues.ts                    #   Definição de filas BullMQ
│
├── supabase/
│   ├── migrations/                  # Migrações SQL versionadas
│   └── config.toml
│
├── tests/
│   ├── unit/                        # Motor, créditos, templates
│   ├── integration/                 # Webhooks, filas
│   └── rls/                         # Políticas RLS (pgTAP)
│
└── scripts/                         # utilitários de manutenção (seed, tipos)
```

> **Regra**: se um arquivo em `app/` tem mais do que wiring (parse de request → chamada a `lib/` → resposta), a lógica está no lugar errado.

---

## 3. Camadas e fronteiras

| Camada          | Local           | Pode importar                                           | Proibido                                                                       |
| --------------- | --------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Superfície HTTP | `app/**`        | `components/**`, `lib/**`                               | SQL direto, `fetch` a Asaas fora de `lib/asaas`                                |
| Componentes     | `components/**` | `lib/**` (tipos/utils), `components/**`                 | Lógica de negócio, acesso a dados                                              |
| Domínio         | `lib/**`        | `lib/**` (entre si), SDKs externos                      | `app/**`, `components/**`, `next/*` (exceto tipos em `lib/supabase/server.ts`) |
| **Motor**       | `lib/engine/**` | **apenas código puro** (módulos próprios e `lib/money`) | **Qualquer I/O**: banco, rede, `Date.now`, `Math.random`, env vars             |
| Workers         | `workers/**`    | `lib/**`, `bullmq`                                      | `app/**`, `components/**`                                                      |

A fronteira do motor é reforçada por lint (`no-restricted-imports`/`no-restricted-properties` em `lib/engine/**` — ver [.eslintrc.json](../.eslintrc.json)) e por testes de pureza (golden files + property tests).

---

## 4. Next.js App Router — convenções

1. **Server Components por padrão.** `"use client"` apenas em folhas interativas. Dados são buscados em RSC/Server Actions — **zero `useEffect` para fetch**.
2. **Route groups** para segmentar contextos: `(marketing)` sem autenticação, `(dashboard)` com `layout.tsx` que valida sessão Supabase.
3. **Route Handlers** existem apenas para: webhooks (`app/api/webhooks/*`) e endpoints de máquina (health, feeds paginados). Nada de "API paralela" à UI.
4. **Server Actions** são o caminho de mutação da UI (criar evento, comprar tíquete, disparar cotação). Toda action valida entrada com zod, executa `lib/`, registra feed e usa `revalidatePath`.
5. **Streaming & Suspense** para o orçamento (componente pesado de tabela editorial) — o shell pinta primeiro, areia quente primeiro.
6. **Caching**: conteúdo de marketing usa revalidação por tempo; dados do usuário **nunca** são cacheados (`export const dynamic = "force-dynamic"` nas rotas autenticadas).
7. **Middleware** (`middleware.ts`): refresh de sessão Supabase + cabeçalhos de segurança (ver [SECURITY.md](SECURITY.md)). Nenhuma lógica de negócio no middleware.

---

## 5. Motor determinístico financeiro (`lib/engine/`)

O coração do produto: **"A clareza financeira e a inteligência que o seu evento merece."**

### 5.1 Contrato

```ts
// lib/engine/index.ts — assinatura canônica
export const ENGINE_VERSION = "1.1.0"; // semver: MAJOR = quebra de formato

export function calculate(input: EngineInput, params: EngineParams): EngineResult;

type EngineInput = {
  event: {
    type: EventType; // casamento, aniversário, corporativo…
    guestCount: number; // 1..n
    date: string; // ISO-8601 (data local do evento)
    region: RegionCode; // tabela de custo regional
    items: ItemSelection[]; // buffet, música, flores, foto…
    preferences: Preferences; // faixas de prioridade por item
  };
};

type EngineResult = {
  engineVersion: string;
  currency: "BRL";
  totalCents: number; // soma das linhas
  breakdown: LineItem[]; // custo por item, com faixa min/sugerida/max
  warnings: EngineWarning[]; // ex.: datas < 30 dias (custo de urgência)
  quotationHints: QuotationHint[]; // dados para cotação com fornecedores
};
```

### 5.2 Regras invioláveis

1. **Determinismo**: mesma `input` + mesma `params` ⇒ **exatamente** o mesmo resultado. Proibido `Date.now()`, `Math.random()`, `crypto.*`, `fetch`, leitura de env vars dentro do motor. Números aleatórios/relógios entram **pela entrada** (o chamador injeta `now` quando necessário).
2. **Pureza**: sem efeitos colaterais; funções exportadas são referencialmente transparentes; memoizáveis.
3. **Dinheiro**: sempre inteiro em **centavos** (`bigint` no SQL, `number` inteiro seguro em TS). Arredondamento **half-up** via aritmética inteira (`(a + 50n) / 100n`-style). Proibido ponto flutuante e `toFixed` em cálculo.
4. **Fuso**: cálculos de data operam em `America/Sao_Paulo` fixo (`ENGINE_TIMEZONE`); o motor recebe datas já normalizadas.
5. **Versionamento**: `params/` contém uma pasta/objeto por versão (`v1.ts`, `v2.ts`…). Mudança em tabela de custo ⇒ bump `ENGINE_VERSION` (MINOR para valores, MAJOR para formato de resultado). Todo `budget_snapshot` grava a `engineVersion` usada — orçamentos antigos **nunca** são recalculados silenciosamente.
6. **Transparência**: o resultado sempre inclui o breakdown auditável — a EventeIA nunca mostra um número sem explicar sua composição.

### 5.3 Pipeline de cálculo (interno ao motor)

```
EngineInput
  → normalização (zod de borda, fora do motor)      [chamador]
  → seleção de params por (version, region, type)   [1]
  → custo base por item × convidados                [2]
  → ajustes de sazonalidade/urgência (tabelas)       [3]
  → faixa min / sugerida / max                      [4]
  → totalCents + breakdown + warnings               [5]
```

### 5.4 Testes do motor

- **Golden files**: `tests/unit/engine/__snapshots__/` — entradas fixas e saídas exatas; qualquer mudança de valor exige atualização explícita do snapshot + bump de versão.
- **Property tests** (fast-check): para inteiros aleatórios de convidados/itens, invariantes sempre verdadeiros: `totalCents == Σ(breakdown)`, `min ≤ sugerido ≤ max`, ausência de NaN/Infinito, idempotência (chamar 2× ⇒ mesmo resultado).
- **Pureza**: teste que varre `lib/engine/**` falha se encontrar import de `next`, `@supabase`, `bullmq`, `node:*`.

---

## 6. Filas e workers (BullMQ)

| Fila                          | Produtor                                    | Consumidor                                                                   | jobId (idempotência)                        | Retry                                |
| ----------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------ |
| `asaas-webhooks`              | Route Handler `webhooks/asaas`              | Worker de pagamentos                                                         | `external_event_id`                         | 5× backoff exponencial + jitter      |
| `asaas-reconcile`             | Repeatable job diário                       | Conciliação Asaas↔local                                                      | data `YYYY-MM-DD`                           | 3×                                   |
| `whatsapp-outbound`           | Server Actions/Services                     | Disparador Evolution                                                         | `idempotency_key` da mensagem               | 5× backoff + rate limit              |
| `whatsapp-inbound`            | Route Handler `webhooks/evolution`          | Processador de respostas/SAIR                                                | `external_message_id`                       | 3×                                   |
| `feeds-dispatch`              | Outbox pós-transação                        | Publicador de eventos                                                        | feed `id`                                   | 5×                                   |
| `testimonial-invites`         | Repeatable diário (10:00 America/Sao_Paulo) | Convida eventos de ontem para depoimento                                     | `testimonial_invite:event:<id>` na mensagem | 3×                                   |
| `quotation-prospecting-queue` | Server Action de prospecção                 | Agente Orçamentista: primeiro contato ao fornecedor pelo WhatsApp do cliente | `prospect:<prospectId>`                     | 5× backoff + pacing 45–90s/instância |
| `whatsapp-instance-health`    | Repeatable (*/5 min)                        | Saúde das instâncias; retoma a fila de prospecção                            | sweep por ciclo                             | 3×                                   |

- Redis: `REDIS_URL`. Workers rodam em **processo próprio** (`pnpm workers`), nunca no runtime do Next.
- DLQ: após esgotar tentativas, job vai para `*-failed` com feed `worker.job_failed` + alerta.
- Ver detalhes de rate limiting em [WHATSAPP_EVOLUTION.md](WHATSAPP_EVOLUTION.md).

---

## 7. Fluxos de ponta a ponta

### 7.1 B2C — Tíquete por evento único

```
1. Anfitrião registra-se (Supabase Auth) → profiles (role=b2c)
2. Cria evento (rascunho) → events.status=draft
3. Visualiza preview do orçamento (motor, dados mascarados)
4. Inicia checkout:
   a. Server Action calcula preço no servidor (B2C_TICKET_PRICE_CENTS)
   b. Cria customer + payment no Asaas (Pix dinâmico ou cartão)
   c. payments.status=pending · event_tickets.status=pending
5. Asaas confirma → webhook PAYMENT_RECEIVED → fila asaas-webhooks
6. Worker: transação atômica {payments→paid · event_tickets→active
   · feed payment.confirmed · feed event.activated}
7. Motor roda o orçamento completo → budget_snapshots
8. Cotações geradas → disparo opcional via WhatsApp (fila)
```

### 7.2 B2B — Franquia de créditos por assinatura

```
1. Planner registra-se (role=b2b) → cria workspace
2. Assina plano (plans) → Asaas subscription (cartão)
3. Webhook de assinatura/pagamento → credits grant (ledger +grant)
4. Cria evento de cliente → consome 1 crédito na ATIVAÇÃO:
   a. Reserva com TTL (reservation→consume|release)
   b. ledger -consume idempotente
5. Repetição mensal via ciclo da assinatura (Repeatable job + webhook)
```

### 7.3 Cotação → WhatsApp

```
quotations criadas (motor) → whatsapp_messages (pending, idempotency_key)
  → enfileira whatsapp-outbound → rate limiter → Evolution sendText
  → webhook de status (sent/delivered/read/failed) → updates + feeds
```

---

## 8. Variáveis de ambiente

| Variável                        | Escopo          | Exemplo                            | Uso                                            |
| ------------------------------- | --------------- | ---------------------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`           | client+server   | `http://localhost:3000`            | URLs absolutas                                 |
| `NEXT_PUBLIC_SUPABASE_URL`      | client+server   | `https://xxx.supabase.co`          | SDK client                                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client+server   | `eyJ…`                             | SDK client (anon)                              |
| `SUPABASE_SERVICE_ROLE_KEY`     | **server only** | `eyJ…`                             | Admin/RLS-bypass — jamais no client            |
| `REDIS_URL`                     | server/workers  | `redis://localhost:6379`           | BullMQ                                         |
| `ASAAS_API_URL`                 | server          | `https://api-sandbox.asaas.com/v3` | Base da API                                    |
| `ASAAS_API_KEY`                 | server          | `$aab_…`                           | Autenticação Asaas                             |
| `ASAAS_WEBHOOK_TOKEN`           | server          | segredo                            | Validar header do webhook                      |
| `EVOLUTION_API_URL`             | server/workers  | `http://localhost:8080`            | Base Evolution API                             |
| `EVOLUTION_API_KEY`             | server/workers  | segredo                            | Header `apikey`                                |
| `EVOLUTION_INSTANCE`            | server/workers  | `EventeIA`                         | Nome da instância                              |
| `EVOLUTION_WEBHOOK_TOKEN`       | server          | segredo                            | Validar webhook Evolution                      |
| `B2C_TICKET_PRICE_CENTS`        | server          | `4700`                             | Preço do tíquete único                         |
| `ENGINE_TIMEZONE`               | server          | `America/Sao_Paulo`                | Fuso do motor                                  |
| `WHATSAPP_MIN_INTERVAL_SECONDS` | workers         | `60`                               | Piso do intervalo entre disparos (clamp 45–90) |
| `WHATSAPP_CREDENTIALS_KEY`      | server          | hex 64 chars                       | Chave AES-256-GCM das credenciais de instância |

> Segredos **nunca** levam prefixo `NEXT_PUBLIC_`. Ver [SECURITY.md](SECURITY.md).

---

## 9. Registros de decisão (mini-ADRs)

| ID      | Decisão                                          | Motivo                                                                                |
| ------- | ------------------------------------------------ | ------------------------------------------------------------------------------------- |
| ADR-001 | Asaas como gateway único (Pix dinâmico + cartão) | Custo/benefício, webhook idempotente por `event.id`, conta PF hoje com trilha para PJ |
| ADR-002 | Dinheiro em centavos inteiros                    | Elimina classe inteira de bugs de arredondamento                                      |
| ADR-003 | Motor financeiro puro e versionado               | Auditoria, testabilidade, replicabilidade de orçamento                                |
| ADR-004 | BullMQ + workers em processo separado            | Isolar latência de rede (Asaas/Evolution) do runtime Next                             |
| ADR-005 | RLS default-deny em todas as tabelas             | Defesa em profundidade; ver [DATABASE_RLS.md](DATABASE_RLS.md)                        |
| ADR-006 | Feeds append-only como registro canônico         | Auditoria e timeline derivada; ver [FEEDS.md](FEEDS.md)                               |
| ADR-007 | Trunk-Based Development                          | Deploy contínuo, PRs pequenos, feature flags                                          |

---

## 10. Requisitos não funcionais

- **Performance**: LCP < 2,5s (desktop), TBT < 300ms — aplicado em CI via [lighthouserc.json](../lighthouserc.json).
- **Acessibilidade**: WCAG 2.2 AA; contraste validado contra a paleta oficial ([DESIGN_SYSTEM.md](DESIGN_SYSTEM.md)).
- **Disponibilidade**: stateless no Next (deploy horizontal); workers idempotentes permitem reinício a qualquer momento.
- **Observabilidade**: pino (JSON) + feeds de negócio; todo log carrega `correlation_id` do request/job.
- **LGPD**: minimização, consentimento granular para WhatsApp, trilha de erasure — ver [SECURITY.md](SECURITY.md).
