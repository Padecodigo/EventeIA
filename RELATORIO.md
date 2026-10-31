# RELATÓRIO — EventeIA (MVP)

**Data:** 23/10/2026 · **Estado:** MVP funcional completo, validado localmente (app + Supabase + testes verdes)

---

## 1. O que é

A **EventeIA** é uma plataforma moderna de **inteligência de custos e cotações** para **Festas Infantis, Aniversários, Casamentos e Eventos Corporativos**. O usuário descreve a festa que imagina; a plataforma calcula um **orçamento determinístico e explicado**, organiza cotações de fornecedores e mantém histórico auditável.

> **Slogan:** "Você imagina. A EventeIA faz acontecer."
> **Frase humanizada:** "A clareza financeira e a inteligência que o seu evento merece."
> **Posicionamento:** editorial, sofisticado, humanizado — foco principal em **mães/famílias organizando festas infantis**, atendendo todos os tipos de evento.

## 2. Especificações da marca

| Item | Valor |
|---|---|
| Nome oficial | **EventeIA** |
| Slogan | "Você imagina. A EventeIA faz acontecer." |
| Modelo comercial | Tíquete por Evento Único (B2C) · Assinatura com Franquia de Créditos (B2B/Planners) |
| Gateway | **Asaas** — Pix dinâmico e cartão; webhooks idempotentes; CPF hoje, migração futura para CNPJ ME/SLU |
| Cores | **Vinho Leve** `#4A2031` · **Champagne** `#D4AF37` · Areia Quente `#F7F3EE` · Off-White `#FFFDFA` · Areia Secundária `#EEE7DF` (+ tint Champagne Claro `#EADBBD`) |
| Tipografia | **Fraunces** (títulos/serif) · **DM Sans** (UI/textos) · Bodoni Moda como exceção do wordmark |
| Monograma | `/public/logo-e.png` |
| Metodologia | **Trunk-Based Development** |

## 3. Como funciona

### Fluxo B2C — tíquete por evento
```
Cadastro → Perfil (CPF + consentimento LGPD)
→ Criar evento (festa infantil etc.) → prévia mascarada do orçamento
→ Checkout Pix (Asaas) com CUPOM OPCIONAL (desconto sempre no servidor)
→ Webhook PAYMENT_RECEIVED (idempotente) → tíquete ativo em transação SQL
→ Orçamento completo liberado → cotações organizadas no painel
→ 1–30 dias após o evento: convite automático de depoimento
→ Moderação (/admin) → vitrine
```

### Fluxo B2B — assinatura/créditos
```
Workspace do ateliê → Assinar plano (Asaas subscription, Pix mensal)
→ Fatura confirmada por webhook → franquia concedida no ledger (validade 2 meses)
→ Ativar evento consome 1 crédito (FIFO, saldo nunca negativo)
→ Pacotes avulsos via Pix (não expiram) → job diário expira franquias não usadas
```

### Motor determinístico
- Função pura `calculate(input, params)` — **mesma entrada ⇒ mesma saída** (sem relógio/aleatoriedade/I/O; proibido por lint no `lib/engine/`).
- Fatores por região, tipo de evento (festa infantil 0,90 · 15 anos 1,05 · casamento 1,10…), sazonalidade, urgência e preferência — basis points, **centavos inteiros**, half-up.
- **v1.1.0** com golden/property tests; snapshots gravam a versão.

### Segurança e idempotência
- Webhook Asaas: token em tempo constante → deduplicação `(source, external_event_id)` UNIQUE → fila → transação SQL → máquina de estados anti-regressão.
- **RLS default-deny** + `FORCE RLS` em todas as tabelas; cupons só legíveis via `service_role`; login 100% server-side.
- LGPD: consentimento versionado/revogável; CPF restrito; erasure documentado; feeds sem PII.

## 4. Stack

