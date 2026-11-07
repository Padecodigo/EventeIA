# TASKS — handoff do agente

> Atualize ao encerrar a sessão: o que ficou pronto, o que está travado, qual o próximo passo.
> Última atualização: 2026-11-07 08h00 (America/Sao_Paulo).

## Estado do tronco

- `main` = `b294f71` (`fix(copy): como-funciona step 3`, #205) — **é o que está em produção**.
- `/204` entregou o orçamento único de menor preço (engine, painel, impressão/CSV, marketing,
  notificações). `/205` fechou o texto do passo 03 em `/como-funciona`.
- Deploy confirmado pelo Coolify em 07/11 07:45: site e serviço de tarefas saudáveis.
- **Migração `0083` já aplicada. NÃO reaplicar.** Duas exclusões auditadas de registros
  redundantes já foram feitas. **NÃO repetir.**

## Prontos, aguardando janela de deploy

- [ ] **[PR #206](https://github.com/Padecodigo/EventeIA/pull/206)** — `components/marketing/trust-strip.tsx`
      ainda dizia "faixa mínima, sugestão e teto" (mesma promessa de 3 opções corrigida no #205).
      CI verde (Qualidade, RLS, Lighthouse).
- [ ] **[PR #207](https://github.com/Padecodigo/EventeIA/pull/207)** — o `Imprimir / salvar PDF`
      herdava o chrome do painel (header, banners, rodapé, radial-gradient). Adiciona
      `print:hidden` no layout, `@page` A4 16mm, `tr` sem quebra e paleta clara forçada na impressão.
      `pnpm build` e `tsc --noEmit` exit 0; CI: Qualidade e RLS verdes.

> Regra: merge só junto com deploy (app + worker). Mergear sem deploy deixa `main` à frente da
> produção. Ver decisão 007 em `DECISIONS.md`.

## Pendências (ordem definida pelo dono)

- [ ] **Validar painel autenticado e impressão** — não podem prometer três orçamentos. A tentativa
      anterior de login abortou; falta a validação visual real. `BudgetTable` (painel) ainda exibe
      colunas Mínimo/Sugerido/Teto do motor estimado — decidir se é "faixa estimada" legítima ou
      resíduo a remover.
- [ ] **Diagnóstico do `permission_or_token`** na exclusão automática da Meta. `classifyDeleteFailure`
      (`lib/meta/publishing.ts`) agrupa `401/403`, `190`, `10` e `200` no mesmo kind — e o ramo
      `missing_permission` é **inalcançável**, porque qualquer 401/403 retorna antes.
- [ ] **Limpeza de publicações** — buffet `17875462215638458` sem confirmação; decor
      `18026996645916620` e space `17971549067960951` não tocados. Instagram drinks/cake já
      confirmados: não refazer. Não inferir remoção por ausência de registro.
- [ ] **4 posts + 4 stories + 4 reels/dia por canal** (Facebook e Instagram), com logo, sem repetir
      imagem. Avaliar geração gratuita; não contratar serviço pago.
- [ ] **TikTok**: avaliar publicação e busca de fornecedores sem custo.
- [ ] **Código de contratante vs. fornecedor** — hoje um código só confirma/publica; falta separar o
      do fornecedor que registra interesse/disponibilidade.
- [ ] **Pendências do App Review da Meta**.

## Lixo limpo em 07/11 (não reabrir)

- 49 branches remotas obsoletas excluídas (48 com PR mergeado + `feat/prospecting-messenger-agent`,
  cujo #126 foi fechado sem merge e cuja funcionalidade entrou nos #178–#199). Restam 6.
- `.xdg/` (store pnpm órfão, 873 MB), `.next/`, `dist/`, `tsconfig.tsbuildinfo`.

## Ambiente (Fedora do Allan)

- GitHub CLI `2.103.3` autenticado em `Padecodigo` com escopo `repo`; token no **keyring**
  (o `hosts.yml` não recebe o token neste sandbox — é esperado, não é falha).
- Node `v22.23.4` · pnpm `12.14.0` · `node_modules` presente · `.pnpm-store/` ativo (não apagar).
- `.env.local` existe e é ignorado pelo Git. Segredos nunca em prompt, log ou commit.
- CodeGraph: `npx -y @sdsrs/code-graph` (índice em `.code-graph/`, fora do Git).
- ai-memory: `npx -y ai-memory-mcp` (raiz `.ai-memory/`).
- Guia: [`.context/AGENT_TOOLING.md`](../.context/AGENT_TOOLING.md).

## Último estado de produção

- Commit `b294f71` · site e serviço de tarefas saudáveis (Coolify, 07/11 07:45).
- Login/painel **não** validados visualmente. Não declarar validado sem prova.
