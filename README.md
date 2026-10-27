<p align="center">
  <img src="public/logo-e.png" alt="EventeIA" width="140" height="79" />
</p>

<h1 align="center">EventeIA</h1>

<p align="center">
  <strong>Você imagina. A EventeIA faz acontecer.</strong><br/>
  <em>A clareza financeira e a inteligência que o seu evento merece.</em>
</p>

<p align="center">
  <a href="https://github.com/eventeia/eventeia/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/eventeia/eventeia/actions/workflows/ci.yml/badge.svg" /></a>
</p>

---

## O que é a EventeIA

A EventeIA é um SaaS de **inteligência de custos e cotações para eventos**, com posicionamento editorial, sofisticado e humanizado. Ela transforma a complexidade de orçar um evento em clareza: um **motor determinístico financeiro** explica cada número, e cotações organizadas aproximam anfitriões e fornecedores.

Dois públicos, um produto:

| Público                              | Modelo                                    | O que recebe                                                                       |
| ------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| **B2C — Anfitriões**                 | **Tíquete por Evento Único** (Pix/cartão) | Orçamento completo, cotações ilimitadas do evento e disparos via WhatsApp          |
| **B2B — Planners & Cerimonialistas** | **Franquia de Créditos por Assinatura**   | Créditos mensais por workspace, múltiplos eventos de clientes, gestão profissional |

Pagamentos via **Asaas** (Pix dinâmico e cartão). Começamos com CPF e evoluímos para **CNPJ ME/SLU** — ver [`.context/PAYMENTS.md`](.context/PAYMENTS.md).

### Identidade e conceito do front

- **Logo oficial**: monograma “E” metálico em [`public/logo-e.png`](public/logo-e.png) (fundo transparente).
- **Wordmark**: “EventeIA” em **Bodoni Moda** (`font-brand`), exceção editorial documentada no Design System.
- **Slogan**: “Você imagina. A EventeIA faz acontecer.”
- **Frase de impacto**: “O seu evento merece ser vivido. Não administrado.”
- **Tom**: editorial e sofisticado, mas **acolhedor — não elitista**. Falamos com festas de todos os tamanhos e orçamentos.
- **Público principal**: mães e famílias com **festas infantis** — a home usa ilustração própria ([`kids-party-illustration.tsx`](components/marketing/kids-party-illustration.tsx)); o produto segue atendendo todos os eventos.
- **Fotos da vitrine**: [`festa-infantil.jpg`](public/festa-infantil.jpg) (festa infantil), [`EventeIA-celebration.png`](public/EventeIA-celebration.png) (celebração) e [`EventeIA-wedding.png`](public/EventeIA-wedding.png) (casamento) + ilustração própria ([`kids-party-illustration.tsx`](components/marketing/kids-party-illustration.tsx)).
- **Substituição antes do lançamento**: trocar as imagens de conceito por fotos reais de eventos, com autorização de imagem (especialmente de crianças). A vitrine não exibe créditos/fotógrafos.
- **Planner**: [`EventeIA-planner.png`](public/EventeIA-planner.png) é usada em `/para-planners`.
- **Depoimentos**: personas ilustrativas são apenas fallback. Casos reais entram pelo fluxo `/depoimento?token=…` (convite pós-evento), com consentimento versionado e moderação antes de publicar. Ver “Depoimentos reais” abaixo.

---

## Stack

| Camada        | Tecnologia                                                      |
| ------------- | --------------------------------------------------------------- |
| Aplicação     | **Next.js (App Router)** · React 19 · TypeScript strict         |
| Estilo        | **Tailwind CSS** (Design System “Atelier”)                      |
| Backend/Dados | **Supabase** — Auth, PostgreSQL, **RLS**                        |
| Pagamentos    | **Asaas** (webhooks idempotentes)                               |
| Filas/Jobs    | **BullMQ** + Redis (workers em processo separado)               |
| Mensageria    | **Evolution API** (WhatsApp, self-hosted)                       |
| Qualidade     | ESLint estrito · knip · Vitest · Lighthouse CI · GitHub Actions |

