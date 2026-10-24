# COMMERCIAL_MODEL.md — Regras de Negócio Comerciais da EventeIA

> **Fonte da verdade comercial.** Última revisão: 2026-10-22.
> Irmãos: [PAYMENTS.md](PAYMENTS.md) (execução de cobranças) · [DATABASE_RLS.md](DATABASE_RLS.md) (DDL) · [FEEDS.md](FEEDS.md) (eventos).

---

## 1. Princípios

1. **Dois produtos, um motor**: B2C compra um *tíquete por evento único*; B2B assina uma *franquia mensal de créditos*. Ambos desbloqueiam o mesmo núcleo de valor: orçamento determinístico + cotações + disparos.
2. **Preço nasce no servidor**: env `B2C_TICKET_PRICE_CENTS` (B2C) e tabela `plans` (B2B). Nunca hardcoded em componente; nunca aceito do cliente.
3. **Crédito é livro-razão** (*ledger*): cada movimento é um lançamento imutável; saldo é consequência auditável. Proibido atualizar saldo sem lançamento.
4. **Idempotência em tudo**: cada concessão/consumo tem `idempotency_key` UNIQUE.
5. **Transparência**: todo débito é explicável ao usuário (o quê, quando, qual evento, qual documento de origem).

---

## 2. B2C — Tíquete por evento único (Anfitriões)

### 2.1 Definição

| Atributo | Regra |
|---|---|
| O que compra | 1 tíquete = 1 evento ativado (vitalício para **aquele** evento) |
| Preço | `B2C_TICKET_PRICE_CENTS` (padrão `9700` = R$ 97,00 — configurável por ambiente) |
| Meios | Pix dinâmico ou cartão (Asaas) |
| Validade do acesso | Permanente ao orçamento/cotações do evento |
| Validade dos disparos WhatsApp | Até 7 dias após a data do evento (cortesia de follow-up) |

### 2.2 O que desbloqueia o tíquete

1. Orçamento completo (motor determinístico, sem máscara de dados).
2. Cotações ilimitadas **daquele evento** (inclusive reexecuções do motor com a mesma versão).
3. Envio das cotações via WhatsApp (respeitando consentimento do destinatário).
4. Exportação (PDF/planilha) do orçamento.

Antes da compra, o anfitrião vê um **preview deliberadamente limitado**: 3 itens do breakdown e total mascarado — suficiente para percepção de valor, sem entregar o ativo.

### 2.4 Cupons de desconto (B2C)

- **Cupom aplica-se ao tíquete** (B2C). Regra: percentual (1–90%) ou valor fixo em centavos; validade opcional (`expires_at`); limite opcional de resgates (`max_redemptions`).
- **Tudo no servidor**: o client envia apenas o código; validação e desconto vivem em `lib/coupons/pure.ts` (testado) e no `buyTicketAction`. **Regra de ouro: o preço final nunca fica abaixo do custo operacional (R$ 9/evento — §3.4); piso técnico de R$ 1,00 para a API do Asaas.** Validado no CI (`tests/unit/coupons.test.ts`).
- **Redenção conta na confirmação do pagamento** (trigger `payments_coupon_redemption`, migração 0010) — Pix abandonado não queima cupom; replay não duplica.
- **Auditoria**: `payments.coupon_code`/`discount_cents` + feed `coupon.redeemed`; cupons legíveis apenas via `service_role` (códigos não enumeráveis).
- Cupons reduzem margem por decisão comercial — o piso de 35% (§3.4) vale para o preço de tabela; o **custo operacional (R$ 9), nunca**. Feedback imediato no checkout via `applyCouponAction` ("Possui cupom de desconto?" → Aplicar) antes de gerar o Pix; a compra revalida no servidor.

### 2.3 Estados do tíquete

```
available ──checkout──► pending ──pagamento confirmado──► active
                          │                                │
                          └── Pix expira/cartão falha ──► available (novo checkout)
                                                           └── reembolso ──► refunded
```

---

## 3. B2B — Franquia de créditos por assinatura (Planners/Cerimonialistas)

### 3.1 Definição

- **Crédito = 1 evento ativado** (equivalente funcional ao tíquete B2C).
- A franquia mensal concede créditos no **início de cada ciclo pago** da assinatura.
- Créditos são do **workspace** (não do indivíduo): consome qualquer membro com papel `owner` ou `planner`.

### 3.2 Planos (estrutura em `plans`; valores ilustrativos)

