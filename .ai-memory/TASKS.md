# TASKS — handoff do agente

> Atualize ao encerrar a sessão: o que ficou pronto, o que está travado, qual o próximo passo.
> Última atualização: 2026-11-09 12h (America/Sao_Paulo).

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

- `main` = `bac69f2` (ver `git log -1`); produção deployada junto (app + worker + Redis).
- Deploy: `POST /api/v1/deploy?uuid=ozqnl541gzloqhsqvpjtqa8l` no Coolify (token em
  `/root/.coolify_token` na VPS `root@200.141.28.13`, chave `~/.ssh/eventeia_vps`).
  Um único compose sobe app + worker + Redis.
- **Migrações `0084` (tiktok_oauth_tokens) e `0085` (ticket_purchases) já aplicadas e registradas
  em `schema_migrations`. NÃO reaplicar.**

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
- [x] **4 posts + 4 stories + 4 reels/dia por canal**, sem repetir imagem, com logo (autopilot 4h,
      stories 9:16 e reels ffmpeg — PRs #226/#227/#228).
- [x] **TikTok — publicidade** (Login Kit + Content Posting API, rascunho inbox): conexão, upload,
      webhook assinado e verificação de domínio prontos. **Escopo = só publicidade** (decisão #013);
      descoberta de fornecedores NÃO vai pro TikTok. Falta: gravar demo para review e aprovar o app.
- [x] **Ticket avulso**: comprar ticket sem evento e consumir na ativação (PR #231, migração `0085`).
- [x] **Arte publicitária híbrida** (decisão #015): FLUX gera só a cena (única), sharp sobrepõe o
      anúncio (título serifado + cards, ou quadro editorial sem cards). Sem `letter-spacing` no SVG.
- [x] **Criativos de rede**: posts 1080×1350 restaurados de `7bf6f98` (o chip de `7df7e97` era a
      regressão). Stories e quadros de reel 1080×1920 no mesmo padrão editorial (`pnpm brand:art` /
      `pnpm brand:reels`). Publicação continua nos mesmos caminhos.
- [ ] **FLUX.1-dev em rate limit** (HTTP 500 no endpoint grátis) — quando voltar, o híbrido gera cena
      única; enquanto isso, a publicidade cai no fallback estático (`artForEventType`).
- [ ] **Código de contratante vs. fornecedor** (hoje um código só confirma/publica).
- [ ] **Pendências do App Review da Meta**.

## Armadilhas aprendidas (não repetir)

- `search_start_date` do evento **precisa ser dia útil** (`addBusinessDays`), senão o banco recusa
  com `22023` e a compra falha silenciosamente.
- `next/image` com `quality` fora de `images.qualities` (70/75) devolve **400** e a imagem nasce
  quebrada em produção. Guarda em `tests/unit/image-quality.test.ts`.
- Coral `#E8575A` com texto branco dá **3,53:1** e reprova AA: o CTA usa `#C24145` (5,08:1).
- FLUX.1-dev (nuvem NVIDIA) só aceita dimensões fixas **768–1344**; o código mapeia quadrado→`1024×1024`
  e vertical→`768×1344` em `lib/nvidia/image.ts`.
- NVIDIA `seed:0` é determinístico → `randomSeed()` por chamada em `lib/marketing/autopilot-art.ts`
  (senão post/story/reel repetem a mesma cena e o dedup bloqueia).
- SVG com `letter-spacing` no banner causa **"texto atrás do texto"** no sharp/librsvg — removido.
- Arquivos temporários de teste (`*.mjs`, cookies de sessão) **nunca** dentro do repo: ele é público.
  Usar `os.tmpdir()` — um `.ck.json` foi commitado por engano e a sessão precisou ser revogada.

## Ambiente (Fedora do Allan)

- GitHub CLI autenticado em `Padecodigo` (token no keyring).
- Node `v22.23.4` · pnpm `12.14.0`. Supabase local **resetado** (83 migrações + seed); pgTAP `PASS`.
- CLI do Supabase neste sandbox: `HOME=$PWD/.sbhome npm_config_cache=$PWD/.npm-cache npx -y supabase@latest …`.
- `.env.local` existe e é ignorado pelo Git. Segredos nunca em prompt, log ou commit.