---

## Documentação de governança

A pasta [`.context/`](.context/) é a **fonte da verdade**. Leia antes de codar.

| Documento                                                 | Conteúdo                                                                    |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| [`AGENTS.md`](AGENTS.md)                                  | Regras de conduta, proibições de código destrutivo, Trunk-Based Development |
| [`ARCHITECTURE.md`](.context/ARCHITECTURE.md)             | Estrutura, App Router, camadas, motor determinístico financeiro             |
| [`DESIGN_SYSTEM.md`](.context/DESIGN_SYSTEM.md)           | Paleta, tipografia, variáveis CSS, regras de componentes                    |
| [`PAYMENTS.md`](.context/PAYMENTS.md)                     | Asaas, webhooks idempotentes, fluxos B2C × B2B                              |
| [`DATABASE_RLS.md`](.context/DATABASE_RLS.md)             | Schemas de tabelas e políticas Supabase RLS                                 |
| [`WHATSAPP_EVOLUTION.md`](.context/WHATSAPP_EVOLUTION.md) | Disparos via Evolution API + BullMQ                                         |
| [`COMMERCIAL_MODEL.md`](.context/COMMERCIAL_MODEL.md)     | Tíquetes B2C, franquia de créditos B2B, reembolsos                          |
| [`FEEDS.md`](.context/FEEDS.md)                           | Registro de eventos do sistema, logs e auditoria                            |
| [`SECURITY.md`](.context/SECURITY.md)                     | Proteção de dados (LGPD), SAN e mitigação de vulnerabilidades               |

---

## Estrutura do repositório

```
EventeIA/
├── AGENTS.md · README.md
├── .context/                    # Governança e arquitetura (fonte da verdade)
├── .github/workflows/ci.yml     # Pipeline de validação contínua
├── .eslintrc.json · knip.json · lighthouserc.json
├── tailwind.config.ts           # Tokens do Design System
├── public/logo-e.png            # Monograma "E" metálico
│
├── app/                         # Next.js App Router
│   ├── (marketing)/             # Landing, planos
│   ├── (auth)/                  # Entrar, registrar
│   ├── (dashboard)/             # Área logada
│   └── api/webhooks/            # Asaas · Evolution
│
├── components/                  # ui/ · sections/ · domain/
├── lib/
│   ├── engine/                  # ★ Motor financeiro determinístico (puro)
│   ├── asaas/                   # Cliente + webhooks + conciliação
│   ├── whatsapp/                # Templates e disparo
│   ├── credits/                 # Ledger B2B
│   ├── feeds/                   # Eventos de sistema
│   └── supabase/                # Clients tipados
│
├── workers/                     # BullMQ (processo separado)
├── supabase/                    # migrations/ · config.toml
├── tests/                       # unit · integration · rls
└── scripts/                     # utilidades (seed, gen types)
```

---

## Começando (instalação local)

### Pré-requisitos

- **Node.js 20+** e **pnpm 9+** (`corepack enable`)
- **Docker** (Supabase local e Redis)
- **Supabase CLI** (`brew install supabase/tap/supabase` ou binário)
- Conta **Asaas Sandbox** (para Pix/cartão de teste)
- Instância **Evolution API** (Docker) para testar WhatsApp

### 1. Clonar e instalar

```bash
git clone <repo-url> EventeIA
cd EventeIA
pnpm install
```

### 2. Variáveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