| `plan_code` | Mensalidade | Créditos/ciclo | ≈ por evento | Observações |
|---|---|---|---|---|
| `essencial` | R$ 117 (`11700`) | 3 | R$ 39,00 | Entrada para quem começa a organizar festas infantis |
| `atelier` | R$ 197 (`19700`) | 7 | R$ 28,14 | Plano de referência |
| `maison` | R$ 397 (`39700`) | 17 | R$ 23,35 | Estúdios/cerimonialistas multi-cliente |

> **Regra de ouro**: nenhum plano pode vender crédito abaixo do custo. Com custo de R$ 9,00/evento, o piso de margem de contribuição é **35%**; os valores acima foram calibrados e são verificados por teste no CI (`lib/pricing.ts`).

- **Pacotes avulsos** (créditos fora da assinatura): `3` (R$ 117), `7` (R$ 197) e `17` (R$ 397) — compráveis via Pix a qualquer momento (`payments.purpose='credit_topup'`).
- Pacotes **não expiram** e passam pelo mesmo piso de margem (`CREDIT_PACKAGES` em `lib/plans.ts`; teste em `tests/unit/pricing.test.ts`).

### 3.3 Validade e *rollover*

| Origem do crédito | Expira? |
|---|---|
| Franquia mensal | Sim — no fim do ciclo seguinte ao da concessão (D+30 do ciclo subsequente), se não consumido |
| Top-up avulso | **Não expira** |
| Compensação (reembolso/cortesia) | Não expira |

Expiração executada pelo job diário `credits-expire` (11:00, `lib/jobs/credits-expire.ts`): FIFO por `expires_at` — o restante de uma franquia é `saldo − créditos ativos que vencem depois` (top-ups nunca expiram, logo são consumidos por último). Emite `credits.expired`; nunca saldo negativo; lança `-remaining` com idempotência `expire:grant:<id>`.

### 3.4 Economia unitária e piso de margem

Premissas conservadoras (Out/2026):

| Item | Valor |
|---|---|
| Custo direto por evento ativado (infra + IA + WhatsApp + suporte) | **R$ 9,00** |
| Simples Nacional (Anexo III/ME) | 6% do faturamento |
| Asaas Pix | R$ 1,99 por cobrança |
| Asaas cartão | 2,99% + R$ 0,49 |
| Piso de margem de contribuição | **35% por crédito** |

Fórmula por crédito: `receita = preço ÷ créditos`; `imposto = 6% × receita`; `taxa = taxa da cobrança ÷ créditos`; `contribuição = receita − imposto − taxa − R$ 9`; `margem = contribuição ÷ receita`.

| Oferta | Receita/evento | Contribuição (Pix) | Margem (Pix) | Margem (cartão) |
|---|---|---|---|---|
| Essencial (3) | R$ 39,00 | R$ 26,99 | 69,2% | 67,5% |
| Atelier (7) | R$ 28,14 | R$ 17,17 | 61,0% | 58,8% |
| Maison (17) | R$ 23,35 | R$ 12,83 | 54,9% | 52,3% |
| Tíquete B2C (R$ 97) | R$ 97,00 | R$ 80,19 | 82,7% | 81,2% |

- Implementação: `lib/pricing.ts` (cálculo puro) e `lib/plans.ts` (catálogo).
- Migração: `supabase/migrations/0005_plan_pricing.sql`; seed idêntico.
- Guarda de regressão: `tests/unit/pricing.test.ts` falha o CI se um plano furar o piso (Pix **ou** cartão).
- Mudança de custo/preço exige atualizar **premissas + migração + seed + docs no mesmo PR**.

---

## 4. Livro-razão de créditos (`credit_ledger`)

```sql
create table public.credit_ledger (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces(id),
  entry_type text not null check (entry_type in
    ('grant','topup','consume','refund','expire','adjust')),
  amount_cents bigint not null,            -- +credito / -debito
  balance_after_cents bigint not null,     -- saldo do workspace após o lançamento
  expires_at timestamptz,                  -- apenas grant de franquia
  source_payment_id uuid null references public.payments(id),
  source_subscription_id uuid null references public.subscriptions(id),
  event_id uuid null references public.events(id),
  idempotency_key text not null unique,    -- ex.: 'grant:sub_id:2026-10'
  note text,
  created_at timestamptz not null default now()
);

-- Guarda de integridade: saldo nunca negativo (trigger AFTER INSERT
-- recalcula e RAISE EXCEPTION se balance_after_cents < 0).
-- Lançamentos são IMUTÁVEIS: correção = novo lançamento ('adjust').
```

**Regra de consumo (crédito por evento)**:

1. **Consumo ocorre na ATIVAÇÃO do evento**, não no rascunho. Criar evento rascunho é gratuito e ilimitado (com fair-use).
2. **Reserva com TTL**: ativação inicia transação → lance `-consume` imediato; se o checkout da franquia ainda não liquidou (raro), usa-se **reserva** com TTL de 15 min (`reservation` em memória/Redis): confirmada em `consume` ou liberada em `release`. Nunca “crédito negativo temporário”.
3. Reembolso/cancelamento de evento antes da primeira cotação emitida → lance `+refund` vinculado ao `consume` original (chave derivada).
4. Ordem de consumo: **FIFO por expiração** (créditos que vencem primeiro são consumidos primeiro) — implementado na consulta de saldo disponível.

---

## 5. Inadimplência e cancelamento (B2B)

| Situação | Efeito |
|---|---|
| Fatura `OVERDUE` no ciclo | Sem concessão do ciclo; workspace em `grace`: leitura total, **disparos suspensos** |
| Regularização | Concessão retroativa do ciclo + saída de `grace` |
| Cancelamento pelo cliente | Assinatura encerrada no fim do ciclo atual; créditos já concedidos permanecem até expirarem (sem reembolso de franquia) |
| Chargeback | Estorno dos créditos do ciclo (`-adjust`) e workspace suspenso até resolução |
| Reembolso de top-up | Somente integral, em 7 dias, se **nenhum** crédito do pacote foi consumido |

---

## 6. Reembolsos (política unificada)

- **B2C**: direito de arrependimento (CDC, art. 49) em **7 dias** da compra, **desde que nenhuma cotação tenha sido emitida** para o evento. Emitida a primeira cotação, o serviço foi iniciado — sem reembolso (termo claro no checkout).
- **B2B**: mensalidade não reembolsável após concessão do ciclo (serviço disponível); top-ups conforme §5.
- **Execução**: reembolso sempre pela API Asaas (`/payments/{id}/refund`); webhook `PAYMENT_REFUNDED` → worker reverte (`event_tickets→refunded` ou `-adjust`/`+refund` no ledger) **na mesma transação** com o feed `payment.refunded`.
- **Chargeback**: trata como `chargeback` (congela efeitos), revisão manual — nunca automática.

---

## 7. Anti-abuso e fair-use

1. Máx. **1 checkout pendente** por evento/profile; máx. 5 checkouts abandonados/hora por profile (rate limit).
2. Rascunhos gratuitos: máx. 20 ativos por profile B2C (limpeza assistida acima disso).
3. Disparos WhatsApp contam com rate limiting próprio ([WHATSAPP_EVOLUTION.md](WHATSAPP_EVOLUTION.md)) e exigem consentimento do destinatário.
4. Suspeita de fraude: acionar antifraude Asaas (`risk_review`), **sem conceder efeitos** até resolução.
5. Uso comercial de conta B2C por planner: um CNPJ por workspace no futuro (hoje CPF, ver [PAYMENTS.md](PAYMENTS.md) §9).

---

## 8. Exemplos numéricos (trabalhados)

1. **B2C**: preço `9700`. Pix criado 10:00, expira 10:30. Pagamento 10:12 → webhook `PAYMENT_RECEIVED` 10:12+~s → tíquete `active`; saldo B2C não é conceito (tíquete é por evento).
2. **B2B concessão**: plano `atelier` (7 créditos) confirmado em 05/10 → lançamento `+700` centavos no ledger (7 créditos × 100 centavos cada — **1 crédito = R$ 1,00 de evento**), com `idempotency_key='grant:<sub>:2026-10'`. Replay do webhook → no-op.
3. **Consumo**: planner ativa evento 12/10 → `-1` crédito (`-100`), FIFO consome do lote que vence primeiro. Evento cancelado 13/10 sem cotações → `+100` (`refund`, chave derivada `refund:<consume_id>`).
4. **Expiração**: ciclo seguinte pago em 05/11 (+7). Restavam 3 do ciclo de out/25 → job em 06/11 varre: 3 expiram, feed `credits.expired`, saldo final 7 (os novos) + top-ups.

---

## 9. Testes obrigatórios

- Concessão idempotente por ciclo (replay de webhook) — 1 lançamento.
- Consumo FIFO respeitando expiração (lotes antigos primeiro).
- Trigger de saldo: tentativa de consumo além do saldo → exception, zero efeito.
- Reserva: TTL expira → `release`, saldo intacto; confirmação → `consume` único.
- Reembolso B2C após cotação emitida → **bloqueado** com motivo auditável.
- Expiração não afeta top-ups.
- Todos os valores em centavos inteiros; nenhuma conversão com float no caminho.