| Camada | Tecnologia |
|---|---|
| Aplicação | Next.js 15 (App Router) · React 19 · TypeScript strict · Server Actions |
| Estilo | Tailwind CSS + Design System "Atelier" (tokens semânticos) |
| Banco/Auth | Supabase (PostgreSQL + Auth + RLS) — 10 migrações, pgTAP |
| Pagamentos | Asaas API v3 (Pix, cartão, assinatura, conciliação) |
| Filas | BullMQ + Redis — 5 workers, jobs diários (America/Sao_Paulo) |
| Mensageria | Meta Graph API (Instagram Direct + Messenger) |
| Testes | Vitest (unit) + Testing Library/jsdom (componentes) + pgTAP + E2E local |
| Qualidade/CI | ESLint estrito · knip · pnpm audit · Lighthouse CI (perf ≥90, a11y ≥95) · GitHub Actions |
| Governança | AGENTS.md + 8 docs em `.context/` (fonte da verdade) |

## 5. Preços (piso de 35% de margem · custo R$ 9/evento)

| Oferta | Preço | Créditos | Por evento | Margem (Pix) |
|---|---|---|---|---|
| B2C tíquete | R$ 97 | 1 evento | R$ 97,00 | 82,7% |
| Essencial | R$ 117/mês | 3 | R$ 39,00 | 69,2% |
| Atelier | R$ 197/mês | 7 | R$ 28,14 | 61,0% |
| Maison | R$ 397/mês | 17 | R$ 23,35 | 54,9% |

Cupom demo: **BEMVINDA10** (10% no tíquete) — redenção contada só na confirmação.

## 6. O que já está pronto

- **Marketing**: home com **fotos em primeiro lugar** (festa infantil, celebração, casamento + ilustração), `/como-funciona`, `/para-planners`, `/planos`; depoimentos com personas (São José dos Campos, Taubaté, São Paulo, Jacareí) que cedem lugar a casos reais; login com olho mostrar/ocultar senha — 100% server-side.
- **Produto**: painel com **histórico**, eventos (7 tipos), orçamento prévia→liberado, checkout Pix **com cupom**, ativação por crédito (B2B), cotações organizadas, créditos (assinatura mensal + pacotes + extrato), perfil com consentimento LGPD, `/admin/depoimentos` (moderação).
- **Pagamentos**: webhook idempotente, assinatura recorrente com concessão automática (0009), conciliação diária (09:30), expiração FIFO (11:00), cupons com redenção por trigger (0010).
- **Qualidade**: 82+ testes (unit + componentes) · E2E local 20 asserções · migrações validadas em Postgres limpo · Lighthouse alinhado (contraste AA recalculado para a paleta nova).

## 7. O que falta

| Prioridade | Item |
|---|---|
| 🔴 Alta | Contas reais Asaas + Meta (API keys) e Instagram/Messenger |
| 🔴 Alta | Fotos reais dos eventos (com autorização) substituindo as de conceito |
| 🔴 Alta | Deploy (Vercel + Supabase cloud + Redis gerenciado; remover rotas demo; domínio EventeIA.com) |
| 🟡 Média | Timeline de feeds com filtros · reembolsos via API Asaas · gestão de cupons em tela admin (hoje via SQL/seed) |
| 🟢 Baixa | Migração CPF → CNPJ ME/SLU · upload de fotos por evento · MFA B2B |

## 8. Como rodar

```bash
npx supabase start && pnpm demo:seed    # ambiente local completo
pnpm dev                                 # desenvolvimento
pnpm build && pnpm start                 # produção local (porta 3000)
pnpm workers                             # filas/jobs (requer Redis)
pnpm test                                # testes · pnpm e2e:local · bash scripts/validate-sql.sh
```

**Demo:** `ana@eventeia.com` / senha definida em `DEMO_SEED_PASSWORD` · **Admin:** `admin@eventeia.com` / senha definida em `DEMO_SEED_ADMIN_PASSWORD`
**Atalhos:** `/demo/entrar?secret=dev-demo-2026&user=ana` · `?…user=admin` (⚠️ remover antes de produção)

---

*EventeIA — Você imagina. A EventeIA faz acontecer.*