| Variável                        | Obrigatória | Descrição                             |
| ------------------------------- | ----------- | ------------------------------------- |
| `NEXT_PUBLIC_APP_URL`           | ✅          | `http://localhost:3000`               |
| `NEXT_PUBLIC_SUPABASE_URL`      | ✅          | URL do projeto Supabase               |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅          | Chave anon (pública)                  |
| `SUPABASE_SERVICE_ROLE_KEY`     | ✅          | **Server-only** — nunca no client     |
| `REDIS_URL`                     | ✅          | `redis://localhost:6379`              |
| `ASAAS_API_URL`                 | ✅          | `https://api-sandbox.asaas.com/v3`    |
| `ASAAS_API_KEY`                 | ✅          | Chave da conta sandbox                |
| `ASAAS_WEBHOOK_TOKEN`           | ✅          | Token do webhook configurado no Asaas |
| `EVOLUTION_API_URL`             | ✅          | `http://localhost:8080`               |
| `EVOLUTION_API_KEY`             | ✅          | Chave da instância                    |
| `EVOLUTION_INSTANCE`            | ✅          | Nome da instância (ex.: `EventeIA`)   |
| `EVOLUTION_WEBHOOK_TOKEN`       | ✅          | Token do webhook Evolution            |
| `B2C_TICKET_PRICE_CENTS`        | ✅          | Preço do tíquete (ex.: `9700`)        |
| `ENGINE_TIMEZONE`               | ⬜          | Default `America/Sao_Paulo`           |

> **Nunca** commite `.env.local`. Segredos seguem [`.context/SECURITY.md`](.context/SECURITY.md).

### 3. Banco de dados

```bash
supabase start        # sobe Postgres/Auth/Studio locais
supabase db reset     # aplica migrações + seed local
```

### 4. Redis (filas)

```bash
docker run -d --name EventeIA-redis -p 6379:6379 redis:7-alpine
```

### 5. Rodar a aplicação

```bash
pnpm dev          # Next.js em http://localhost:3000
```

Em outro terminal, os workers das filas:

```bash
pnpm workers      # BullMQ: asaas-webhooks · whatsapp-outbound · feeds
```

### 6. Webhooks em desenvolvimento

Exponha o localhost e configure as URLs no Asaas Sandbox e na Evolution API:

| Gateway       | URL                               |
| ------------- | --------------------------------- |
| Asaas         | `{tunnel}/api/webhooks/asaas`     |
| Evolution API | `{tunnel}/api/webhooks/evolution` |

Ferramentas: `cloudflared tunnel --url http://localhost:3000` (ou `ngrok http 3000`).

---

## Scripts

| Comando                                        | O que faz                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `pnpm dev`                                     | Next.js em modo desenvolvimento                                         |
| `pnpm build` / `pnpm start`                    | Build de produção / servidor                                            |
| `pnpm workers`                                 | Processo BullMQ (filas e jobs)                                          |
| `pnpm lint`                                    | ESLint estrito (TS + Next)                                              |
| `pnpm typecheck`                               | `tsc --noEmit`                                                          |
| `pnpm test`                                    | Vitest (unit + integração com mocks)                                    |
| `pnpm test:rls`                                | Testes de políticas RLS (pgTAP)                                         |
| `pnpm knip`                                    | Dependências não utilizadas                                             |
| `pnpm lighthouse`                              | Lighthouse CI local (`lhci autorun`)                                    |
| `pnpm audit`                                   | Vulnerabilidades de dependências                                        |
| `pnpm simulate:webhook <payment_id> [evento]`  | Simula webhook Asaas (apenas desenvolvimento)                           |
| `pnpm demo:seed`                               | Cria usuários/dados de demonstração no Supabase local                   |
| `pnpm e2e:local`                               | E2E do fluxo financeiro (webhook Pix → tíquete → assinatura → créditos) |
| `pnpm simulate:webhook <id> [evento] [sub_id]` | Simula webhook Asaas; com `sub_id`, fatura de assinatura                |
| `bash scripts/validate-sql.sh`                 | Aplica migrações + RLS + funções num Postgres limpo (Docker)            |

### Simular a confirmação de um Pix localmente

Com o tunnel e o Asaas Sandbox configurados:

1. Crie um evento e clique em **Pagar com Pix** (o `asaas_payment_id` fica em `payments`).
2. Dispare a confirmação: `pnpm simulate:webhook pay_123 PAYMENT_RECEIVED`.
3. O webhook registra o evento, enfileira o job e o worker `process_payment_webhook` ativa o
   tíquete e grava o feed `payment.confirmed` — sem duplicar efeitos em replays.

> A simulação recusa execução com `NODE_ENV=production`.

---

