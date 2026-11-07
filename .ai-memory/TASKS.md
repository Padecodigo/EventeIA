# TASKS — handoff do agente

> Atualize ao encerrar a sessão: o que ficou pronto, o que está travado, qual o próximo passo.
> Última atualização: 2026-11-07 15h55 (America/Sao_Paulo).

## Produto hoje (decisões fechadas)

- **Um produto: tíquete por evento.** R$ 97, pagamento único, Pix ou cartão. Sem assinatura, sem
  franquia de créditos, sem planos para planners. `/para-planners` foi removida (301 → `/planos`).
- **Um único orçamento**, no menor preço válido, com taxas incluídas (engine + painel + impressão + CSV).
- **Cupom só por campanha sazonal**, com teto de **30%**. A faixa automática de "cupom sorteado" saiu
  do site; a criação é pelo `/admin/cupons`.
- **Funil:** descrever o evento → pagar o tíquete → entrevista/prospecção. Sem tíquete `active` a
  entrevista redireciona e o código `EVT-…` não aparece.
- **Home v2** (mobile-first): hero com foto de festa infantil, CTA fixo no rodapé, exemplo de
  orçamento, festa infantil em destaque, os 4 depoimentos preservados.

## Estado do tronco

- `main` = `dba1018` (ver `git log -1`); produção roda o deploy do #219.
- Deploy: `POST /api/v1/deploy?uuid=ozqnl541gzloqhsqvpjtqa8l` no Coolify (token em
  `/root/.coolify_token` na VPS `root@200.141.28.13`, chave `~/.ssh/eventeia_vps`).
  Um único compose sobe app + worker + Redis.
- **Migração `0083` já aplicada. NÃO reaplicar.** Duas exclusões auditadas já feitas. **NÃO repetir.**

## Verificado em produção (07/11)

- `/api/health` 200; app, worker e Redis `healthy`.
- Aba **Comprar**: mostra o checkout do evento pendente (Pix/cartão) ou "Criar meu evento".
- Página do evento: checkout "Comprar ticket do evento"; entrevista e `EVT-…` só com tíquete pago.
- Sessão real (Supabase magic link) usada para validar; **sessão revogada** ao final.

## Pendências (ordem definida pelo dono)

- [ ] **Diagnóstico `permission_or_token`** na exclusão automática da Meta. `classifyDeleteFailure`
      (`lib/meta/publishing.ts`) agrupa `401/403`, `190`, `10` e `200` no mesmo kind; o ramo
      `missing_permission` é inalcançável.
- [ ] **Limpeza de publicações** — buffet `17875462215638458` sem confirmação; decor
      `18026996645916620` e space `17971549067960951` não tocados. Drinks/cake confirmados: não refazer.
- [ ] **4 posts + 4 stories + 4 reels/dia por canal**, sem repetir imagem, com logo. Avaliar geração gratuita.
- [ ] **TikTok**: publicação e busca de fornecedores sem custo.
- [ ] **Código de contratante vs. fornecedor** (hoje um código só confirma/publica).
- [ ] **Pendências do App Review da Meta**.

## Armadilhas aprendidas (não repetir)

- `search_start_date` do evento **precisa ser dia útil** (`addBusinessDays`), senão o banco recusa
  com `22023` e a compra falha silenciosamente.
- `next/image` com `quality` fora de `images.qualities` (70/75) devolve **400** e a imagem nasce
  quebrada em produção. Guarda em `tests/unit/image-quality.test.ts`.
- Coral `#E8575A` com texto branco dá **3,53:1** e reprova AA: o CTA usa `#C24145` (5,08:1).
- Arquivos temporários de teste (`*.mjs`, cookies de sessão) **nunca** dentro do repo: ele é público.
  Usar `os.tmpdir()` — um `.ck.json` foi commitado por engano e a sessão precisou ser revogada.

## Ambiente (Fedora do Allan)

- GitHub CLI autenticado em `Padecodigo` (token no keyring).
- Node `v22.23.4` · pnpm `12.14.0`. Supabase local **resetado** (83 migrações + seed); pgTAP `PASS`.
- CLI do Supabase neste sandbox: `HOME=$PWD/.sbhome npm_config_cache=$PWD/.npm-cache npx -y supabase@latest …`.
- `.env.local` existe e é ignorado pelo Git. Segredos nunca em prompt, log ou commit.
