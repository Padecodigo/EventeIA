# SYSTEM.md — EventeIA (guia de bordo para LLMs/agentes)

> Leia **este arquivo primeiro** e, em seguida, os documentos de `.context/` citados.
> É o mapa "passo a passo" de como o sistema funciona, para que **outra LLM** entenda
> o produto, a arquitetura e as regras **antes de escrever qualquer código** — e não faça cagada.

---

## 1. O que é a EventeIA (1 parágrafo)

A EventeIA é um SaaS B2C de **inteligência de custos e cotações para eventos**. O cliente
descreve o evento, paga **um tíquete único de R$ 97** (pagamento único, Pix ou cartão via Asaas),
faz uma entrevista, recebe um **orçamento determinístico no menor preço válido** e, ao confirmar,
o sistema dispara **prospecção automática de fornecedores** (as "iscas") no Facebook/Instagram.
O motor de orçamento é **determinístico e versionado** (`lib/engine/`); o dinheiro é sempre
**inteiro em centavos**.

Slogan: *"Você imagina. A EventeIA faz acontecer."* · Tom editorial, sofisticado, humanizado.

---

## 2. Stack

| Camada | Tecnologia |
|---|---|
| Web | Next.js (App Router), React, TypeScript `strict` |
| Estilo | Tailwind CSS (tokens em `tailwind.config.ts`) |
| Banco | Supabase (PostgreSQL + Auth + RLS) |
| Pagamento | Asaas (Pix dinâmico e cartão) |
| Filas/worker | BullMQ + Redis |
| Redes sociais | Meta Graph API (IG/FB) · TikTok (só publicidade) |
| Automação de navegador | Playwright (publicação de iscas quando a Graph API não cobre) |
| Testes | Vitest (unit) · pgTAP (RLS) |
| Deploy | Coolify (stack `eventeia-prod`: app + worker + Redis num compose) |

---

## 3. Regras críticas — NÃO VIOLAR (senão quebra o produto)

1. **Dinheiro é inteiro em centavos** (`bigint`/sufixo `_cents`). **Nunca** `float`/`toFixed`.
2. **`lib/engine/` é puro e determinístico**: zero I/O, zero `Date.now()`/`Math.random()`/UUID.
   Toda mudança de cálculo exige bump de `ENGINE_VERSION` + atualizar testes golden-file.
3. **RLS sempre ativa** nas tabelas de usuários. Nunca `DISABLE ROW LEVEL SECURITY`, nunca
   policy permissiva (`USING (true)`).
4. **Migrações forward-only** em `supabase/migrations/**` — nunca editar uma já aplicada, nunca
   `DROP`/`TRUNCATE`/`DELETE` sem `WHERE`.
5. **Preço nunca vem do cliente.** Todo valor cobrado é recalculado no servidor (engine/plans).
6. **Segredos nunca no diff.** `.env*` no `.gitignore`; se vazar, rotacione imediatamente.
7. **Trunk-Based Development**: PRs pequenos (≤ ~200 linhas), Conventional Commits, nunca
   `push --force` em `main`, nunca contornar CI.
8. **Validação com zod** em toda fronteira (route handler, server action, webhook, job).
9. **Sem `any`** sem justificativa; sem `@ts-ignore` (use `@ts-expect-error` com motivo).
10. **Documentação viva**: PR que muda comportamento atualiza `.context/` no mesmo PR.

O detalhe completo está em [`AGENTS.md`](AGENTS.md) — **ele prevalece sobre qualquer outro doc**.

---

## 4. Arquitetura (camadas)

```
app/            → Server Components / Route Handlers / Server Actions (só I/O de borda)
  └─ lib/       → lógica de negócio
       ├─ engine/         PÚRICO, determinístico (orçamento, preços, créditos)
       ├─ supabase/       clientes tipados (Admin/RLS)
       ├─ asaas/          pagamentos + webhooks idempotentes
       ├─ meta/           Graph API (IG/FB), limites, token-health
       ├─ marketing/      autopilot de publicidade + arte (FLUX + sharp)
       ├─ prospecting/    iscas, descoberta de fornecedores, publicações
       ├─ discovery/      buscadores de fornecedores (Overpass, DeepSeek, Grok, NIM, places)
       ├─ events/         ciclo de vida do evento + confirmação por DM
       └─ jobs/           handlers das filas BullMQ
  └─ workers/index.ts     sobe os Workers + agenda os jobs (cron)
```

- **`lib/engine/`** nunca importa framework/I/O — é a "caixa preta" do cálculo.
- **Acesso a dados** sempre via `lib/supabase/`; qualquer consulta que ignore RLS deve ser
  justificada em comentário e rodar no servidor.
- **Lógica de negócio nunca vive em componente** — vive em `lib/` e é chamada por Server Action.

Ver [`.context/ARCHITECTURE.md`](.context/ARCHITECTURE.md).

---

## 5. Fluxos passo a passo

### 5.1 Compra do tíquete (B2C)
1. Cliente **descreve o evento** (sem login obrigatório para começar).
2. Paga o **tíquete de R$ 97** (`9700` centavos) via Asaas — Pix ou cartão.
3. Webhook do Asaas (idempotente, com `idempotency_key`) registra → deduplica → processa na fila.
4. Tíquete `active` → libera a **entrevista** e gera o **código `EVT-…`**.
   - "Comprar ticket antes de criar o evento" também existe (tíquete avulso, migração `0085`).
5. Cupom: só campanha sazonal, teto **30%**, validado no servidor (`lib/coupons/pure.ts`).
   Piso: nunca abaixo do custo operacional (R$ 9/evento); técnico de R$ 1 para o Asaas.