## Estado do scaffold

Já implementado: autenticação (Supabase Auth + middleware), criação de eventos, motor
determinístico (v1.1.0 com golden tests), checkout Pix (Asaas), **assinatura recorrente com
concessão automática de franquia (0009)**, **conciliação diária (job); créditos não expiram (0037)**,
webhooks idempotentes Asaas/Evolution, ativação de tíquete em transação SQL, ledger de créditos
com guarda de saldo, **testes de componentes React (Vitest + Testing Library)**,
landing + `/como-funciona` + `/para-planners` + `/planos` + auth/painel, perfil com CPF/WhatsApp e
consentimento, **cotações com envio por WhatsApp**, **workspace B2B com pacotes de créditos** e
ativação de evento por crédito, **fluxo completo de depoimentos reais** (convite automático →
consentimento → moderação → vitrine), **Agente Orçamentista** (prospecção de fornecedores pelo
WhatsApp do cliente: pacing 45–90s, texto puro, opt-out, pausa por sessão, credenciais
AES-256-GCM), **admin de cupons** (`/admin/cupons`), workers BullMQ e validação SQL via Docker.

Próximos incrementos: timeline de feeds na UI, upload de fotos reais por evento, reembolsos via
API Asaas e migração da conta PF → CNPJ ME/SLU (ver PAYMENTS.md §9).

## Depoimentos reais (fluxo)

1. **Convite automático**: a fila `testimonial-invites` roda diariamente às 10:00
   (America/Sao_Paulo); eventos ocorridos entre 1 e 30 dias atrás geram convite (30 dias, uso único)
   e um WhatsApp via Evolution API — **somente** para quem tem `consents.status = 'opted_in'`.
   O botão “Depois da festa, a história fica.” no evento continua disponível para gerar o link
   manualmente.
2. **Formulário** (`/depoimento?token=…`): nome, cidade, relato (80–800 caracteres), resultado
   opcional e **consentimento explícito** versionado ([`lib/testimonials/pure.ts`](lib/testimonials/pure.ts)).
3. **Moderação**: o envio entra como `pending` (nunca publica sozinho). Aprove/rejeite em
   **`/admin/depoimentos`** (layout protegido por papel `admin`) ou via CLI:
   `pnpm testimonials:publish <id>`.
4. **Vitrine**: a home e `/para-planners` leem apenas `approved + published`; com pelo menos um caso
   real, as personas e a nota de rodapé desaparecem automaticamente (ISR de 60s).
5. **LGPD**: consentimento registrado com versão e data; correção/remoção pelo atendimento.

> O RLS permite leitura pública **somente** de depoimentos aprovados e publicados; admins leem todos
> (0007) e a escrita é exclusiva do `service_role`.

### Tornar alguém moderador

```sql
-- no Supabase (SQL editor), com o id do usuário:
update public.profiles set role = 'admin' where id = '<uuid-do-usuario>';
```

Depois disso, `/admin/depoimentos` passa a funcionar para esse usuário (a rota valida o papel no
layout e no middleware).

## Demo local (Supabase + usuários)

Ambiente de demonstração já preparado neste workspace:

```bash
npx supabase start        # stack local (API 54321, Studio 54323)
npx supabase db reset     # migrações 0001–0008 + planos
pnpm demo:seed            # usuários e dados de exemplo
PORT=3100 pnpm start      # app em http://localhost:3100
```

**Credenciais**

| Perfil            | E-mail               | Senha           |
| ----------------- | -------------------- | --------------- |
| Anfitriã (B2C)    | `ana@eventeia.com`   | `EventeIA@2026` |
| Admin (moderação) | `admin@eventeia.com` | `Admin@2026`    |

**Login automático local**

- Anfitriã: `http://localhost:3100/demo/entrar?secret=dev-demo-2026&user=ana`
- Admin: `http://localhost:3100/demo/entrar?secret=dev-demo-2026&user=admin`

