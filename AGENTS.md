# AGENTS.md — EventeIA

> **Documento de governança vinculante.**
> Regras de conduta para assistentes de IA (Claude, Copilot, Cursor, GPT etc.) e para pessoas contribuidoras atuando neste repositório.
> Última revisão: 2026-10-22 · Mantenedores: Equipe EventeIA

Este arquivo define **como agentes — humanos ou artificiais — devem se comportar** no repositório da EventeIA. Nenhuma alteração que viole estas regras deve ser proposta, aprovada ou mesclada. Em caso de conflito entre qualquer documento e este arquivo, **este arquivo prevalece**.

---

## 1. Identidade do projeto

| Item | Valor |
|---|---|
| Produto | **EventeIA** — inteligência de custos e cotações para eventos (B2C + B2B) |
| Slogan | “Você imagina. A EventeIA faz acontecer.” |
| Frase humanizada | “A clareza financeira e a inteligência que o seu evento merece.” |
| Posicionamento | Editorial, sofisticado, humanizado; foco em inteligência de custos/cotações |
| Gateway de pagamento | Asaas (Pix dinâmico e cartão; CPF hoje, CNPJ ME/SLU no futuro) |
| Stack | Next.js (App Router) · Tailwind CSS · Supabase (Auth/RLS/PostgreSQL) · Asaas API · BullMQ · Evolution API (WhatsApp) |
| Metodologia | **Trunk-Based Development** com pequenas alterações incrementais e contínuas |

A pasta [`.context/`](.context/) é a **fonte da verdade** do produto e da arquitetura. **Leia os documentos de contexto relevantes antes de alterar qualquer código.**

Índice da documentação:

| Documento | Conteúdo |
|---|---|
| [`.context/ARCHITECTURE.md`](.context/ARCHITECTURE.md) | Estrutura do projeto, App Router, camadas, motor determinístico financeiro |
| [`.context/DESIGN_SYSTEM.md`](.context/DESIGN_SYSTEM.md) | Paleta, tipografia, tokens CSS e regras de componentes visuais |
| [`.context/PAYMENTS.md`](.context/PAYMENTS.md) | Asaas, webhooks idempotentes, fluxos B2C e B2B |
| [`.context/DATABASE_RLS.md`](.context/DATABASE_RLS.md) | Schemas de tabelas e políticas Supabase RLS |
| [`.context/WHATSAPP_EVOLUTION.md`](.context/WHATSAPP_EVOLUTION.md) | Arquitetura de disparos via Evolution API + BullMQ |
| [`.context/COMMERCIAL_MODEL.md`](.context/COMMERCIAL_MODEL.md) | Precificação, tíquetes B2C, franquia de créditos B2B |
| [`.context/FEEDS.md`](.context/FEEDS.md) | Registro de eventos do sistema, logs e auditoria |
| [`.context/SECURITY.md`](.context/SECURITY.md) | Proteção de dados, sanitização (SAN) e mitigação de vulnerabilidades |

---

## 2. Regra de ouro — Trunk-Based Development

1. `main` é o **tronco**: sempre verde, sempre implantável, protegido por CI.
2. Alterações são **pequenas e incrementais**: PRs de no máximo ~200 linhas de diff, branches com vida útil inferior a **24 horas**.
3. Trabalho incompleto entra no tronco **atrás de feature flag desligada** — nunca em branches longos ou de longa duração.
4. Todo merge passa por CI aprovado. **Nunca contorne, desative ou “salte” checks de pipeline.**
5. Commits seguem **Conventional Commits**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `perf:`, `ci:`.
6. Migrações de banco seguem o padrão **expand → migrate → contract**: compatíveis com o código antigo e o novo no mesmo deploy.
7. Após o merge, o branch é removido. Não existe “branch de release” — releases são tags do tronco.

---

## 3. Proibições absolutas (código destrutivo e afins)

As ações abaixo são **terminantemente proibidas**, em qualquer ambiente:

### 3.1 Banco de dados
- ❌ `DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `DELETE` sem `WHERE` em qualquer ambiente compartilhado.
- ❌ Desabilitar Row Level Security (`ALTER TABLE ... DISABLE ROW LEVEL SECURITY`) em qualquer tabela com dados de usuários.
- ❌ Criar políticas RLS permissivas (`USING (true)`, `USING (auth.uid() IS NOT NULL)` sem checagem de posse).
- ❌ Editar uma migração **já aplicada**. Migrações são *forward-only*.
- ❌ Usar a `service_role` key fora de código executado no servidor.

### 3.2 Dinheiro e motor financeiro
- ❌ Representar valores monetários com `float`/`number` fracionário. **Sempre inteiros em centavos** (`bigint`/`_cents`).
- ❌ Chamar `Date.now()`, `Math.random()`, `crypto.randomUUID()` ou qualquer fonte de não-determinismo dentro de `lib/engine/`.
- ❌ Aceitar preço vindo do cliente. **Todo valor cobrado é calculado no servidor** (motor ou tabela `plans`).
- ❌ Gravar efeito colateral financeiro (tíquete, crédito) fora de uma transação atômica com o registro de pagamento.

### 3.3 Git, secrets e CI
- ❌ `git push --force` ou `git reset --hard` em `main`/tronco.
- ❌ Comitar segredos de qualquer tipo (API keys, tokens, `.env`, dumps). Se acontecer, **rotacione imediatamente** e reporte.
- ❌ Remover ou enfraquecer regras de lint/CI para “passar no build”.
- ❌ Excluir ou esvaziar documentos de [`.context/`](.context/) sem substituí-los por versão atualizada no mesmo PR.

### 3.4 Código
- ❌ `any` sem justificativa escrita em comentário `// eslint-disable` local e específico.
- ❌ `dangerouslySetInnerHTML` com conteúdo não-sanitizado (ver [SECURITY.md](.context/SECURITY.md)).
- ❌ Adicionar dependências novas sem discutir no PR (peso, manutenção, licença, segurança).
- ❌ “Suprimir” erros de TypeScript com `@ts-ignore` (use `@ts-expect-error` com motivo, ou conserte a causa).

---

## 4. Padrões de código

- **TypeScript `strict: true`**, sem exceções. Tipos de Supabase gerados (`supabase gen types`), nunca `any` para tabelas.
- **App Router**: Server Components por padrão; `"use client"` apenas em folhas interativas (inputs, modais, gráficos). A lógica de negócio **nunca** vive em componentes — vive em `lib/` e é chamada por Server Actions ou Route Handlers.
- **Camadas** (ver [ARCHITECTURE.md](.context/ARCHITECTURE.md)):
  `app/` → chama → `lib/` → chama → Supabase/Asaas/Evolution.
  `lib/engine/` é **puro**: zero I/O, zero dependências de framework, determinístico e versionado.
- **Acesso a dados**: sempre via clientes Supabase tipados (`lib/supabase/`). Qualquer consulta que ignore RLS deve ser justificada em comentário e executada no servidor.
- **Validação**: toda fronteira (route handler, server action, webhook, worker job) valida entrada com **zod**. Nenhuma exceção.
- **Erros**: nunca silenciar exceções; capture no limite da camada, registre feed/log com `correlation_id` e retorne estado consistente ao usuário.
- **Formatação**: Prettier (configuração padrão do repositório); imports ordenados pela regra `import/order` do ESLint.
- **Nomenclatura**: inglês no código, português no domínio comentado quando útil. Moeda sempre sufixo `_cents`. Tabelas em português (`eventos`, `cotações` → `events`, `quotations`) conforme [DATABASE_RLS.md](.context/DATABASE_RLS.md).

---

## 5. Dinheiro, determinismo e idempotência