Ver [`.context/COMMERCIAL_MODEL.md`](.context/COMMERCIAL_MODEL.md) e [`.context/PAYMENTS.md`](.context/PAYMENTS.md).

### 5.2 Confirmação do evento (código EVT por DM)
1. O **contratante** (dono do evento) recebe o código `EVT-XXXXXX` (6 chars, gerado no banco,
   migração `0082`, alfabeto sem ambíguos).
2. Envia por **DM no Instagram** para `@eventeia`.
3. `lib/events/confirm-by-dm.ts` reconhece o código → marca `confirmedAt` (idempotente) →
   **kickoff** da descoberta → responde confirmando.
4. Anti força-bruta: 5 tentativas falhas/remetente/hora.

### 5.3 Descoberta de fornecedores (as "iscas")
1. Evento confirmado + entrevista concluída → `lib/discovery/kickoff.ts` dispara a busca.
2. `lib/discovery/providers/*` (Overpass, DeepSeek, Grok, NIM, places pagos) retornam
   **candidatos a fornecedor** (nome, telefone, URL).
3. `lib/prospecting/*` cria os **posts de isca** (por evento, tema do alvo + tipo do evento),
   publica via Graph API ou Playwright, e o agente negocia por DM (cotações → `quotes`).
4. **Escopo social**: fornecedores só **Facebook + Instagram** (decisão #013). TikTok é só
   publicidade (não busca fornecedores).

### 5.4 Publicidade automática (autopilot)
1. Cron **`0 */4 * * *`** (`workers/index.ts`) = **6× por dia** (00,04,08,12,16,20h).
2. Cada run: **1 post + 1 story + 1 reel**, tema rotativo (`lib/marketing/themes.ts`),
   legenda via DeepSeek, e **nunca repete imagem** (dedup sha256 em `autopilot_media`).
3. **Arte híbrida** (decisão #015): `flux.1-dev` gera a **cena** (única) → sharp sobrepõe o
   **banner (headline) + cards "Orçamento recebido"** → fallback `flux.2-klein-4b` em rate limit
   → fallback estático (`artForEventType`).
4. Publicações vinculadas ao ciclo de vida do evento: excluir evento exclui os posts (Meta).

### 5.5 Orçamento (motor determinístico)
- `lib/engine/` calcula, para a mesma entrada, a **mesma saída** (versionado por `ENGINE_VERSION`).
- Único orçamento no **menor preço válido**, taxas incluídas, arredondamento half-up em centavos.

---

## 6. Mapa de arquivos (onde mora cada coisa)

| Assunto | Onde |
|---|---|
| Regras de conduta (LEIA) | `AGENTS.md` |
| Guia de bordo (este) | `SYSTEM.md` |
| Arquitetura/detalhes | `.context/ARCHITECTURE.md` |
| Design system (cores/tokens) | `.context/DESIGN_SYSTEM.md` |
| Pagamentos Asaas | `.context/PAYMENTS.md` |
| Schema + RLS | `.context/DATABASE_RLS.md` |
| Modelo comercial | `.context/COMMERCIAL_MODEL.md` |
| Segurança/sanitização | `.context/SECURITY.md` |
| Feed de eventos (auditoria) | `.context/FEEDS.md` |
| Ferramentas do agente | `.context/AGENT_TOOLING.md` + `.ai-memory/` |
| Motor financeiro (puro) | `lib/engine/` |
| Clientes Supabase | `lib/supabase/` |
| Pagamento Asaas | `lib/asaas/` |
| Meta Graph API | `lib/meta/` |
| Publicidade + arte | `lib/marketing/` |
| Iscas/fornecedores | `lib/prospecting/` + `lib/discovery/` |
| Confirmação por DM | `lib/events/` |
| Workers + cron | `workers/index.ts` |
| Migrações | `supabase/migrations/` |
| Testes | `tests/unit/` (Vitest) · RLS em `supabase/tests/` |

---

## 7. Como trabalhar com segurança (fluxo obrigatório)

1. **Ler antes de escrever**: `SYSTEM.md` + os `.context/` pertinentes + o arquivo a alterar.
2. **Planejar em incrementos**: PRs pequenos e independentes (≤ ~200 linhas), branches < 24h.
3. **Verificar antes de declarar pronto**:
   ```bash
   pnpm lint
   pnpm typecheck     # ou npx tsc --noEmit
   pnpm test          # Vitest (unit) — npx vitest run
   pnpm build
   ```
4. **Testes determinísticos**: mockar Asaas/Meta; sem rede real; sem `sleep` mágico.
5. **Nunca** contornar CI, desabilitar lint, editar migração aplicada, ou suprimir erro TS.
6. **Perguntar quando ambíguo**: nunca inventar endpoint/coluna/status/valor — consulte `.context/`
   ou pergunte ao dono.
7. **Reportar riscos** no PR (não ignorar).

---

## 8. Decisões de arquitetura (índice)

Consulte [`.ai-memory/DECISIONS.md`](.ai-memory/DECISIONS.md) para o histórico curto (#001–#015).
Destaques recentes:

- **#009** — só tíquete por evento (R$ 97); planos/assinatura/franquia saíram da superfície.
- **#013** — TikTok = só publicidade; busca de fornecedores só FB + IG.
- **#014** — dois tipos de publicidade: diária (autopilot) e isca (prospecção).
- **#015** — arte híbrida: FLUX gera a cena, sharp sobrepõe o texto.

---

*EventeIA — Você imagina. A EventeIA faz acontecer.*