> ⚠️ A rota `/demo/entrar` é um atalho **exclusivo de demonstração local**, habilitado por
> `DEMO_LOGIN_ENABLED=true` + `DEMO_LOGIN_SECRET` no `.env.local`. **Remova a rota e essas
> variáveis antes de qualquer deploy público.** O `.env.local` não é versionado.

Os dados demo incluem: evento ativo com 3 cotações, evento concluído com depoimento pendente,
pagamentos confirmados e histórico de atividades no painel.

## Qualidade e CI

O pipeline ([`ci.yml`](.github/workflows/ci.yml)) roda em todo push na `main` e em PRs:

1. **Qualidade** — ESLint, `tsc --noEmit`, knip, `pnpm audit --audit-level high`, testes e build.
2. **Banco & RLS** — Supabase local, migrações do zero, drift de tipos e testes pgTAP.
3. **Lighthouse** — performance ≥ 90, acessibilidade ≥ 95, contraste AA ([`lighthouserc.json`](lighthouserc.json)).

Metodologia: **Trunk-Based Development** — `main` sempre implantável, PRs pequenos (< 200 linhas, < 24h), feature flags para trabalho incompleto. Regras completas em [`AGENTS.md`](AGENTS.md).

---

## Segurança e privacidade

- RLS **default-deny** em todas as tabelas ([`DATABASE_RLS.md`](.context/DATABASE_RLS.md)).
- Dinheiro em **centavos inteiros**; preço sempre calculado no servidor.
- Webhooks com **token em tempo constante** + idempotência por `event.id`.
- LGPD: consentimento para WhatsApp, minimização, erasure auditável ([`SECURITY.md`](.context/SECURITY.md)).
- Reporte vulnerabilidades: `security@eventeia.com`.

---

## Documentação oficial consultada (Meta / ModelsLab)

Consulta em **2026-10-27** (via extrator de texto, pois as páginas são renderizadas por JavaScript).

**Meta — Instagram Platform**
- https://developers.facebook.com/docs/instagram-platform/overview
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/content-publishing
- https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media
- https://developers.facebook.com/docs/instagram-platform/private-replies
- https://developers.facebook.com/docs/instagram-platform/webhooks

Valores confirmados (fonte: páginas acima; constantes em `lib/meta/limits.ts`):

| Item | Valor documentado |
|---|---|
| Versão da Graph API nos exemplos | `v26.0` |
| Legenda | máx. 2200 caracteres, 30 hashtags, **20 @menções** |
| Publicações | **100 posts/24h** (carrossel = 1) — a seção de carrossel cita 50; discrepância registrada |
| Carrossel | até 20 mídias |
| Containers | 400/24h; expiram em 24h |
| Private reply a comentário | **7 dias**, 1 mensagem (Live: só durante a transmissão) |
| Janela de mensagens | **24h** padrão; até 7 dias em Click-to-Direct ad / human_agent |
| Rate limit de mensagens | 2 chamadas/s por conta; 750/h private replies (posts/reels); 100/s (Live) |
| Imagens | JPEG, 8 MB, 4:5 a 1.91:1, 320–1440 px, sRGB |

**Decisões de limites (2026-10-27, dono do projeto):**
- `user_tags` por post: adotado o teto **conservador 8** (`USER_TAGS_MAX`), já que a página consultada não declara o número.
- Posts por 24h: teto rígido **50** (`POSTS_PER_24H_HARD_CAP`), o menor entre os valores documentados; a operação segue `MAX_POSTS_PER_DAY` (padrão 2).

**ModelsLab — Realtime Stable Diffusion (SDXL)** — confirmado em 2026-10-27:
- Endpoint `POST https://modelslab.com/api/v6/realtime/text2img`;
- autenticação: chave no **corpo JSON** (campo `key`);
- limites: width/height ≤ 1024, samples ≤ 4; formatos PNG/JPG; resposta com `output[]` de URLs.
- Cliente em `lib/modelslab/client.ts`, config em `lib/meta/limits.ts` (`MODELSLAB`).

---

## Licença

Proprietário — © 2026 EventeIA. Todos os direitos reservados.

---

<p align="center"><em>Você imagina. A EventeIA faz acontecer.</em></p>