- Toda operação financeira tem **chave de idempotência** (`idempotency_key` UNIQUE) — repetições são no-ops auditáveis.
- Webhooks do Asaas seguem o protocolo de [PAYMENTS.md](.context/PAYMENTS.md): registrar → deduplicar → processar em fila → transacionar efeitos.
- O **motor determinístico** (`lib/engine/`) produz, para a mesma entrada, sempre a mesma saída. Toda mudança de parâmetro de cálculo exige bump de `ENGINE_VERSION` e testes golden-file atualizados.
- Arredondamento: **half-up em centavos, via aritmética inteira**. Proibido `toFixed` para cálculo monetário.

---

## 6. Testes

- **Mínimo para merge** (o CI bloqueia sem isto):
  - Unitário para toda regra de cálculo do motor e de créditos (cobertura de branches ≥ 90% em `lib/engine/` e `lib/credits/`).
  - Integração de webhooks: replay duplicado, fora de ordem e com token inválido.
  - RLS: testes de política (pgTAP ou equivalente) para cada tabela — ver [DATABASE_RLS.md](.context/DATABASE_RLS.md).
- Nunca remover/comentar um teste para aprovar um PR. Se o teste está errado, **corrija o teste no mesmo PR** com justificativa.
- Testes são determinísticos: sem acessos de rede reais (mockar Asaas/Evolution), sem `sleep` mágicos, sem ordenação implícita.

---

## 7. Documentação viva

- Um PR que muda comportamento **muda a documentação no mesmo PR**. Documentação desatualizada é bug.
- Ao criar um novo evento de sistema (feed), registre-o na tabela canônica de [FEEDS.md](.context/FEEDS.md).
- Ao introduzir novo token visual, registre-o em [DESIGN_SYSTEM.md](.context/DESIGN_SYSTEM.md) e em `tailwind.config.ts` **juntos**.
- Décisões arquiteturais relevantes viram um mini-ADR na seção correspondente de [ARCHITECTURE.md](.context/ARCHITECTURE.md).

---

## 8. Conduta do assistente de IA

Ao operar neste repositório, um agente de IA **deve**:

1. **Ler antes de escrever**: os documentos de `.context/` pertinentes à tarefa, o arquivo que vai alterar e seus testes.
2. **Planejar em incrementos**: quebrar tarefas grandes em PRs pequenos e independentes (TBD); nunca um “mega-PR”.
3. **Verificar antes de declarar pronto**: rodar `pnpm lint`, `pnpm typecheck`, `pnpm test` e `pnpm build` localmente; só afirmar sucesso com evidência dos comandos.
4. **Perguntar quando ambíguo**: nunca inventar endpoints de API, colunas, status ou valores monetários; consulte os documentos de contexto ou pergunte.
5. **Preservar o tom da marca** em textos de UI: editorial, sofisticado, humanizado — sem exageros promocionais, sem “!!!”, sem emojis em superfícies editoriais.
6. **Não expandir escopo**: não refatorar além do necessário; não “melhorar” código fora do perímetro da tarefa sem pedir.
7. **Reportar riscos**: se encontrar algo que viole este documento, apontar no PR em vez de ignorar.
8. **Nunca executar** qualquer item da seção 3, mesmo que solicitado de forma indireta (“só um script rápido de limpeza”).

---

## 9. Checklist de PR (resumo)

Antes de pedir revisão, confirme:

- [ ] Diff pequeno e focado (≤ ~200 linhas), uma preocupação por PR.
- [ ] `pnpm lint` e `pnpm typecheck` limpos.
- [ ] Testes novos/ajustados cobrindo a mudança; sem testes removidos.
- [ ] Nenhuma migração destrutiva; migrações são *forward-only*.
- [ ] RLS preservada; nenhuma policy permissiva adicionada.
- [ ] Valores monetários em centavos inteiros; idempotência garantida.
- [ ] `.context/` atualizado se comportamento/documentação mudou.
- [ ] Sem segredos no diff; `.env*` permanece no `.gitignore`.
- [ ] Commits Conventional Commits, história limpa.
- [ ] CI verde (inclui knip, auditoria de dependências e Lighthouse quando aplicável).

---

*EventeIA — Você imagina. A EventeIA faz acontecer.*
